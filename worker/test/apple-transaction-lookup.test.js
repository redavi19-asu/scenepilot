import test from 'node:test';
import assert from 'node:assert/strict';
import {lookupAppleTransaction} from '../apple-transaction-lookup.js';
const hosts=[{environment:'Production',base:'https://production.invalid'},{environment:'Sandbox',base:'https://sandbox.invalid'}];
test('a production authentication rejection still checks the Sandbox transaction',async()=>{
 const calls=[];const result=await lookupAppleTransaction({token:'test',id:'123',hosts,fetchImpl:async url=>{calls.push(url);return calls.length===1?new Response('{}',{status:401}):Response.json({signedTransactionInfo:'signed-sandbox-transaction'});}});
 assert.equal(result.environment,'Sandbox');assert.equal(result.data.signedTransactionInfo,'signed-sandbox-transaction');assert.equal(calls.length,2);
});
test('rejects credentials when both environments reject authentication',async()=>{
 await assert.rejects(lookupAppleTransaction({token:'test',id:'123',hosts,fetchImpl:async()=>new Response('{}',{status:401})}),/credentials were rejected/);
});
test('a successful production lookup does not contact Sandbox',async()=>{
 let calls=0;const result=await lookupAppleTransaction({token:'test',id:'123',hosts,fetchImpl:async()=>{calls++;return Response.json({signedTransactionInfo:'signed-production'});}});
 assert.equal(result.environment,'Production');assert.equal(calls,1);
});

test('isolated Apple QC never contacts production transaction APIs',async()=>{
 const {appleTransactionHosts}=await import('../apple-transaction-lookup.js');
 const hosts=appleTransactionHosts('Sandbox');
 assert.deepEqual(hosts.map(host=>host.environment),['Sandbox']);
 await lookupAppleTransaction({token:'test',id:'123456',hosts,fetchImpl:async url=>{
  assert.ok(url.startsWith('https://api.storekit-sandbox.apple.com/'));
  return {ok:true,json:async()=>({signedTransactionInfo:'verified-by-server'})};
 }});
 assert.throws(()=>appleTransactionHosts('unexpected'),/Invalid Apple billing environment/);
});
