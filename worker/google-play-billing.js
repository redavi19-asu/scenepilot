const PACKAGE = 'com.icomputeranything.scenepilot';
const PRODUCT = 'director_pro_monthly';
const BASE_PLAN = 'monthly';
const json = (data,status=200) => new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export const GOOGLE_PLAY_SCHEMA = `CREATE TABLE IF NOT EXISTS director_google_subscriptions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  encrypted_token TEXT NOT NULL, product_id TEXT NOT NULL, subscription_state TEXT NOT NULL,
  expires_at INTEGER NOT NULL, last_verified_at INTEGER NOT NULL
)`;
export function googlePlayConfig(env) {
  return {ready:Boolean(env.GOOGLE_PLAY_BILLING_ENABLED === "true" && env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON && env.BROADCAST_CONFIG_KEY),packageName:PACKAGE,productId:PRODUCT,basePlanId:BASE_PLAN};
}
const bytes = value => new TextEncoder().encode(value);
const base64 = value => btoa(String.fromCharCode(...new Uint8Array(value)));
const unbase64 = value => Uint8Array.from(atob(value),c=>c.charCodeAt(0));
const encode = value => base64(bytes(JSON.stringify(value))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
export async function googleAccountId(userId) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(userId))),b=>b.toString(16).padStart(2,'0')).join('');
}
async function encryptionKey(env) {
  return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',bytes(env.BROADCAST_CONFIG_KEY)),{name:'AES-GCM'},false,['encrypt','decrypt']);
}
async function encryptToken(env,token) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  return base64(iv)+'.'+base64(await crypto.subtle.encrypt({name:'AES-GCM',iv},await encryptionKey(env),bytes(token)));
}
async function decryptToken(env,value) {
  const [iv,data]=value.split('.');
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(iv)},await encryptionKey(env),unbase64(data)));
}
async function accessToken(env) {
  const account=JSON.parse(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON);
  if(!account.client_email || !account.private_key) throw Error('Google Play verification is not configured.');
  const now=Math.floor(Date.now()/1000);
  const content=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:account.client_email,scope:'https://www.googleapis.com/auth/androidpublisher',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+300});
  const pem=account.private_key.replace(/-----[^-]+-----|\s/g,'');
  const key=await crypto.subtle.importKey('pkcs8',unbase64(pem),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const signature=base64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,bytes(content))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:content+'.'+signature})});
  const data=await response.json();
  if(!response.ok || !data.access_token) throw Error('Google Play verification credentials were rejected.');
  return data.access_token;
}
async function publisher(env,path,method='GET') {
  const token=await accessToken(env);
  const r=await fetch('https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'+PACKAGE+path,{method,signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(method==='POST'?{body:'{}'}:{})});
  const data=await r.text();
  if(!r.ok) throw Error('Google Play could not verify this purchase. Please try Restore Purchases.');
  return data?JSON.parse(data):{};
}
export function googleSubscriptionState(purchase,now=Date.now()) {
  const line=purchase.lineItems?.find(item=>item.productId===PRODUCT && item.offerDetails?.basePlanId===BASE_PLAN);
  if(!line) throw Error('This purchase is not the Director Pro monthly plan.');
  const expiresAt=Date.parse(line.expiryTime||'');
  if(!Number.isFinite(expiresAt)) throw Error('Google Play returned an invalid expiration date.');
  const active=['SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED'].includes(purchase.subscriptionState) && expiresAt>now;
  return {active,expiresAt,state:purchase.subscriptionState};
}
export async function verifyGooglePurchase(env,userId,token,api=publisher) {
  await env.DB.prepare(GOOGLE_PLAY_SCHEMA).run();
  const hash=await googleAccountId(token);
  const existing=await env.DB.prepare('SELECT user_id FROM director_google_subscriptions WHERE token_hash=?').bind(hash).first();
  if(existing && existing.user_id!==userId) throw Error('This Google Play subscription is linked to another Director account.');
  const purchase=await api(env,'/purchases/subscriptionsv2/tokens/'+encodeURIComponent(token));
  if(purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId!==await googleAccountId(userId)) throw Error('This purchase belongs to another Director account.');
  const state=googleSubscriptionState(purchase);
  if(state.active && purchase.acknowledgementState==='ACKNOWLEDGEMENT_STATE_PENDING') {
    await api(env,'/purchases/subscriptions/'+PRODUCT+'/tokens/'+encodeURIComponent(token)+':acknowledge','POST');
  }
  const encrypted=await encryptToken(env,token),now=Date.now();
  await env.DB.batch([
    // A conflicting owner is never overwritten, including concurrent restores.
    env.DB.prepare(`INSERT INTO director_google_subscriptions(token_hash,user_id,encrypted_token,product_id,subscription_state,expires_at,last_verified_at)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(token_hash) DO UPDATE SET encrypted_token=excluded.encrypted_token,
      subscription_state=excluded.subscription_state,expires_at=excluded.expires_at,last_verified_at=excluded.last_verified_at
      WHERE director_google_subscriptions.user_id=excluded.user_id`
    ).bind(hash,userId,encrypted,PRODUCT,state.state,state.expiresAt,now),
    env.DB.prepare(`UPDATE user_products SET plan=?,access_status=?,source='google',expires_at=?
      WHERE user_id=? AND product_id='product_scenepilot'
      AND (source='google' OR access_status IN ('pending','suspended'))
      AND user_id NOT IN (SELECT id FROM users WHERE role IN ('owner','admin'))
      AND EXISTS (SELECT 1 FROM director_google_subscriptions WHERE token_hash=? AND user_id=?)
      AND NOT EXISTS (SELECT 1 FROM director_google_subscriptions WHERE user_id=? AND token_hash<>?
        AND subscription_state IN ('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED') AND expires_at>?)`
    ).bind(state.active?'pro':'free',state.active?'active':'suspended',state.expiresAt,userId,hash,userId,userId,hash,now)
  ]);
  return state;
}
export async function refreshGoogleSubscriptions(env,userId=null) {
  if(!googlePlayConfig(env).ready) return {checked:0};
  await env.DB.prepare(GOOGLE_PLAY_SCHEMA).run();
  const query=userId
    ? 'SELECT * FROM director_google_subscriptions WHERE user_id=? ORDER BY last_verified_at LIMIT 20'
    : 'SELECT * FROM director_google_subscriptions WHERE expires_at>? AND last_verified_at<? ORDER BY last_verified_at LIMIT 50';
  const statement=env.DB.prepare(query);
  const rows=await (userId?statement.bind(userId):statement.bind(Date.now()-86400000,Date.now()-240000)).all();
  let checked=0;
  for(const row of rows.results||[]) {
    try{await verifyGooglePurchase(env,row.user_id,await decryptToken(env,row.encrypted_token));checked++;}
    catch{if(userId) throw Error('Google Play verification is temporarily unavailable. Please retry.');console.warn('Google Play scheduled verification failed');}
  }
  return {checked};
}
export async function handleGooglePlayBilling(request,env,user) {
  const path=new URL(request.url).pathname,config=googlePlayConfig(env);
  if(path==='/api/billing/google/config' && request.method==='GET') return json(config);
  if(!user) return json({error:'Sign in to manage your subscription.'},401);
  if(!config.ready) return json({error:'Google Play subscriptions are not configured yet.',code:'google_play_not_configured'},503);
  if(request.method!=='POST') return json({error:'Method not allowed.'},405);
  if(!['https://localhost','http://localhost'].includes(request.headers.get('Origin')) || request.headers.get('X-Urban-Director-Platform')!=='android') return json({error:'Use Google Play billing in the Android app.'},403);
  try{
    if(path==='/api/billing/google/refresh') return json({ok:true,...await refreshGoogleSubscriptions(env,user.id)});
    if(path!=='/api/billing/google/sync') return json({error:'Not found.'},404);
    const body=await request.json();const token=String(body.purchaseToken||'');
    if(!token || token.length>4096 || /\s/.test(token)) return json({error:'Invalid Google Play purchase token.'},400);
    return json({ok:true,entitlement:await verifyGooglePurchase(env,user.id,token)});
  }catch{return json({error:'Purchase verification failed. No access was granted. Please try Restore Purchases.'},400);}
}
