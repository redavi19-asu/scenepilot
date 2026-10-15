import { useEffect, useState } from 'react';
import { getGoogleSubscriptionProduct, purchaseGoogleSubscription, restoreGoogleSubscription, manageGoogleSubscription } from './googlePlaySubscription';
export default function GooglePlayBillingCard({user,onAccessUpdated,onNavigate}) {
  const [product,setProduct]=useState(null),[busy,setBusy]=useState(false),[status,setStatus]=useState('');
  useEffect(()=>{let cancelled=false;getGoogleSubscriptionProduct().then(value=>{if(!cancelled)setProduct(value);}).catch(error=>{if(!cancelled)setStatus(error.message);});return()=>{cancelled=true;};},[]);
  async function run(operation){setBusy(true);setStatus('');try{const result=await operation();if(result?.status==='cancelled'){setStatus('Purchase cancelled.');return;}if(result?.user){onAccessUpdated?.(result.user);if(result.user.accessStatus==='active'){window.location.assign('/app');return;}}setStatus(result?.pending?'Google Play is processing this purchase. Access starts after verification.':result?.configured===false?'Google Play subscriptions are not configured yet.':'No active subscription was found.');}catch(error){setStatus(error.message);}finally{setBusy(false);}}
  return <div className="sp-apple-billing-card">
    <span className="sp-kicker">GOOGLE PLAY SUBSCRIPTION</span>
    <strong>Urban Director Studio Pro — {product?.displayPrice||'$39.99'} / month</strong>
    <small>Includes 1,500 broadcast minutes per billing period. Auto-renews monthly until canceled in Google Play.</small>
    {!product?.configured&&<small>Google Play subscriptions are being prepared. Existing users can sign in with their Director account.</small>}
    <button className="sp-auth-submit" type="button" disabled={busy||!product?.available} onClick={()=>run(()=>purchaseGoogleSubscription(user.id))}>SUBSCRIBE WITH GOOGLE PLAY</button>
    <button className="sp-secondary" type="button" disabled={busy||!product?.configured} onClick={()=>run(restoreGoogleSubscription)}>RESTORE PURCHASES</button>
    <button className="sp-secondary" type="button" disabled={busy} onClick={()=>{void manageGoogleSubscription().catch(error=>setStatus(error.message));}}>MANAGE GOOGLE PLAY SUBSCRIPTION</button>
    <small><button type="button" onClick={()=>onNavigate("/terms")}>Terms of Use</button> · <button type="button" onClick={()=>onNavigate("/privacy")}>Privacy Policy</button></small>
    {status&&<div className="sp-billing-status" role="status">{status}</div>}
  </div>;
}
