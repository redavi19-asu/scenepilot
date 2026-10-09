import { appleSigningConfigured, appleClientSecret } from './apple-client-secret.js';
const SESSION_COOKIE = "sp_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const STATE_TTL_MS = 10 * 60 * 1000;
const PASSWORD_ITERATIONS = 100000;

const PROVIDERS = {
  google: {
    label: "Google",
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    jwks: "https://www.googleapis.com/oauth2/v3/certs",
    scope: "openid email profile"
  },
  microsoft: {
    label: "Microsoft",
    authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    jwks: "https://login.microsoftonline.com/common/discovery/v2.0/keys",
    scope: "openid email profile"
  },
  apple: {
    label: "Apple",
    authorize: "https://appleid.apple.com/auth/authorize",
    token: "https://appleid.apple.com/auth/token",
    jwks: "https://appleid.apple.com/auth/keys",
    scope: "name email"
  }
};

function json(data,status=200,headers={}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type":"application/json; charset=utf-8",
      "cache-control":"no-store",
      "x-content-type-options":"nosniff",
      ...headers
    }
  });
}

function bytesToHex(bytes){return [...bytes].map(v=>v.toString(16).padStart(2,"0")).join("");}
function randomToken(bytes=32){const out=new Uint8Array(bytes);crypto.getRandomValues(out);return bytesToHex(out);}
async function sha256Hex(value){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(value||"")));return bytesToHex(new Uint8Array(digest));}
function b64url(bytes){let binary="";for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");}
async function challenge(verifier){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier));return b64url(new Uint8Array(digest));}
function b64urlBytes(value){const n=String(value||"").replace(/-/g,"+").replace(/_/g,"/");const p=n+"=".repeat((4-n.length%4)%4);const binary=atob(p);return Uint8Array.from(binary,c=>c.charCodeAt(0));}
function jwtPart(value){return JSON.parse(new TextDecoder().decode(b64urlBytes(value)));}
function normalizeEmail(value){return String(value||"").trim().toLowerCase();}
function safeReturn(value){const p=String(value||"/app").trim();return p.startsWith("/")&&!p.startsWith("//")?p:"/app";}
function origin(request,env){return String(env.SOCIAL_AUTH_ORIGIN||new URL(request.url).origin).replace(/\/$/,"");}

function config(env,name){
  const provider=PROVIDERS[name];
  if(!provider)return null;
  const prefix=name.toUpperCase();
  const clientId=String(env["SOCIAL_"+prefix+"_CLIENT_ID"]||"").trim();
  const clientSecret=String(env["SOCIAL_"+prefix+"_CLIENT_SECRET"]||"").trim();
  return {...provider,name,clientId,clientSecret,ready:Boolean(clientId&&(clientSecret||(name==="apple"&&appleSigningConfigured(env))))};
}

function sessionCookie(token){
  return [
    SESSION_COOKIE+"="+token,
    "Path=/",
    "Max-Age="+Math.floor(SESSION_TTL_MS/1000),
    "HttpOnly","Secure","SameSite=Lax"
  ].join("; ");
}

async function hashPassword(password){
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations:PASSWORD_ITERATIONS},key,256);
  return {salt:bytesToHex(salt),hash:bytesToHex(new Uint8Array(bits))};
}

async function createSession(env,userId,request){
  const token=randomToken(32);
  const id=await sha256Hex(token);
  const now=Date.now();
  await env.DB.prepare("INSERT INTO sessions (id,user_id,expires_at,created_at,user_agent) VALUES (?,?,?,?,?)")
    .bind(id,userId,now+SESSION_TTL_MS,now,request.headers.get("User-Agent")||"").run();
  await env.DB.prepare("INSERT OR REPLACE INTO director_email_access_proofs (user_id,session_id,verified_at) VALUES (?,?,?)")
    .bind(userId,id,now).run();
  return token;
}

