import test from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { handleStripeBilling, subscriptionState, stripeWebhook } from "../stripe-billing.js";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(fs.readFileSync("migrations/0001_ica_saas.sql", "utf8"));
  sqlite.exec(fs.readFileSync("migrations/0011_stripe_billing.sql", "utf8"));
  sqlite.exec("INSERT INTO users (id,email,password_hash,password_salt,created_at) VALUES ('u1','test@example.com','','','0'); INSERT INTO user_products (user_id,product_id,plan,access_status,source,created_at) VALUES ('u1','product_scenepilot','free','pending','signup','0'); INSERT INTO director_stripe_customers VALUES ('u1','cus_test');");
  const wrap = (sql, values = []) => ({ bind: (...args) => wrap(sql, args), first: async () => sqlite.prepare(sql).get(...values), run: async () => sqlite.prepare(sql).run(...values) });
  return { sqlite, DB: { prepare: sql => wrap(sql), batch: async statements => { sqlite.exec("BEGIN"); try { const values = await Promise.all(statements.map(statement => statement.run())); sqlite.exec("COMMIT"); return values; } catch (error) { sqlite.exec("ROLLBACK"); throw error; } } } };
}
test("Stripe entitlement follows item billing period and fails closed for other prices", () => {
  const subscription = { status: "active", customer: "cus_test", items: { data: [{ price: { id: "price_director" }, current_period_start: 10, current_period_end: 20 }] } };
  assert.equal(subscriptionState(subscription, "price_director", 15000).active, true);
  assert.equal(subscriptionState(subscription, "price_director", 20000).active, false);
  assert.throws(() => subscriptionState(subscription, "other"), /Director price/);
});
test("unconfigured checkout cannot create a charge or grant access", async () => {
  const response = await handleStripeBilling(new Request("https://urbandirectorstudio.com/api/billing/stripe/checkout", { method: "POST" }), {}, { id: "u1" });
  assert.equal(response.status, 503);
});
test("unsigned events are rejected and never touch the database", async () => {
  const response = await stripeWebhook(new Request("https://example.com/webhook", { method: "POST", body: "{}" }), { STRIPE_WEBHOOK_SECRET: "whsec_test" }, { webhooks: { constructEventAsync: async () => { throw new Error("signature"); } } });
  assert.equal(response.status, 400);
});
test("signed checkout/renewal events are idempotent; delayed events use current state and preserve manual access", async () => {
  const { sqlite, DB } = database();
  const env = { DB, STRIPE_PRICE_ID: "price_director", STRIPE_WEBHOOK_SECRET: "whsec_test" };
  const stripe = new Stripe("sk_test_unit_only");
  let status = "active", retrievals = 0;
  stripe.subscriptions.retrieve = async () => { retrievals++; return { id: "sub_test", customer: "cus_test", status, items: { data: [{ price: { id: "price_director" }, current_period_start: Math.floor(Date.now()/1000)-100, current_period_end: Math.floor(Date.now()/1000)+1000 }] } }; };
  const send = async (id, type) => {
    const payload = JSON.stringify({ id, type, data: { object: { id: "sub_test", subscription: "sub_test", mode: "subscription", payment_status: "paid" } } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: env.STRIPE_WEBHOOK_SECRET });
    return stripeWebhook(new Request("https://example.com/webhook", { method: "POST", body: payload, headers: { "stripe-signature": signature } }), env, stripe);
  };
  assert.equal((await send("evt1", "checkout.session.completed")).status, 200);
  assert.equal(sqlite.prepare("SELECT access_status FROM user_products").get().access_status, "active");
  await send("evt1", "checkout.session.completed");
  assert.equal(retrievals, 1);
  status = "canceled";
  await send("evt2", "customer.subscription.updated");
  assert.equal(sqlite.prepare("SELECT access_status FROM user_products").get().access_status, "suspended");
  sqlite.exec("UPDATE user_products SET access_status='active',source='comped',plan='pro'");
  await send("evt3", "customer.subscription.deleted");
  assert.equal(sqlite.prepare("SELECT source FROM user_products").get().source, "comped");
  sqlite.close();
});
