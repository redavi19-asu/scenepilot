import { Capacitor, registerPlugin } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { apiFetch } from './runtimeApi';
const NativeGooglePlay = registerPlugin('GooglePlaySubscription');
export const isGooglePlayAvailable = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
async function api(path,body) {
  const r=await apiFetch(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
  const data=await r.json();if(!r.ok)throw Error(data.error||'Google Play verification failed.');return data;
}
export async function getGoogleSubscriptionProduct() {
  const config=await api('/api/billing/google/config');
  if(!config.ready)return {available:false,configured:false};
  return {...await NativeGooglePlay.getProduct(),configured:true};
}
async function syncPurchases(result) {
  let active=false,pending=false;
  for(const purchase of result.purchases||[]) {
    if(purchase.status!=='purchased'){pending=true;continue;}
    const data=await api('/api/billing/google/sync',{purchaseToken:purchase.purchaseToken});
    active ||= data.entitlement?.active===true;
  }
  return {active,pending,user:(await api('/api/auth/me')).user};
}
export async function purchaseGoogleSubscription(userId) {
  const config=await api('/api/billing/google/config');
  if(!config.ready)throw Error('Google Play subscriptions are not configured yet.');
  const result=await NativeGooglePlay.purchase({appAccountToken:userId});
  return result.status==='cancelled'?result:{status:'updated',...await syncPurchases(result)};
}
export async function restoreGoogleSubscription() {
  const config=await api('/api/billing/google/config');
  if(!config.ready)return {configured:false};
  const result=await syncPurchases(await NativeGooglePlay.restore());
  if(!result.active){await api('/api/billing/google/refresh',{});result.user=(await api('/api/auth/me')).user;}
  return result;
}
export async function watchGooglePurchases(onUser) {
  const refresh=()=>restoreGoogleSubscription().then(result=>{if(result.user)onUser(result.user);}).catch(()=>{});
  const purchases=await NativeGooglePlay.addListener('purchasesUpdated',refresh);
  const resume=await CapacitorApp.addListener('appStateChange',state=>{if(state.isActive)void refresh();});
  return ()=>{void purchases.remove();void resume.remove();};
}
export const manageGoogleSubscription = () => NativeGooglePlay.manageSubscriptions();
