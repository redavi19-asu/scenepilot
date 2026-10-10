import test from 'node:test';
import assert from 'node:assert/strict';
import { handleSocialAuth } from '../social-auth.js';
import { directorAuthReturn } from '../auth-return.js';
const origin='https://scenepilot.ryanedavis.workers.dev';
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'routing-test'};
const b64=x=>Buffer.from(x).toString('base64url');
for(const provider of ['google','apple','microsoft']) for(const role of ['owner','admin','user']) test(`${provider} ${role} returns to studio with an authenticated session`,async()=>{
  const issuer=provider==='google'?'https://accounts.google.com':provider==='apple'?'https://appleid.apple.com':'https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0';
  const body=b64(JSON.stringify({alg:'RS256',kid:jwk.kid}))+'.'+b64(JSON.stringify({sub:'linked-subject',email:'user@example.com',email_verified:true,aud:'test-client',iss:issuer,nonce:'nonce',exp:Math.floor(Date.now()/1000)+300}));
  const jwt=body+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,Buffer.from(body)));
  const writes=[];
  const env={DB:{prepare:sql=>({bind:(...args)=>({first:async()=>sql.includes('FROM social_auth_states')?{nonce:'nonce',code_verifier:'verifier',return_path:'/app',expires_at:Date.now()+60000}:sql.includes('FROM social_identities')?{user_id:'existing'}:sql.includes('FROM users')?{id:'existing',role,status:'active'}:null,run:async()=>{writes.push({sql,args});return {meta:{changes:1}};}})})},[`SOCIAL_${provider.toUpperCase()}_CLIENT_ID`]:'test-client',[`SOCIAL_${provider.toUpperCase()}_CLIENT_SECRET`]:'secret'};
  const original=globalThis.fetch;let callback;
  globalThis.fetch=async(url,options)=>{if(String(url).includes('/token'))callback=options.body.get('redirect_uri');return Response.json(String(url).includes('certs')||String(url).includes('keys')?{keys:[jwk]}:{id_token:jwt});};
  try {
    const url=`${origin}/api/auth/social/${provider}/callback?state=test&code=test`;
    const request=provider==='apple'?new Request(url,{method:'POST',body:new URLSearchParams({state:'test',code:'test'})}):new Request(url);
    const response=await handleSocialAuth(request,env);
    assert.equal(response.status,302);
    assert.equal(response.headers.get('location'),`${origin}/app?social=${provider}`);
    assert.equal(callback,`${origin}/api/auth/social/${provider}/callback`);
    assert.match(response.headers.get('set-cookie'),/sp_session=.*HttpOnly; Secure; SameSite=Lax/);
    assert.ok(writes.some(w=>w.sql.startsWith('INSERT INTO sessions')));
    assert.ok(!writes.some(w=>w.sql.startsWith('INSERT INTO users')));
  } finally {globalThis.fetch=original;}
});
test('Director return destinations reject external and backslash redirects',()=>{
  for(const path of ['//evil.example','/\\evil.example','https://evil.example','/\n/evil.example'])assert.equal(directorAuthReturn(path),'/app');
  assert.equal(directorAuthReturn('/admin'),'/admin');
  assert.equal(directorAuthReturn('/app?room=abc'),'/app?room=abc');
});
