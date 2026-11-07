import { useState } from 'react';
export default function DesktopAuth({user,loading}) {
  const [status,setStatus]=useState(''),[busy,setBusy]=useState(false);
  const params=new URLSearchParams(window.location.search);
  const challenge=params.get('challenge'),state=params.get('state'),redirectUri=params.get('redirect_uri');
  const valid=/^[A-Za-z0-9_-]{43}$/.test(challenge||'') && /^[A-Za-z0-9_-]{32,128}$/.test(state||'') && /^http:\/\/127\.0\.0\.1:([1-9]\d{3,4})\/callback$/.test(redirectUri||'');
  async function approve(){
    setBusy(true);setStatus('');
    try{
      const response=await fetch('/api/auth/desktop/authorize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({challenge,state,redirectUri})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Sign-in failed.');
      const target=new URL(data.redirectUrl);const expected=new URL(redirectUri);
      if(target.origin!==expected.origin||target.pathname!=='/callback'||target.searchParams.get('state')!==state)throw new Error('Invalid app callback.');
      window.location.assign(target.href);
    }catch(error){setStatus(error.message);setBusy(false);}
  }
  return <main className="sp-auth-shell"><section className="sp-auth-card"><h1>Continue in Urban Director Studio</h1><p>Connect your signed-in account to the desktop app you just opened.</p>{!valid?<p>This sign-in link is invalid. Start again from the desktop app.</p>:loading?<p>Checking your account…</p>:!user?<a className="sp-auth-submit" href={'/login?return_to='+encodeURIComponent(window.location.pathname+window.location.search)}>Sign in</a>:<><p>Continue with your current ICA account.</p><button className="sp-auth-submit" disabled={busy} onClick={approve}>{busy?'Connecting…':'Continue in Studio'}</button></>}{status&&<p role="alert">{status}</p>}</section></main>;
}
