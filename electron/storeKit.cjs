const PRODUCT='com.icomputeranything.scenepilot.pro.monthly';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function createStoreKit({store,request,openExternal,timeoutMs=120000,restoreMs=15000}){
 let pending;const processing=new Set();
 function complete(value,error){if(!pending)return;const job=pending;pending=null;clearTimeout(job.timer);if(error)job.reject(error);else job.resolve(value);}
 async function updated(_event,transactions){
  for(const transaction of transactions){
   if(transaction.payment?.productIdentifier!==PRODUCT)continue;
   if(transaction.transactionState==='failed'){
    if(transaction.transactionDate)store.finishTransactionByDate(transaction.transactionDate);
    complete(transaction.errorCode===2?{status:'cancelled'}:null,transaction.errorCode===2?null:new Error('Apple could not complete this purchase.'));continue;
   }
   if(transaction.transactionState==='deferred'){complete({status:'pending'});continue;}
   if(!['purchased','restored'].includes(transaction.transactionState))continue;
   const id=transaction.originalTransactionIdentifier||transaction.transactionIdentifier;
   if(!/^\d{4,40}$/.test(id||'')||processing.has(id))continue;
   processing.add(id);
   try{
    // The server validates Apple's signed transaction, account binding and expiry.
    // Never finish an unverified transaction: StoreKit will redeliver it.
    const entitlement=await request('/api/billing/apple/sync',{transactionId:id});
    if(transaction.transactionDate)store.finishTransactionByDate(transaction.transactionDate);
    complete({status:'purchased',active:Boolean(entitlement?.entitlement?.active),entitlement});
   }catch{complete(null,new Error('Purchase verification did not complete. Use Restore Purchases to retry.'));}
   finally{processing.delete(id);}
  }
 }
 store.on('transactions-updated',updated);
 function wait(kind,action){
  if(pending)throw new Error('An Apple purchase or restore is already in progress.');
  return new Promise((resolve,reject)=>{
   pending={resolve,reject,timer:setTimeout(()=>complete(kind==='restore'?{active:false,status:'pending'}:{status:'pending'}),kind==='restore'?restoreMs:timeoutMs)};
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
  currentEntitlement(){return request('/api/billing/apple/refresh',{}).then(entitlement=>({active:Boolean(entitlement?.entitlement?.active),entitlement}));},
  manageSubscriptions(){return openExternal('https://apps.apple.com/account/subscriptions').then(()=>({opened:true}));}
 };
}
module.exports={createStoreKit};
