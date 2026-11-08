const test=require('node:test'),assert=require('node:assert/strict');
const {receiptTransactions}=require('../appleReceipt.cjs');
const {createStoreKit}=require('../storeKit.cjs');
const {EventEmitter}=require('node:events');
const PRODUCT='com.icomputeranything.scenepilot.pro.monthly';
function der(tag,...values){const b=Buffer.concat(values.map(v=>Buffer.isBuffer(v)?v:Buffer.from(v)));return Buffer.concat([Buffer.from([tag,...(b.length<128?[b.length]:[0x82,b.length>>8,b.length&255])]),b]);}
const int=n=>der(2,Buffer.from(n>255?[n>>8,n&255]:[n]));
const attr=(n,value)=>der(0x30,int(n),int(1),der(4,value));
function receipt(product=PRODUCT){const iap=der(0x31,attr(1702,der(12,product)),attr(1703,der(12,'123456789')));const payload=der(0x31,attr(17,iap));return der(0x30,der(6,'oid'),der(0xa0,der(0x30,int(1),der(0x31),der(0x30,der(6,'oid'),der(0xa0,der(4,payload))))));}
test('extracts only matching product references and rejects malformed receipts',()=>{
 assert.deepEqual(receiptTransactions(receipt(),PRODUCT),['123456789']);
 assert.deepEqual(receiptTransactions(receipt('other.product'),PRODUCT),[]);
 assert.deepEqual(receiptTransactions(Buffer.from([0x30,0x80]),PRODUCT),[]);
 assert.deepEqual(receiptTransactions(receipt().subarray(0,30),PRODUCT),[]);
});
test('missing StoreKit callback recovers only through server verified receipt reference',async()=>{
 const store=new EventEmitter();store.restoreCompletedTransactions=()=>{};
 const requests=[];const client=createStoreKit({store,readReceipt:receipt,restoreMs:1,request:async(route,body)=>{requests.push([route,body]);return {entitlement:{active:true}};}});
 assert.equal((await client.restore()).active,true);
 assert.deepEqual(requests,[['/api/billing/apple/sync',{transactionId:'123456789'}]]);
});
test('receipt never grants access when backend verification rejects it',async()=>{
 const store=new EventEmitter();store.restoreCompletedTransactions=()=>{};
 const client=createStoreKit({store,readReceipt:receipt,restoreMs:1,request:async()=>{throw Error('Rejected');}});
 assert.deepEqual(await client.restore(),{status:'pending'});
});
