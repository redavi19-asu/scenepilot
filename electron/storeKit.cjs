const {receiptTransactions}=require('./appleReceipt.cjs');
const PRODUCT='com.icomputeranything.scenepilot.pro.monthly';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function createStoreKit({store,request,openExternal,timeoutMs=120000,restoreMs=45000,diagnostic=()=>{},readReceipt=()=>null}){
 let pending;const processing=new Set();
 function complete(value,error){if(!pending)return;const job=pending;pending=null;clearTimeout(job.timer);if(error)job.reject(error);else job.resolve(value);}
 function trace(stage,detail={}){try{diagnostic({stage,...detail});}catch{}}
 async function updated(_event,transactions){
  if(!Array.isArray(transactions)){trace('invalid-event');return;}
  trace('transactions',{count:transactions.length});
  for(const transaction of transactions){
   if(transaction.payment?.productIdentifier!==PRODUCT){trace('other-product');continue;}
   trace('transaction',{state:transaction.transactionState});
   if(transaction.transactionState==='failed'){
    if(transaction.transactionDate)store.finishTransactionByDate(transaction.transactionDate);
    complete(transaction.errorCode===2?{status:'cancelled'}:null,transaction.errorCode===2?null:new Error('Apple could not complete this purchase.'));continue;
   }
   if(transaction.transactionState==='deferred'){complete({status:'pending'});continue;}
   if(!['purchased','restored'].includes(transaction.transactionState))continue;
   const id=[transaction.originalTransactionIdentifier,transaction.transactionIdentifier].find(value=>/^\d{4,40}$/.test(value||''));
   if(!id){trace('missing-transaction-id');continue;}
   if(processing.has(id)){trace('verification-in-progress');continue;}
   processing.add(id);
   try{
    // The server validates Apple's signed transaction, account binding and expiry.
    // Never finish an unverified transaction: StoreKit will redeliver it.
    trace('verification-start');
    const entitlement=await request('/api/billing/apple/sync',{transactionId:id});
    trace('verification-complete',{active:Boolean(entitlement?.entitlement?.active)});
    if(transaction.transactionDate)store.finishTransactionByDate(transaction.transactionDate);
    complete({status:'purchased',active:Boolean(entitlement?.entitlement?.active),entitlement});
   }catch(error){trace('verification-failed',{reason:String(error?.message||'Unknown error').slice(0,240)});complete(null,new Error('Purchase verification did not complete. Use Restore Purchases to retry.'));}
   finally{processing.delete(id);}
  }
 }
 store.on('transactions-updated',updated);
 async function verifyReceipt(){
  const receipt=readReceipt();const ids=receipt?receiptTransactions(receipt,PRODUCT):[];
  trace('receipt-recovery',{candidates:ids.length});
  for(const id of ids){
   try{const entitlement=await request('/api/billing/apple/sync',{transactionId:id});
    if(entitlement?.entitlement?.active)return {status:'purchased',active:true,entitlement};
   }catch(error){trace('receipt-verification-failed',{reason:String(error?.message||'Unknown error').slice(0,240)});}
  }
  return {status:'pending'};
 }
 function wait(kind,action){
  if(pending)throw new Error('An Apple purchase or restore is already in progress.');
  return new Promise((resolve,reject)=>{
   trace('operation-start',{kind});
   pending={resolve,reject,timer:setTimeout(()=>{trace('operation-timeout',{kind});verifyReceipt().then(result=>complete(result),()=>complete({status:'pending'}));},kind==='restore'?restoreMs:timeoutMs)};
   Promise.resolve().then(action).catch(error=>complete(null,error));
  });
 }
 return {
  async getProduct(){const products=await store.getProducts([PRODUCT]);const product=products.find(p=>p.productIdentifier===PRODUCT);return {available:Boolean(product)&&store.canMakePayments(),native:true,productId:PRODUCT,displayName:product?.localizedTitle,description:product?.localizedDescription,displayPrice:product?.formattedPrice};},
  async purchase(){
   if(!store.canMakePayments())throw new Error('Apple purchases are disabled on this Mac.');
   const data=await request('/api/auth/me');const account=data.user?.id;
   if(!UUID.test(account||''))throw new Error('Sign in before purchasing.');
   return wait('purchase',async()=>{if(!await store.purchaseProduct(PRODUCT,{quantity:1,username:account}))throw new Error('This subscription is unavailable from Apple.');});
  },
  restore(){return wait('restore',()=>store.restoreCompletedTransactions());},
  async currentEntitlement(){const entitlement=await request('/api/billing/apple/refresh',{});return entitlement?.entitlement?.active?{active:true,entitlement}:verifyReceipt();},
  manageSubscriptions(){return openExternal('https://apps.apple.com/account/subscriptions').then(()=>({opened:true}));}
 };
}
module.exports={createStoreKit};
