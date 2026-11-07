const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const output=path.resolve(process.env.UDS_QC_OUTPUT || 'release-qc/native-engine-qc.json');fs.mkdirSync(path.dirname(output),{recursive:true});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'uds-native-qc-'));
// Hosted CI runners cannot resolve multicast DNS between virtual interfaces.
// This affects only synthetic same-process ICE, never the shipping app.
app.commandLine.appendSwitch('disable-features','WebRtcHideLocalIpsWithMdns');
app.setPath('userData',profile);app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
const deadline=setTimeout(()=>{fs.writeFileSync(output,JSON.stringify({pass:false,error:'Native engine probe timed out'},null,2));app.exit(1)},30000);
app.whenReady().then(async()=>{
 if(process.platform==='darwin')app.dock.hide();
 const win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
 // The isolated fixture needs local ICE traffic; deny all hardware permissions.
 win.webContents.session.setPermissionCheckHandler((_w,permission)=>['local-network','local-network-access','loopback-network'].includes(permission));
 win.webContents.session.setPermissionRequestHandler((_w,permission,cb)=>cb(['local-network','local-network-access','loopback-network'].includes(permission)));
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',event=>event.preventDefault());
 const page=path.join(profile,'probe.html');fs.writeFileSync(page,'<!doctype html><title>Urban Director native video QC</title><body></body>');
 try{
  await win.loadFile(page);
  const helper=fs.readFileSync(path.join(__dirname,'../src/webrtc.js'),'utf8');
  const data='data:text/javascript;base64,'+Buffer.from(helper).toString('base64');
  const result=await win.webContents.executeJavaScript(`(async()=>{
   const capabilities={secureContext:isSecureContext,peerConnection:typeof RTCPeerConnection,mediaStream:typeof MediaStream,mediaRecorder:typeof MediaRecorder,cameraAPI:typeof navigator.mediaDevices?.getUserMedia,screenCaptureAPI:typeof navigator.mediaDevices?.getDisplayMedia};
   const {createPeerConnection}=await import(${JSON.stringify(data)});
   const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const ctx=canvas.getContext('2d');let f=0;
   const paint=()=>{ctx.fillStyle=f++%2?'#267bc4':'#e7a535';ctx.fillRect(0,0,320,180)};paint();const timer=setInterval(paint,50);
   const source=canvas.captureStream(15);const video=document.createElement('video');video.muted=true;video.autoplay=true;video.playsInline=true;document.body.append(video);
   const queues={sender:[],receiver:[]};let sender,receiver;
   const ice=(target,candidate,key)=>{if(target?.remoteDescription)target.addIceCandidate(candidate).catch(()=>{});else queues[key].push(candidate)};
   sender=createPeerConnection({iceServers:[{urls:'stun:127.0.0.1:9'}],onIceCandidate:c=>ice(receiver,c,'receiver')});
   receiver=createPeerConnection({iceServers:[{urls:'stun:127.0.0.1:9'}],onIceCandidate:c=>ice(sender,c,'sender'),onTrack:s=>{video.srcObject=s;video.play().catch(()=>{})}});
   source.getTracks().forEach(t=>sender.addTrack(t,source));receiver.addTransceiver('video',{direction:'recvonly'});
   const offer=await receiver.createOffer();await receiver.setLocalDescription(offer);await sender.setRemoteDescription(offer);for(const c of queues.sender)await sender.addIceCandidate(c);
   const answer=await sender.createAnswer();await sender.setLocalDescription(answer);await receiver.setRemoteDescription(answer);for(const c of queues.receiver)await receiver.addIceCandidate(c);
   const end=Date.now()+15000;let decoded=0;
   while(Date.now()<end){const stats=await receiver.getStats();stats.forEach(r=>{if(r.type==='inbound-rtp'&&r.kind==='video')decoded=r.framesDecoded||0});if(decoded>=3&&video.videoWidth===320)break;await new Promise(r=>setTimeout(r,100))}
   const result={capabilities,connectionState:receiver.connectionState,videoWidth:video.videoWidth,videoHeight:video.videoHeight,decodedFrames:decoded,pass:receiver.connectionState==='connected'&&decoded>=3&&video.videoWidth===320};
   clearInterval(timer);source.getTracks().forEach(t=>t.stop());sender.close();receiver.close();return result;
  })()`,true);
  result.engine={electron:process.versions.electron,chromium:process.versions.chrome,platform:process.platform,arch:process.arch};result.test='Synthetic video loopback through actual production createPeerConnection helper; no camera, microphone, user session or external browser used';
  fs.writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result));clearTimeout(deadline);win.destroy();app.exit(result.pass?0:1);
 }catch(e){fs.writeFileSync(output,JSON.stringify({pass:false,error:e.message},null,2));console.error(e.message);clearTimeout(deadline);app.exit(1)}
});
