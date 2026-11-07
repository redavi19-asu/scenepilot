const {app,BrowserWindow}=require('electron');
const http=require('node:http');
const dgram=require('node:dgram');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const output=path.resolve(process.env.UDS_QC_OUTPUT || 'release-qc/native-engine-qc.json');fs.mkdirSync(path.dirname(output),{recursive:true});
const permissions=new Set();
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'uds-native-qc-'));
// Synthetic same-machine test only: expose the real loopback interface.
app.commandLine.appendSwitch('allow-loopback-in-peer-connection');
app.setPath('userData',profile);app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
const deadline=setTimeout(()=>{fs.writeFileSync(output,JSON.stringify({pass:false,error:'Native engine probe timed out'},null,2));app.exit(1)},30000);
app.whenReady().then(async()=>{
 if(process.platform==='darwin'&&!process.env.CI)app.dock.hide();
 const win=new BrowserWindow({show:Boolean(process.env.CI),webPreferences:{preload:path.join(__dirname,"preload.cjs"),additionalArguments:["--uds-direct"],nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
 // Match Studio media/ICE permission handling; the fixture never acquires hardware.
 win.webContents.session.setPermissionCheckHandler((_w,permission)=>{permissions.add('check:'+permission);return ['media','local-network','local-network-access','loopback-network'].includes(permission)});
 win.webContents.session.setPermissionRequestHandler((_w,permission,cb)=>{permissions.add('request:'+permission);cb(['media','local-network','local-network-access','loopback-network'].includes(permission))});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',event=>event.preventDefault());
 const server=http.createServer((_request,response)=>{response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>Urban Director native video QC</title><body></body>')});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 // Answer real STUN Binding requests locally. A deliberately closed UDP port
 // can abort sockets on macOS/Windows and invalidate the transport check.
 const stun=dgram.createSocket('udp4');
 stun.on('message',(request,remote)=>{
  if(request.length<20||request.readUInt16BE(0)!==1||request.readUInt32BE(4)!==0x2112a442)return;
  const response=Buffer.alloc(32);response.writeUInt16BE(0x101,0);response.writeUInt16BE(12,2);request.copy(response,4,4,20);
  response.writeUInt16BE(0x20,20);response.writeUInt16BE(8,22);response[25]=1;response.writeUInt16BE(remote.port^0x2112,26);
  const address=remote.address.split('.').map(Number),cookie=[0x21,0x12,0xa4,0x42];for(let i=0;i<4;i++)response[28+i]=address[i]^cookie[i];
  stun.send(response,remote.port,remote.address);
 });
 await new Promise(resolve=>stun.bind(0,'127.0.0.1',resolve));
 try{
  await win.loadURL('http://127.0.0.1:'+server.address().port);
  if(process.env.CI){win.show();win.focus();app.focus({steal:true})}
  const helper=fs.readFileSync(path.join(__dirname,'../src/webrtc.js'),'utf8');
  const data='data:text/javascript;base64,'+Buffer.from(helper).toString('base64');
  const result=await win.webContents.executeJavaScript(`(async()=>{
   const capabilities={desktopBridge:typeof window.urbanDirectorDesktop?.auth?.start==='function' && window.urbanDirectorDesktop?.store==='direct',secureContext:isSecureContext,peerConnection:typeof RTCPeerConnection,mediaStream:typeof MediaStream,mediaRecorder:typeof MediaRecorder,cameraAPI:typeof navigator.mediaDevices?.getUserMedia,screenCaptureAPI:typeof navigator.mediaDevices?.getDisplayMedia};
   navigator.mediaDevices.getUserMedia=()=>Promise.reject(new Error('Hardware capture is disabled in this synthetic fixture'));
   navigator.mediaDevices.getDisplayMedia=()=>Promise.reject(new Error('Hardware capture is disabled in this synthetic fixture'));
   const {createPeerConnection}=await import(${JSON.stringify(data)});
   const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const ctx=canvas.getContext('2d');let f=0;
   const paint=()=>{ctx.fillStyle=f++%2?'#267bc4':'#e7a535';ctx.fillRect(0,0,320,180)};paint();const timer=setInterval(paint,50);
   const source=canvas.captureStream(15);const video=document.createElement('video');video.muted=true;video.autoplay=true;video.playsInline=true;document.body.append(video);
   const iceServers=${JSON.stringify([{urls:'stun:127.0.0.1:'+stun.address().port}])};
   const queues={sender:[],receiver:[]};let sender,receiver;const candidateCounts={seen:0,loopback:0};const iceErrors=[];
   const ice=(target,candidate,key)=>{candidateCounts.seen++;const address=candidate.candidate.split(' ')[4];if(address!=='127.0.0.1'&&address!=='::1')return;candidateCounts.loopback++;if(target?.remoteDescription)target.addIceCandidate(candidate).catch(error=>iceErrors.push(error.message));else queues[key].push(candidate)};
   sender=createPeerConnection({iceServers,onIceCandidate:c=>ice(receiver,c,'receiver')});
   receiver=createPeerConnection({iceServers,onIceCandidate:c=>ice(sender,c,'sender'),onTrack:s=>{video.srcObject=s;video.play().catch(()=>{})}});
   source.getTracks().forEach(t=>sender.addTrack(t,source));receiver.addTransceiver('video',{direction:'recvonly'});
   const offer=await receiver.createOffer();await receiver.setLocalDescription(offer);await sender.setRemoteDescription(offer);for(const c of queues.sender)await sender.addIceCandidate(c);
   const answer=await sender.createAnswer();await sender.setLocalDescription(answer);await receiver.setRemoteDescription(answer);for(const c of queues.receiver)await receiver.addIceCandidate(c);
   const end=Date.now()+15000;let decoded=0;
   while(Date.now()<end){const stats=await receiver.getStats();stats.forEach(r=>{if(r.type==='inbound-rtp'&&r.kind==='video')decoded=r.framesDecoded||0});if(decoded>=3&&video.videoWidth===320)break;await new Promise(r=>setTimeout(r,100))}
   const pairs=[];(await receiver.getStats()).forEach(r=>{if(r.type==='candidate-pair')pairs.push({state:r.state,nominated:r.nominated,requestsSent:r.requestsSent,responsesReceived:r.responsesReceived})});
   const result={candidateCounts,iceErrors,pairs,capabilities,connectionState:receiver.connectionState,videoWidth:video.videoWidth,videoHeight:video.videoHeight,decodedFrames:decoded,pass:capabilities.desktopBridge && receiver.connectionState==='connected'&&decoded>=3&&video.videoWidth===320};
   clearInterval(timer);source.getTracks().forEach(t=>t.stop());sender.close();receiver.close();return result;
  })()`,true);
  result.checkedPermissions=[...permissions];result.engine={electron:process.versions.electron,chromium:process.versions.chrome,platform:process.platform,arch:process.arch};result.test='Synthetic video loopback through production createPeerConnection helper using genuine loopback-interface ICE candidates; no physical camera, LAN traversal, user session or external browser tested';
  fs.writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result));clearTimeout(deadline);win.destroy();app.exit(result.pass?0:1);
 }catch(e){fs.writeFileSync(output,JSON.stringify({pass:false,error:e.message},null,2));console.error(e.message);clearTimeout(deadline);app.exit(1)}
});
