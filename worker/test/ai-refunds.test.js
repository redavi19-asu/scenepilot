import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { handleAiStudio } from '../ai-studio.js';

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES('qc-user')");
  let failOnce = false;
  let batchTail = Promise.resolve();
  const env = { FAL_KEY:'test-never-sent', DB: {
    prepare(sql) { let args=[];return { sql,
      bind(...a){args=a;return this;},
      async first(){return db.prepare(sql).get(...args)||null;},
      async all(){return {results:db.prepare(sql).all(...args)};},
      async run(){
        if(failOnce && sql.includes("'generation'")){failOnce=false;throw Error('simulated ledger write failure');}
        const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};
      }
    };},
    batch(statements){const run=async()=>{db.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}};const result=batchTail.then(run);batchTail=result.catch(()=>{});return result;}
  }};
  return {db,env,failLedger(){failOnce=true;}};
}
const user={id:'qc-user',role:'user',plan:'free',status:'active',accessStatus:'active'};
const send=(env,path,body)=>handleAiStudio(new Request('https://test.invalid/api/ai/'+path,{method:body?'POST':'GET',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})}),env,user);
const input={aiSharingConsent:'fal-ai-v1',templateId:'lobby-duo',images:['data:image/png;base64,aGVsbG8=','data:image/png;base64,aGVsbG8=']};
async function setup(){const x=database();await send(x.env,'studio');x.db.exec("UPDATE uds_ai_wallets SET balance=100");return x;}

test('provider transport failure returns reserved tokens and repeated polls cannot refund twice',async()=>{
 const x=await setup(),original=globalThis.fetch;
 globalThis.fetch=async()=>{throw Error('simulated connection loss');};
 try{
  assert.equal((await send(x.env,'generate',input)).status,502);
  assert.equal(x.db.prepare('SELECT balance FROM uds_ai_wallets').get().balance,100);
  const job=x.db.prepare('SELECT * FROM uds_ai_jobs').get();
  assert.equal(job.status,'failed');assert.equal(job.tokens_refunded,1);
  const polls=await Promise.all([send(x.env,'jobs/'+job.id),send(x.env,'jobs/'+job.id)]);
  assert.ok(polls.every(response=>response.status===200));
  assert.equal(x.db.prepare('SELECT balance FROM uds_ai_wallets').get().balance,100);
  assert.equal(x.db.prepare("SELECT COUNT(*) AS n FROM uds_ai_transactions WHERE kind='refund'").get().n,1);
 }finally{globalThis.fetch=original;x.db.close();}
});

test('ledger failure rolls back both reservation and job, without contacting the provider',async()=>{
 const x=await setup();x.failLedger();let calls=0;const original=globalThis.fetch;
 globalThis.fetch=async()=>{calls++;throw Error('must not submit');};
 try{
  assert.equal((await send(x.env,'generate',input)).status,500);
  assert.equal(x.db.prepare('SELECT balance FROM uds_ai_wallets').get().balance,100);
  assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM uds_ai_jobs').get().n,0);
  assert.equal(calls,0);
 }finally{globalThis.fetch=original;x.db.close();}
});

test('insufficient tokens create neither a job nor a debit',async()=>{
 const x=await setup();x.db.exec('UPDATE uds_ai_wallets SET balance=10');
 assert.equal((await send(x.env,'generate',input)).status,402);
 assert.equal(x.db.prepare('SELECT balance FROM uds_ai_wallets').get().balance,10);
 assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM uds_ai_jobs').get().n,0);x.db.close();
});

test('stale submitting job recovers after an interrupted request',async()=>{
 const x=await setup();x.db.exec("UPDATE uds_ai_wallets SET balance=40,lifetime_spent=60; INSERT INTO uds_ai_jobs(id,user_id,template_id,model_id,status,token_cost,created_at,updated_at) VALUES('stale','qc-user','lobby-duo','test','submitting',60,1,1)");
 const r=await send(x.env,'jobs/stale');assert.equal((await r.json()).job.status,'failed');
 assert.equal(x.db.prepare('SELECT balance FROM uds_ai_wallets').get().balance,100);x.db.close();
});

test('generated-content reports are limited to the owner, validated and persisted once',async()=>{
 const x=await setup();x.db.exec("INSERT INTO uds_ai_jobs(id,user_id,template_id,model_id,status,token_cost,created_at,updated_at) VALUES('result','qc-user','lobby-duo','test','complete',60,1,1)");
 assert.equal((await send(x.env,'jobs/result/report',{reason:'bad'})).status,400);
 assert.equal((await send(x.env,'jobs/other-person/report',{reason:'An issue with this result'})).status,404);
 assert.equal((await send(x.env,'jobs/result/report',{reason:'Offensive generated content'})).status,200);
 assert.equal((await send(x.env,'jobs/result/report',{reason:'Updated report description'})).status,200);
 assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM uds_ai_reports').get().n,1);
 assert.equal((await send(x.env,'reports')).status,403);x.db.close();
});

test('Hotel Lobby video sends the orange studio and hanging-mic direction to the provider',async()=>{
 const x=await setup(),original=globalThis.fetch;let submitted;
 x.db.exec('UPDATE uds_ai_wallets SET balance=1000');
 globalThis.fetch=async(url,options)=>{
  assert.equal(new URL(url).hostname,'queue.fal.run');
  submitted=JSON.parse(options.body);
  return new Response(JSON.stringify({request_id:'mock-orange-video',status_url:'https://queue.fal.run/mock/status',response_url:'https://queue.fal.run/mock/result'}),{status:200,headers:{'Content-Type':'application/json'}});
 };
 try{
  const response=await send(x.env,'generate',{...input,templateId:'lobby-music-video'});
  assert.equal(response.status,202);
  assert.match(submitted.prompt,/seamless solid orange studio/);
  assert.match(submitted.prompt,/exactly one silver studio microphone hanging/);
  assert.match(submitted.prompt,/preserving both identities/);
  assert.doesNotMatch(submitted.prompt,/Dramatic premium hotel lobby interior/);
  const studio=await (await send(x.env,'studio')).json();
  const template=studio.templates.find(item=>item.id==='lobby-music-video');
  assert.equal(template.title,'Hotel Lobby — Orange Studio');
  assert.equal(template.minImages,2);assert.equal(template.maxImages,2);
 }finally{globalThis.fetch=original;x.db.close();}
});

test('Dead Fresh lifestyle template is featured and preserves the uploaded performer',async()=>{
 const x=await setup(),original=globalThis.fetch;let submitted;
 x.db.exec('UPDATE uds_ai_wallets SET balance=1000');
 globalThis.fetch=async(_url,options)=>{
  submitted=JSON.parse(options.body);
  return new Response(JSON.stringify({request_id:'mock-lifestyle',status_url:'https://queue.fal.run/mock/status',response_url:'https://queue.fal.run/mock/result'}),{status:200,headers:{'Content-Type':'application/json'}});
 };
 try{
  const response=await send(x.env,'generate',{...input,templateId:'dead-fresh-lifestyle-video'});
  assert.equal(response.status,202);assert.match(submitted.prompt,/golf course/);assert.match(submitted.prompt,/preserving their identity/);
  const studio=await (await send(x.env,'studio')).json();
  assert.equal(studio.templates.find(item=>item.id==='dead-fresh-lifestyle-video').featured,true);
  assert.equal(studio.templates.find(item=>item.id==='street-freestyle-video').featured,false);
 }finally{globalThis.fetch=original;x.db.close();}
});