async function verifyIdToken(idToken,cfg,nonce){
  const parts=String(idToken||"").split(".");
  if(parts.length!==3)throw new Error("Identity provider returned an invalid ID token.");
  const header=jwtPart(parts[0]), claims=jwtPart(parts[1]);
  if(header.alg!=="RS256"||!header.kid)throw new Error("Unsupported identity token signature.");
  const keyResponse=await fetch(cfg.jwks,{headers:{accept:"application/json"}});
  if(!keyResponse.ok)throw new Error("Identity provider signing keys are unavailable.");
  const keys=await keyResponse.json();
  const jwk=(keys.keys||[]).find(k=>k.kid===header.kid&&k.kty==="RSA");
  if(!jwk)throw new Error("Identity provider signing key was not found.");
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  const signed=new TextEncoder().encode(parts[0]+"."+parts[1]);
  const valid=await crypto.subtle.verify({name:"RSASSA-PKCS1-v1_5"},key,b64urlBytes(parts[2]),signed);
  if(!valid)throw new Error("Identity token signature validation failed.");
  const aud=Array.isArray(claims.aud)?claims.aud:[claims.aud];
  if(!aud.includes(cfg.clientId))throw new Error("Identity token audience mismatch.");
  if(Number(claims.exp||0)<=Math.floor(Date.now()/1000)-30)throw new Error("Identity token expired.");
  if(nonce&&claims.nonce!==nonce)throw new Error("Identity token nonce mismatch.");
  const iss=String(claims.iss||"");
  if(cfg.name==="google"&&!["https://accounts.google.com","accounts.google.com"].includes(iss))throw new Error("Unexpected Google token issuer.");
  if(cfg.name==="apple"&&iss!=="https://appleid.apple.com")throw new Error("Unexpected Apple token issuer.");
  if(cfg.name==="microsoft"&&!/^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]+\/v2\.0$/i.test(iss))throw new Error("Unexpected Microsoft token issuer.");
  return claims;
}

async function paramsFrom(request){
  const url=new URL(request.url);
  if(request.method.toUpperCase()==="POST"){
    const form=await request.formData();
    return Object.fromEntries(form.entries());
  }
  return Object.fromEntries(url.searchParams.entries());
}

async function exchange(request,env,cfg,row,params){
  const redirectUri=origin(request,env)+"/api/auth/social/"+cfg.name+"/callback";
  const form=new URLSearchParams({
    grant_type:"authorization_code",
    code:String(params.code||""),
    client_id:cfg.clientId,
    client_secret:cfg.name === "apple" && appleSigningConfigured(env) ? await appleClientSecret(env,cfg.clientId) : cfg.clientSecret,
    redirect_uri:redirectUri,
    code_verifier:row.code_verifier
  });
  const response=await fetch(cfg.token,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded","accept":"application/json"},body:form});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||!payload.id_token)throw new Error(payload.error_description||payload.error||"Identity provider token exchange failed.");
  return payload;
}

async function finish(request,env,cfg,row,params){
  const token=await exchange(request,env,cfg,row,params);
  const claims=await verifyIdToken(token.id_token,cfg,row.nonce);
  const subject=String(claims.sub||"").trim();
  if(!subject)throw new Error("Identity provider did not return a stable account identifier.");

  let appleUser={};
  if(cfg.name==="apple"&&params.user){try{appleUser=JSON.parse(String(params.user));}catch{}}
  const email=normalizeEmail(claims.email||claims.preferred_username||appleUser.email);
  if(!/^\S+@\S+\.\S+$/.test(email))throw new Error("Identity provider did not return a usable email.");
  if(cfg.name==="google"&&claims.email_verified!==true)throw new Error("Google did not verify this email.");

  const linked=await env.DB.prepare("SELECT user_id FROM social_identities WHERE provider=? AND provider_subject=? LIMIT 1")
    .bind(cfg.name,subject).first();
  let user=linked?await env.DB.prepare("SELECT * FROM users WHERE id=? LIMIT 1").bind(linked.user_id).first():null;
  if(!user)user=await env.DB.prepare("SELECT * FROM users WHERE email=? LIMIT 1").bind(email).first();

  const now=Date.now();
  if(!user){
    const count=await env.DB.prepare("SELECT COUNT(*) AS count FROM users").first();
    const first=Number(count?.count||0)===0;
    const id=crypto.randomUUID();
    const generated=await hashPassword(randomToken(48));
    const displayName=String(claims.name||[appleUser?.name?.firstName,appleUser?.name?.lastName].filter(Boolean).join(" ")||email.split("@")[0]).slice(0,100);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users (id,email,display_name,password_hash,password_salt,role,status,marketing_opt_in,created_at,last_login_at) VALUES (?,?,?,?,?,?,'active',0,?,?)")
        .bind(id,email,displayName,generated.hash,generated.salt,first?"owner":"user",now,now),
      env.DB.prepare("INSERT OR IGNORE INTO products (id,slug,name,status,created_at) VALUES ('product_scenepilot','scenepilot','Urban Director Studio','active',?)").bind(now),
      env.DB.prepare("INSERT OR IGNORE INTO user_products (user_id,product_id,plan,access_status,source,created_at) VALUES (?,'product_scenepilot',?,?,?,?)")
        .bind(id,first?"pro":"free",first?"active":"pending","social-"+cfg.name,now)
    ]);
    user=await env.DB.prepare("SELECT * FROM users WHERE id=? LIMIT 1").bind(id).first();
  }else{
    if(user.status!=="active")throw new Error("This Urban Director Studio account is not active.");
    await env.DB.prepare("UPDATE users SET last_login_at=? WHERE id=?").bind(now,user.id).run();
  }

  await env.DB.prepare("INSERT INTO social_identities (provider,provider_subject,user_id,email,created_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(provider,provider_subject) DO UPDATE SET user_id=excluded.user_id,email=excluded.email,updated_at=excluded.updated_at")
    .bind(cfg.name,subject,user.id,email,now,now).run();

  const tokenValue=await createSession(env,user.id,request);
  const requestedReturn=safeReturn(row.return_path);
  // Verified owner/admin users should land in the admin console after social login.
  const returnPath=requestedReturn==="/app"&&(user.role==="owner"||user.role==="admin")?"/admin":requestedReturn;
  const destination=new URL(returnPath,origin(request,env));
  destination.searchParams.set("social",cfg.name);
  return new Response(null,{status:302,headers:{Location:destination.toString(),"Set-Cookie":sessionCookie(tokenValue),"Cache-Control":"no-store"}});
}

