// Fetch the latest renewal, even when StoreKit restores an older transaction.
// Only consume authenticated responses directly from Apple's server API.
export async function latestAppleSubscription({base,token,transactionId,initial,productId,bundleId,decode,fetchImpl=fetch}) {
  const original=String(initial.originalTransactionId||'');
  if(!/^\d{4,40}$/.test(original))throw new Error('Apple transaction identifiers are incomplete.');
  const response=await fetchImpl(`${base}/inApps/v1/subscriptions/${transactionId}`,{
    headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},signal:AbortSignal.timeout(20000)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error('Apple subscription status could not be verified. Try Restore Purchases again.');
  const candidates=[];
  for(const group of data.data||[])for(const item of group.lastTransactions||[]){
    if(!item.signedTransactionInfo)continue;
    const payload=decode(item.signedTransactionInfo);
    if(String(payload.originalTransactionId)!==original||payload.productId!==productId||payload.bundleId!==bundleId)continue;
    candidates.push({signedTransactionInfo:item.signedTransactionInfo,payload});
  }
  candidates.sort((a,b)=>Number(b.payload.purchaseDate||0)-Number(a.payload.purchaseDate||0));
  if(!candidates.length)throw new Error('Apple did not return this subscription.');
  return candidates[0];
}
export function assertAppleAccountBinding(verified,userId,existingUserId){
  if(existingUserId && existingUserId!==userId)throw new Error('This Apple subscription is already linked to another Urban Director Studio account.');
  if(verified.appAccountToken){
    if(verified.appAccountToken.toLowerCase()!==userId.toLowerCase())throw new Error('This Apple subscription is linked to a different Urban Director Studio account.');
  }else if(existingUserId!==userId){
    throw new Error('Apple did not return the account binding for this purchase. Contact support to restore an older purchase.');
  }
}
