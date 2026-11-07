import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleDesktopAuth, desktopHash, desktopChallenge, validDesktopCallback } from '../desktop-auth.js';
const ORIGIN='https://urbandirector.icomputeranything.com';
const USER='550e8400-e29b-41d4-a716-446655440000';
const CALLBACK='http://127.0.0.1:41512/callback';
const VERIFIER='v'.repeat(43),STATE='s'.repeat(43),BROWSER='fixture-browser-token';
async function fixture({proof=true}={}){
 const sql=new DatabaseSync(':memory:');sql.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE users(id TEXT PRIMARY KEY,status TEXT);CREATE TABLE sessions(id TEXT PRIMARY KEY,user_id TEXT,expires_at INTEGER,created_at INTEGER,user_agent TEXT);
 CREATE TABLE director_email_access_proofs(user_id TEXT,session_id TEXT,verified_at INTEGER,PRIMARY KEY(user_id,session_id));`);
 sql.exec(readFileSync(new URL('../../migrations/0013_desktop_auth.sql',import.meta.url),'utf8'));
 const sourceId=await desktopHash(BROWSER),now=Date.now(),created=now-3600000,expires=now+3600000;
 sql.prepare('INSERT INTO users VALUES (?,?)').run(USER,'active');sql.prepare('INSERT INTO sessions VALUES (?,?,?,?,?)').run(sourceId,USER,expires,created,'fixture');
 if(proof)sql.prepare('INSERT INTO director_email_access_proofs VALUES (?,?,?)').run(USER,sourceId,created);
 const db={prepare(query){const statement=sql.prepare(query);return{bind(...args){return{run:async()=>({meta:{changes:Number(statement.run(...args).changes)}}),first:async()=>statement.get(...args)||null}}}},async batch(statements){sql.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}}};
 const deps={sessionHash:async()=>sourceId,getCurrentUser:async req=>req.headers.get('Cookie')===`sp_session=${BROWSER}`&&sql.prepare('SELECT u.id FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.id=? AND s.expires_at>? AND u.status=?').get(sourceId,Date.now(),'active')?{id:USER}:null};
 async function call(path,body,options={}){const headers={'Content-Type':'application/json',...(path==='authorize'?{Origin:ORIGIN,Cookie:`sp_session=${BROWSER}`}:{}) ,...options.headers};return handleDesktopAuth(new Request(ORIGIN+'/api/auth/desktop/'+path,{method:options.method||'POST',headers,...((options.method||'POST')==='POST'?{body:JSON.stringify(body)}:{})}),{DB:db},deps)}
 async function approve(extra={}){const r=await call('authorize',{challenge:await desktopChallenge(VERIFIER),state:STATE,redirectUri:CALLBACK,...extra});assert.equal(r.status,200);const result=await r.json();return new URL(result.redirectUrl).searchParams.get('code')}
 return{sql,call,approve,sourceId,created,expires,db,deps};
}
test('authorization stores only a hashed single-use code and a PKCE challenge',async()=>{
 const f=await fixture(),code=await f.approve({userId:'attacker'});const row=f.sql.prepare('SELECT * FROM director_desktop_auth_codes').get();
 assert.equal(row.id,await desktopHash(code));assert.notEqual(row.id,code);assert.equal(row.user_id,USER);assert.equal(row.pkce_challenge,await desktopChallenge(VERIFIER));assert.notEqual(row.pkce_challenge,VERIFIER);
 const r=await f.call('exchange',{code,verifier:VERIFIER,redirectUri:CALLBACK});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
 const data=await r.json();assert.match(data.sessionToken,/^[a-f0-9]{64}$/);assert.equal(data.expiresAt,f.expires);
 const issued=f.sql.prepare('SELECT * FROM sessions WHERE id=?').get(await desktopHash(data.sessionToken));assert.equal(issued.user_id,USER);assert.equal(issued.created_at,f.created);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM director_email_access_proofs WHERE session_id=?').get(issued.id).count,1);
 assert.equal((await f.call('exchange',{code,verifier:VERIFIER,redirectUri:CALLBACK})).status,400);f.sql.close();
});
test('concurrent code redemption creates exactly one desktop session',async()=>{
 const f=await fixture(),code=await f.approve();const results=await Promise.all([1,2].map(()=>f.call('exchange',{code,verifier:VERIFIER,redirectUri:CALLBACK})));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM sessions').get().count,2);f.sql.close();
});
test('a wrong verifier or callback cannot consume the valid authorization',async()=>{
 const f=await fixture(),code=await f.approve();
 for(const body of [{code,verifier:'x'.repeat(43),redirectUri:CALLBACK},{code,verifier:VERIFIER,redirectUri:'http://127.0.0.1:41513/callback'}])assert.equal((await f.call('exchange',body)).status,400);
 assert.equal((await f.call('exchange',{code,verifier:VERIFIER,redirectUri:CALLBACK})).status,200);f.sql.close();
});
for(const state of ['expired','revoked','suspended'])test(`${state} authorizations cannot issue a desktop session`,async()=>{
 const f=await fixture(),code=await f.approve();
 if(state==='expired')f.sql.prepare('UPDATE director_desktop_auth_codes SET expires_at=0').run();
 if(state==='revoked')f.sql.prepare('DELETE FROM sessions WHERE id=?').run(f.sourceId);
 if(state==='suspended')f.sql.prepare('UPDATE users SET status=?').run('suspended');
 assert.equal((await f.call('exchange',{code,verifier:VERIFIER,redirectUri:CALLBACK})).status,400);assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM sessions').get().count,state==='revoked'?0:1);f.sql.close();
});
test('approval requires a signed-in browser at the exact first-party origin',async()=>{
 const f=await fixture();const body={challenge:await desktopChallenge(VERIFIER),state:STATE,redirectUri:CALLBACK};
 assert.equal((await f.call('authorize',body,{headers:{Origin:'https://evil.example'}})).status,403);
 assert.equal((await f.call('authorize',body,{headers:{Cookie:''}})).status,401);
 assert.equal((await f.call('authorize',body,{headers:{Origin:''}})).status,403);
 assert.equal((await f.call('authorize',body,{method:'GET'})).status,405);f.sql.close();
});
test('cross-origin exchange is blocked and invalid callbacks fail closed',async()=>{
 const f=await fixture(),code=await f.approve();assert.equal((await f.call('exchange',{code,verifier:VERIFIER,redirectUri:CALLBACK},{headers:{Origin:'https://evil.example'}})).status,403);
 for(const uri of ['https://evil.example/callback','http://localhost:41512/callback','http://127.0.0.1:80/callback','http://127.0.0.1:70000/callback','http://127.0.0.1:41512/other','http://127.0.0.1:41512/callback?x=1','http://127.0.0.1:41512/callback#x','http://user@127.0.0.1:41512/callback']){assert.equal(validDesktopCallback(uri),false);assert.equal((await f.call('authorize',{challenge:await desktopChallenge(VERIFIER),state:STATE,redirectUri:uri})).status,400)}f.sql.close();
});
test('delegation cannot manufacture email proof or reset authentication age',async()=>{
 const f=await fixture({proof:false});f.sql.prepare('INSERT INTO director_email_access_proofs VALUES (?,?,?)').run(USER,'password-recovery',f.created+60000);
 const code=await f.approve({emailVerified:true});const r=await f.call('exchange',{code,verifier:VERIFIER,redirectUri:CALLBACK});assert.equal(r.status,200);
 const data=await r.json(),id=await desktopHash(data.sessionToken);assert.equal(f.sql.prepare('SELECT created_at FROM sessions WHERE id=?').get(id).created_at,f.created);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS count FROM director_email_access_proofs WHERE session_id=?').get(id).count,0);assert.equal(data.expiresAt,f.expires);f.sql.close();
});
