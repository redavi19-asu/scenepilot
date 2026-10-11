import Stripe from "stripe";

export const STRIPE_API_VERSION = "2026-08-26.dahlia";
export const DIRECTOR_MONTHLY_CENTS = 3999;
const response = (data, status = 200) => new Response(JSON.stringify(data), { status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export function stripeConfig(env) {
  return { ready: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_ID && env.STRIPE_WEBHOOK_SECRET),
    priceId: String(env.STRIPE_PRICE_ID || ""), amount: DIRECTOR_MONTHLY_CENTS };
}

function client(env) {
  return new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION, httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 2 });
}

export function subscriptionState(subscription, priceId, now = Date.now()) {
  const item = subscription.items?.data?.find(value => value.price?.id === priceId);
  if (!item) throw new Error("Subscription does not include the Director price.");
  const expiresAt = Number(item.current_period_end || subscription.current_period_end || 0) * 1000;
  const periodStart = Number(item.current_period_start || subscription.current_period_start || 0) * 1000;
  return { active: ["active", "trialing"].includes(subscription.status) && expiresAt > now,
    expiresAt, periodStart, status: subscription.status, customer: typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id };
}

async function applySubscription(env, subscription) {
  const state = subscriptionState(subscription, env.STRIPE_PRICE_ID);
  // Ownership is resolved from the Stripe customer ID persisted before checkout.
  const owner = await env.DB.prepare("SELECT user_id FROM director_stripe_customers WHERE customer_id = ?").bind(state.customer).first();
  if (!owner) return;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO director_stripe_subscriptions (subscription_id,user_id,customer_id,status,period_start,expires_at,updated_at)
      VALUES (?,?,?,?,?,?,?) ON CONFLICT(subscription_id) DO UPDATE SET status=excluded.status,period_start=excluded.period_start,expires_at=excluded.expires_at,updated_at=excluded.updated_at`)
      .bind(subscription.id, owner.user_id, state.customer, state.status, state.periodStart, state.expiresAt, Date.now()),
    env.DB.prepare(`UPDATE user_products SET plan=?,access_status=?,source='stripe',expires_at=?
      WHERE user_id=? AND product_id='product_scenepilot'
      AND (source='stripe' OR access_status IN ('pending','suspended'))
      AND user_id NOT IN (SELECT id FROM users WHERE role IN ('owner','admin'))
      AND NOT EXISTS (SELECT 1 FROM director_stripe_subscriptions s WHERE s.user_id=? AND s.subscription_id<>? AND s.status IN ('active','trialing') AND s.expires_at>?)`)
      .bind(state.active ? "pro" : "free", state.active ? "active" : "suspended", state.expiresAt,
        owner.user_id, owner.user_id, subscription.id, Date.now())
  ]);
}

export async function stripeWebhook(request, env, stripe = client(env)) {
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(await request.text(), request.headers.get("stripe-signature") || "",
      env.STRIPE_WEBHOOK_SECRET, undefined, Stripe.createSubtleCryptoProvider());
  } catch { return response({ error: "Invalid Stripe signature." }, 400); }
  const existing = await env.DB.prepare("SELECT id FROM director_stripe_events WHERE id=?").bind(event.id).first();
  if (existing) return response({ received: true });
  const object = event.data.object;
  let subscriptionId;
  if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
    if (!["paid", "no_payment_required"].includes(object.payment_status) || object.mode !== "subscription") {
      return response({ received: true });
    }
    subscriptionId = object.subscription;
  } else if (event.type.startsWith("customer.subscription.")) subscriptionId = object.id;
  else if (["invoice.paid", "invoice.payment_failed"].includes(event.type)) {
    subscriptionId = object.parent?.subscription_details?.subscription || object.subscription;
  }
  if (subscriptionId) {
    // Retrieve authoritative current state: delayed/out-of-order events cannot revive an old subscription.
    const subscription = await stripe.subscriptions.retrieve(typeof subscriptionId === "string" ? subscriptionId : subscriptionId.id);
    if (subscription.items?.data?.some(item => item.price?.id === env.STRIPE_PRICE_ID)) await applySubscription(env, subscription);
  }
  await env.DB.prepare("INSERT OR IGNORE INTO director_stripe_events (id,processed_at) VALUES (?,?)").bind(event.id, Date.now()).run();
  return response({ received: true });
}

export async function handleStripeBilling(request, env, user, stripeOverride) {
  const path = new URL(request.url).pathname;
  const config = stripeConfig(env);
  if (path === "/api/billing/stripe/config" && request.method === "GET") return response({ ...config, priceId: undefined, currency: "usd" });
  if (!config.ready) return response({ error: "Online subscriptions are being configured. Please contact support.", code: "stripe_not_configured" }, 503);
  if (path === "/api/billing/stripe/webhook" && request.method === "POST") return stripeWebhook(request, env);
  if (!user) return response({ error: "Sign in to manage your subscription." }, 401);
  if (request.method !== "POST") return response({ error: "Method not allowed." }, 405);
  const origin = new URL(request.url).origin;
  if (request.headers.get("Origin") !== origin) return response({ error: "Open billing from the Director website." }, 403);
  if (request.headers.get("X-Urban-Director-Platform") === "ios") return response({ error: "Use Apple subscription controls in the iPhone/iPad app." }, 400);
  const stripe = stripeOverride || client(env);
  let mapping = await env.DB.prepare("SELECT customer_id FROM director_stripe_customers WHERE user_id=?").bind(user.id).first();
  if (path === "/api/billing/stripe/portal") {
    if (!mapping) return response({ error: "No web subscription is linked to this account." }, 404);
    const portal = await stripe.billingPortal.sessions.create({ customer: mapping.customer_id, return_url: `${origin}/billing` });
    return response({ url: portal.url });
  }
  if (path !== "/api/billing/stripe/checkout") return response({ error: "Not found." }, 404);
  if (["owner", "admin"].includes(user.role) || user.accessStatus === "active") {
    return response({ error: "This account already has Director access. Manage its existing subscription instead." }, 409);
  }
  const price = await stripe.prices.retrieve(config.priceId);
  if (!price.active || price.unit_amount !== DIRECTOR_MONTHLY_CENTS || price.currency !== "usd" || price.recurring?.interval !== "month" || price.recurring?.interval_count !== 1) {
    return response({ error: "The Director price needs administrator attention." }, 503);
  }
  if (!mapping) {
    const customer = await stripe.customers.create({ email: user.email, name: user.displayName }, { idempotencyKey: `director-customer-${user.id}` });
    await env.DB.prepare("INSERT OR IGNORE INTO director_stripe_customers (user_id,customer_id) VALUES (?,?)").bind(user.id, customer.id).run();
    mapping = await env.DB.prepare("SELECT customer_id FROM director_stripe_customers WHERE user_id=?").bind(user.id).first();
  }
  const existingSubscriptions = await stripe.subscriptions.list({ customer: mapping.customer_id, status: "all", limit: 100 });
  const directorSubscriptions = existingSubscriptions.data.filter(subscription => subscription.items?.data?.some(item => item.price?.id === config.priceId));
  if (directorSubscriptions.some(subscription => ["active", "trialing", "past_due", "unpaid", "incomplete", "paused"].includes(subscription.status))) {
    return response({ error: "A subscription already exists. Use Manage Billing to resolve it." }, 409);
  }
  const session = await stripe.checkout.sessions.create({ mode: "subscription", customer: mapping.customer_id,
    line_items: [{ price: config.priceId, quantity: 1 }], client_reference_id: user.id,
    success_url: `${origin}/billing?checkout=success`, cancel_url: `${origin}/billing?checkout=cancelled`,
    integration_identifier: "urban_director_studio_qpmtxkza" },
    // A canceled subscription starts a new checkout cycle. Time buckets can
    // replay a completed/expired session when a customer restarts quickly.
    { idempotencyKey: `director-checkout-${user.id}-${directorSubscriptions[0]?.id || "initial"}` });
  return response({ url: session.url });
}
