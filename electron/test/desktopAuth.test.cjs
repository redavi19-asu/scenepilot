const test=require('node:test');const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');const {createDesktopAuth}=require('../desktopAuth.cjs');
function setup(overrides={}){
 let launch,stored,exchange;let opened;const ready=new Promise(resolve=>opened=resolve);
 const auth=createDesktopAuth({origin:'https://studio.example',openExternal:async value=>{launch=new URL(value);opened();},cookies:{set:async value=>stored=value},fetchImpl:async(url,options)=>{exchange=JSON.parse(options.body);return {ok:true,json:async()=>({sessionToken:'b'.repeat(64),expiresAt:Date.now()+60000})};},...overrides});
 return {auth,ready,get launch(){return launch;},get stored(){return stored;},get exchange(){return exchange;}};
}
function callback(f,state=f.launch.searchParams.get('state')){const u=new URL(f.launch.searchParams.get('redirect_uri'));u.search=new URLSearchParams({code:'a'.repeat(64),state});return u;}
test('loopback sign-in validates state and PKCE and keeps session out of renderer result',async()=>{
 const f=setup();const result=f.auth.start();await f.ready;
 const bad=await fetch(callback(f,'wrong'));assert.equal(bad.status,400);
 const good=await fetch(callback(f));assert.equal(good.status,200);
 assert.deepEqual(await result,{signedIn:true});
 assert.equal(createHash('sha256').update(f.exchange.verifier).digest('base64url'),f.launch.searchParams.get('challenge'));
 assert.equal(f.stored.name,'sp_session');assert.equal(f.stored.httpOnly,true);assert.equal(f.stored.secure,true);assert.equal(f.stored.sameSite,'lax');
});
test('concurrent login is rejected and cancellation closes the listener',async()=>{
 const f=setup();const first=f.auth.start();const rejected=assert.rejects(first,/cancelled/);await f.ready;
 await assert.rejects(f.auth.start(),/already open/);const url=callback(f);f.auth.cancel();await rejected;
 await assert.rejects(fetch(url));
});
test('failed verification never stores a cookie',async()=>{
 const f=setup({fetchImpl:async()=>({ok:false,json:async()=>({error:'no'})})});const first=f.auth.start();const rejected=assert.rejects(first,/failed/);await f.ready;
 assert.equal((await fetch(callback(f))).status,400);await rejected;assert.equal(f.stored,undefined);
});
