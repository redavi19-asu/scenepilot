const test=require('node:test'),assert=require('node:assert/strict');const {EventEmitter}=require('node:events');const {createStoreKit}=require('../storeKit.cjs');
const PRODUCT='com.icomputeranything.scenepilot.pro.monthly';
const USER='a1234567-1234-4321-8123-123456789abc';
function fixture(verify=true){
 const store=new EventEmitter();let purchase,finished=[];store.canMakePayments=()=>true;store.getProducts=async()=>[{productIdentifier:PRODUCT,formattedPrice:'$39.99'}];store.purchaseProduct=async(...args)=>{purchase=args;return true;};store.restoreCompletedTransactions=()=>{};store.finishTransactionByDate=date=>finished.push(date);
 const client=createStoreKit({store,request:async route=>{if(route==='/api/auth/me')return {user:{id:USER}};if(!verify)throw new Error('Wrong owner');return {entitlement:{active:true}};},openExternal:async()=>{},timeoutMs:1000,restoreMs:20});
 return {store,client,finished,get purchase(){return purchase;}};
}
const transaction={transactionIdentifier:'123456789',transactionDate:'2026-11-07T22:00:00Z',transactionState:'purchased',payment:{productIdentifier:PRODUCT}};
test('Mac purchase binds the server-owned account UUID and finishes only after verification',async()=>{
 const f=fixture();const pending=f.client.purchase();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(f.purchase,[PRODUCT,{quantity:1,username:USER}]);assert.equal(f.finished.length,0);
 f.store.emit('transactions-updated',{},[transaction]);const result=await pending;assert.equal(result.entitlement.entitlement.active,true);assert.deepEqual(f.finished,[transaction.transactionDate]);
});
test('unverified transactions stay unfinished for a safe retry',async()=>{
 const f=fixture(false);const pending=f.client.purchase();const rejected=assert.rejects(pending,/verification/);await new Promise(resolve=>setImmediate(resolve));f.store.emit('transactions-updated',{},[transaction]);await rejected;assert.equal(f.finished.length,0);
});
test('restore has a bounded wait when Apple delivers no transactions',async()=>{
 const f=fixture();assert.deepEqual(await f.client.restore(),{status:'pending'});
});
test('cancel and deferred purchase states never claim entitlement',async()=>{
 for(const [state,expected] of [['failed','cancelled'],['deferred','pending']]){
 const f=fixture();const pending=f.client.purchase();await new Promise(resolve=>setImmediate(resolve));f.store.emit('transactions-updated',{},[{...transaction,transactionState:state,errorCode:2}]);assert.equal((await pending).status,expected);
 }
});

test('restored transaction falls back to valid current identifier',async()=>{
 const f=fixture();const pending=f.client.restore();await new Promise(resolve=>setImmediate(resolve));
 f.store.emit('transactions-updated',{},[{...transaction,transactionState:'restored',originalTransactionIdentifier:'invalid'}]);
 assert.equal((await pending).active,true);assert.equal(f.finished.length,1);
});
