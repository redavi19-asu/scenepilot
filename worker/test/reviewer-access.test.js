import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {renewReviewerAccess} from '../reviewer-access.js';
function fixture(role='user',source='app-review'){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('CREATE TABLE users(id TEXT,email TEXT,role TEXT,status TEXT,password_hash TEXT);CREATE TABLE user_products(user_id TEXT,product_id TEXT,plan TEXT,access_status TEXT,source TEXT,expires_at INTEGER);CREATE TABLE sessions(id TEXT,user_id TEXT)');
 sqlite.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run('review','appreview@icomputeranything.com',role,'active','original-password-hash');sqlite.prepare('INSERT INTO user_products VALUES(?,?,?,?,?,?)').run('review','product_scenepilot','pro','suspended',source,100);sqlite.exec("INSERT INTO sessions VALUES('existing-session','review')");
 const db={prepare(sql){
  let args=[];
  return {
   bind(...values){args=values;return this;},
   async first(){return sqlite.prepare(sql).get(...args)||null;},
   async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};}
  };
 }};return {db,sqlite};
}
test('reviewer renewal restores only its existing review license and preserves password and sessions',async()=>{
 const {db,sqlite}=fixture();const result=await renewReviewerAccess(db,1000);assert.equal(result.expiresAt,1000+45*86400000);assert.equal(sqlite.prepare('SELECT password_hash FROM users').get().password_hash,'original-password-hash');assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,1);assert.equal(sqlite.prepare('SELECT access_status FROM user_products').get().access_status,'active');
});
test('renewal cannot change privileged accounts or entitlements from another source',async()=>{
 for(const [role,source] of [['owner','app-review'],['user','stripe'],['admin','app-review']]){const {db,sqlite}=fixture(role,source);await assert.rejects(renewReviewerAccess(db),/unavailable/);assert.equal(sqlite.prepare('SELECT expires_at FROM user_products').get().expires_at,100);}
});
