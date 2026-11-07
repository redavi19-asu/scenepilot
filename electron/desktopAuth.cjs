const http = require('node:http');
const { randomBytes, createHash, timingSafeEqual } = require('node:crypto');
function createDesktopAuth({origin, openExternal, cookies, fetchImpl = fetch, timeoutMs = 300000}) {
  let pending;
  return {
    cancel() { pending?.(new Error('Sign-in cancelled.')); },
    async start() {
      if (pending) throw new Error('Sign-in is already open in your browser.');
      const verifier=randomBytes(32).toString('base64url'), state=randomBytes(32).toString('base64url');
      const challenge=createHash('sha256').update(verifier).digest('base64url');
      return new Promise((resolve,reject)=>{
        let timer, redirectUri, consumed=false, settled=false;
        const controller=new AbortController();
        const finish=error=>{if(settled)return;settled=true;controller.abort();clearTimeout(timer);server.close();pending=undefined;if(error)reject(error);else resolve({signedIn:true});};
        const server=http.createServer(async(req,res)=>{
          res.setHeader('Cache-Control','no-store'); res.setHeader('Content-Type','text/plain');
          if(req.method!=='GET'||req.headers.host!==new URL(redirectUri).host){res.writeHead(400).end('Invalid callback');return;}
          const url=new URL(req.url,redirectUri), received=url.searchParams.get('state')||'';
          if(url.pathname!=='/callback'||Buffer.byteLength(received)!==Buffer.byteLength(state)||!timingSafeEqual(Buffer.from(received),Buffer.from(state))||!/^[a-f0-9]{64}$/.test(url.searchParams.get('code')||'')||consumed){res.writeHead(400).end('Invalid or expired sign-in');return;}
          consumed=true;
          try{
            const response=await fetchImpl(`${origin}/api/auth/desktop/exchange`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:url.searchParams.get('code'),verifier,redirectUri}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)]),redirect:'error'});
            const data=await response.json();
            if(!response.ok||!/^[a-f0-9]{64}$/.test(data.sessionToken)||!Number.isFinite(data.expiresAt)||data.expiresAt<=Date.now())throw new Error('Sign-in expired. Start again in Studio.');
            if(settled)throw new Error('Sign-in cancelled.');
            await cookies.set({url:origin,name:'sp_session',value:data.sessionToken,httpOnly:true,secure:true,sameSite:'lax',path:'/',expirationDate:data.expiresAt/1000});
            res.end('Signed in. You can return to Urban Director Studio.');finish();
          }catch{res.writeHead(400).end('Sign-in failed. Return to Studio and try again.');finish(new Error('Sign-in failed. Please try again.'));}
        });
        pending=finish;
        server.on('error',finish);
        server.listen(0,'127.0.0.1',()=>{
          redirectUri=`http://127.0.0.1:${server.address().port}/callback`;
          const url=new URL('/desktop-auth',origin);url.search=new URLSearchParams({challenge,state,redirect_uri:redirectUri}).toString();
          Promise.resolve(openExternal(url.href)).catch(finish);
        });
        timer=setTimeout(()=>finish(new Error('Sign-in timed out. Please try again.')),timeoutMs);
      });
    }
  };
}
module.exports={createDesktopAuth};
