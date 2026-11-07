import test from 'node:test';import assert from 'node:assert/strict';
import {latestAppleSubscription,assertAppleAccountBinding} from '../apple-subscription-status.js';
const initial={originalTransactionId:'12345',productId:'pro',bundleId:'studio',purchaseDate:100,expiresDate:200};
function get(items,ok=true){return latestAppleSubscription({base:'https://api.storekit.apple.com',token:'test',transactionId:'12345',initial,productId:'pro',bundleId:'studio',decode:JSON.parse,fetchImpl:async url=>{assert.equal(url,'https://api.storekit.apple.com/inApps/v1/subscriptions/12345');return {ok,json:async()=>({data:[{lastTransactions:items.map(payload=>({signedTransactionInfo:JSON.stringify(payload)}))}]})};}});}
test('restoring an old transaction resolves its newest renewal',async()=>{
 const latest={...initial,transactionId:'98765',purchaseDate:300,expiresDate:400};assert.deepEqual((await get([initial,latest])).payload,latest);
});
test('revoked latest renewal is not replaced by an older unrevoked transaction',async()=>{
 const revoked={...initial,purchaseDate:300,revocationDate:350};assert.equal((await get([initial,revoked])).payload.revocationDate,350);
});
test('unrelated subscription chains, products and bundles cannot supply access',async()=>{
 for(const patch of [{originalTransactionId:'99999'},{productId:'other'},{bundleId:'other'}])await assert.rejects(get([{...initial,...patch}]),/did not return/);
 await assert.rejects(get([initial],false),/could not be verified/);
});
test('a new link requires a matching Apple account token; existing legacy owners can restore',()=>{
 assert.throws(()=>assertAppleAccountBinding({},'alice'),/account binding/);
 assert.throws(()=>assertAppleAccountBinding({appAccountToken:'bob'},'alice'),/different/);
 assert.throws(()=>assertAppleAccountBinding({appAccountToken:'alice'},'alice','bob'),/another/);
 assert.doesNotThrow(()=>assertAppleAccountBinding({},'alice','alice'));
 assert.doesNotThrow(()=>assertAppleAccountBinding({appAccountToken:'ALICE'},'alice'));
});