export async function handleSocialAuth(request,env){
  if(!env.DB)return json({error:"Urban Director Studio account database is unavailable."},503);
  const url=new URL(request.url);
  if(url.pathname==="/api/auth/social/status"&&request.method.toUpperCase()==="GET"){
    const providers={};
    for(const name of Object.keys(PROVIDERS))providers[name]=config(env,name).ready;
    return json({providers});
  }

  const match=url.pathname.match(/^\/api\/auth\/social\/(google|microsoft|apple)\/(start|callback)$/);
  if(!match)return null;
  const name=match[1], action=match[2], cfg=config(env,name);
  if(!cfg.ready)return json({error:PROVIDERS[name].label+" sign-in is not configured yet.",code:"social_provider_not_configured"},503);

  if(action==="start"){
    if(request.method.toUpperCase()!=="GET")return json({error:"Method not allowed."},405);
    const state=randomToken(32), verifier=b64url(crypto.getRandomValues(new Uint8Array(48))), nonce=randomToken(24);
    await env.DB.prepare("DELETE FROM social_auth_states WHERE expires_at<=?").bind(Date.now()).run();
    await env.DB.prepare("INSERT INTO social_auth_states (state_hash,provider,code_verifier,nonce,return_path,expires_at,created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(await sha256Hex(state),name,verifier,nonce,safeReturn(url.searchParams.get("return_to")),Date.now()+STATE_TTL_MS,Date.now()).run();

    const target=new URL(cfg.authorize);
    target.searchParams.set("client_id",cfg.clientId);
    target.searchParams.set("redirect_uri",origin(request,env)+"/api/auth/social/"+name+"/callback");
    target.searchParams.set("response_type","code");
    target.searchParams.set("scope",cfg.scope);
    target.searchParams.set("state",state);
    target.searchParams.set("nonce",nonce);
    target.searchParams.set("code_challenge",await challenge(verifier));
    target.searchParams.set("code_challenge_method","S256");
    if(name==="google"){
      target.searchParams.set("access_type","online");
      target.searchParams.set("prompt","select_account");
    }
    if(name==="microsoft")target.searchParams.set("response_mode","query");
    if(name==="apple")target.searchParams.set("response_mode","form_post");
    return Response.redirect(target.toString(),302);
  }

  const params=await paramsFrom(request);
  if(params.error){
    const destination=new URL("/login",origin(request,env));
    destination.searchParams.set("social_error",String(params.error_description||params.error));
    return Response.redirect(destination.toString(),302);
  }
  const stateHash=await sha256Hex(String(params.state||""));
  const row=await env.DB.prepare("SELECT * FROM social_auth_states WHERE state_hash=? AND provider=? LIMIT 1").bind(stateHash,name).first();
  if(!row||Number(row.expires_at||0)<=Date.now())return json({error:"Social sign-in expired. Start again."},400);
  await env.DB.prepare("DELETE FROM social_auth_states WHERE state_hash=?").bind(stateHash).run();

  try{return await finish(request,env,cfg,row,params);}
  catch(error){
    console.error("Urban Director social auth failed",name,error);
    const destination=new URL("/login",origin(request,env));
    destination.searchParams.set("social_error",error instanceof Error?error.message:"Social sign-in failed.");
    return Response.redirect(destination.toString(),302);
  }
}
