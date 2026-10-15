import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { googleAccountId, googleSubscriptionState, googlePlayConfig, verifyGooglePurchase, handleGooglePlayBilling } from '../google-play-billing.js';
const expiry=new Date(Date.now()+86400000).toISOString();
const purchase=(overrides={})=>({subscriptionState:'SUBSCRIPTION_STATE_ACTIVE',acknowledgementState:'ACKNOWLEDGEMENT_STATE_PENDING',lineItems:[{productId:'director_pro_monthly',offerDetails:{basePlanId:'monthly'},expiryTime:expiry}],...overrides});
function environment(){
 const db=new DatabaseSync(':memory:');db.exec("PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY,role TEXT); INSERT INTO users VALUES('alice','user'),('bob','user'),('owner','owner'); CREATE TABLE user_products(user_id TEXT,product_id TEXT,plan TEXT,access_status TEXT,source TEXT,expires_at INTEGER); INSERT INTO user_products VALUES('alice','product_scenepilot','free','pending','manual',NULL),('bob','product_scenepilot','free','pending','manual',NULL),('owner','product_scenepilot','pro','active','admin',NULL)");
 const env={GOOGLE_PLAY_SERVICE_ACCOUNT_JSON:'test-not-sent',BROADCAST_CONFIG_KEY:'test-encryption-key',DB:{
  prepare(sql){let args=[];return {bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}};},
  async batch(statements){db.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}
 }};return {db,env};
}

test('only current active, grace-period, and canceled-but-unexpired subscriptions grant access',()=>{
 for(const state of ['ACTIVE','IN_GRACE_PERIOD','CANCELED'])assert.equal(googleSubscriptionState(purchase({subscriptionState:'SUBSCRIPTION_STATE_'+state})).active,true);
 for(const state of ['PENDING','ON_HOLD','PAUSED','EXPIRED'])assert.equal(googleSubscriptionState(purchase({subscriptionState:'SUBSCRIPTION_STATE_'+state})).active,false);
 const expired=purchase();expired.lineItems[0].expiryTime='2020-01-01T00:00:00Z';assert.equal(googleSubscriptionState(expired).active,false);
 assert.throws(()=>googleSubscriptionState(purchase({lineItems:[{productId:'another-product'}]})),/not the Director/);
});

test('verified purchase is acknowledged before access, token is encrypted, and repeats are idempotent',async()=>{
 const {db,env}=environment();let acknowledgements=0;
 const value=purchase({externalAccountIdentifiers:{obfuscatedExternalAccountId:await googleAccountId('alice')}});
 const api=async(_env,path,method)=>{if(method==='POST'){acknowledgements++;return {};}return value;};
 assert.equal((await verifyGooglePurchase(env,'alice','private-token',api)).active,true);
 assert.equal(acknowledgements,1);
 const row=db.prepare('SELECT * FROM director_google_subscriptions').get();assert.notEqual(row.encrypted_token,'private-token');assert.ok(!JSON.stringify(row).includes('private-token'));
 assert.equal(db.prepare("SELECT access_status FROM user_products WHERE user_id='alice'").get().access_status,'active');
 value.acknowledgementState='ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED';await verifyGooglePurchase(env,'alice','private-token',api);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM director_google_subscriptions').get().n,1);assert.equal(acknowledgements,1);db.close();
});

test('another account cannot claim a linked purchase or a mismatched Google account identifier',async()=>{
 const {db,env}=environment();const value=purchase({externalAccountIdentifiers:{obfuscatedExternalAccountId:await googleAccountId('alice')}});
 await verifyGooglePurchase(env,'alice','private-token',async()=>value);
 await assert.rejects(verifyGooglePurchase(env,'bob','private-token',async()=>value),/another Director account/);
 await assert.rejects(verifyGooglePurchase(env,'bob','other-token',async()=>value),/another Director account/);
 assert.equal(db.prepare("SELECT access_status FROM user_products WHERE user_id='bob'").get().access_status,'pending');db.close();
});

test('acknowledgement failure does not activate access',async()=>{
 const {db,env}=environment();const value=purchase({externalAccountIdentifiers:{obfuscatedExternalAccountId:await googleAccountId('alice')}});
 await assert.rejects(verifyGooglePurchase(env,'alice','private-token',async(_env,_path,method)=>{if(method==='POST')throw Error('Google unavailable');return value;}));
 assert.equal(db.prepare("SELECT access_status FROM user_products WHERE user_id='alice'").get().access_status,'pending');db.close();
});

test('expired Google subscription cannot suspend an active Apple subscription',async()=>{
 const {db,env}=environment();db.exec("UPDATE user_products SET source='apple',plan='pro',access_status='active' WHERE user_id='alice'");
 const value=purchase({subscriptionState:'SUBSCRIPTION_STATE_EXPIRED',externalAccountIdentifiers:{obfuscatedExternalAccountId:await googleAccountId('alice')}});
 await verifyGooglePurchase(env,'alice','private-token',async()=>value);
 assert.equal(db.prepare("SELECT source,access_status FROM user_products WHERE user_id='alice'").get().source,'apple');assert.equal(db.prepare("SELECT access_status FROM user_products WHERE user_id='alice'").get().access_status,'active');db.close();
});

test('missing credentials disable billing and unauthenticated requests cannot sync',async()=>{
 assert.equal(googlePlayConfig({}).ready,false);
 assert.equal((await handleGooglePlayBilling(new Request('https://app.invalid/api/billing/google/sync',{method:'POST'}),{},null)).status,401);
 assert.equal((await handleGooglePlayBilling(new Request('https://app.invalid/api/billing/google/sync',{method:'POST'}),{},{id:'alice'})).status,503);
});
