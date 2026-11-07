import test from 'node:test';
import assert from 'node:assert/strict';
import { ScenePilotRoom } from '../index.js';
import { cameraClientId, cameraVideoStatus, withoutCameraSource, programCameraSlots, listenForProgramStatus } from '../../src/cameraSession.js';
const id1='11111111-1111-4111-8111-111111111111',id2='22222222-2222-4222-8222-222222222222';
function fixture(){
 const room=new ScenePilotRoom({},{}),messages=new Map();
 const add=(id,role=null,age=0)=>{messages.set(id,[]);const s={id,role,canDirect:role==='director',userId:role==='director'?'owner':null,lastSeenAt:Date.now()-age,ws:{readyState:1,send:m=>messages.get(id).push(JSON.parse(m)),close(){this.readyState=3}}};room.sessions.set(id,s);return s};
 const director=add('director','director');room.activeDirectorId=director.id;
 const send=(s,event,payload={})=>room.handleMessage(s,JSON.stringify({event,payload}));
 return {room,messages,add,director,send};
}
test('abandoned camera leases are removed before assigning a new camera slot',()=>{
 const {room,messages,add,send,director}=fixture();const stale=add('old','camera',46000);room.cameras.set('old',{socketId:'old',slotId:1});
 const fresh=add('new');send(fresh,'camera:join',{clientId:id2});
 assert.equal(room.sessions.has('old'),false);assert.equal(room.cameras.get('new').slotId,1);assert.equal(stale.ws.readyState,3);
 assert.ok(messages.get(director.id).some(m=>m.event==='camera:left'&&m.payload.socketId==='old'));
 send(stale,'camera:join',{clientId:id1});assert.equal(room.cameras.has('old'),false);
});
test('the Director heartbeat cleans ghost cameras without ejecting healthy cameras',()=>{
 const {room,add,send,director}=fixture();add('stale','camera',46000);add('live','camera');room.cameras.set('stale',{socketId:'stale',slotId:1});room.cameras.set('live',{socketId:'live',slotId:2});
 send(director,'session:heartbeat');assert.equal(room.cameras.has('stale'),false);assert.equal(room.cameras.has('live'),true);
});
test('reopening the same camera replaces its old session and preserves its assigned slot',()=>{
 const {room,messages,add,send}=fixture();const old=add('old','camera');old.cameraClientId=id1;room.cameras.set('old',{socketId:'old',slotId:3});
 const fresh=add('new');send(fresh,'camera:join',{clientId:id1});assert.equal(room.cameras.size,1);assert.equal(room.cameras.get('new').slotId,3);
 assert.ok(messages.get('old').some(m=>m.event==='camera:replaced'));
 assert.equal(JSON.stringify(messages.get('director')).includes(id1),false,'recovery IDs are private to the session');
});
test('different devices using one invite retain independent camera slots',()=>{
 const {room,add,send}=fixture();send(add('a'),'camera:join',{clientId:id1});send(add('b'),'camera:join',{clientId:id2});
 assert.equal(room.cameras.size,2);assert.equal(room.cameras.get('a').slotId,1);assert.equal(room.cameras.get('b').slotId,2);
});
test('a focus/rejoin is idempotent and cannot move a healthy input into a lower-numbered gap',()=>{
 const {room,add,send}=fixture();const camera=add('camera','camera');room.cameras.set(camera.id,{socketId:camera.id,slotId:3});send(camera,'camera:join');assert.equal(room.cameras.get(camera.id).slotId,3);
});
test('the tenth camera is rejected without sharing or replacing slot nine',()=>{
 const {room,messages,add,send}=fixture();for(let i=1;i<=9;i++)send(add('cam'+i),'camera:join');send(add('cam10'),'camera:join');
 assert.equal(room.cameras.size,9);assert.equal(new Set([...room.cameras.values()].map(c=>c.slotId)).size,9);assert.equal(messages.get('cam10').at(-1).event,'camera:rejected');
});
test('Director reconnect preserves physical input slots and clears stale on-air indications',()=>{
 const {room,messages,add,send}=fixture();const camera=add('camera','camera');room.cameras.set(camera.id,{socketId:camera.id,slotId:4});room.liveSlots=[4];room.activeDirectorId=null;
 send(add('new-director','director'),'director:join');assert.equal(room.cameras.get('camera').slotId,4);assert.deepEqual(room.liveSlots,[]);
 assert.ok(messages.get('camera').some(m=>m.event==='program:update'&&m.payload.liveSlots.length===0));
});
test('production cloud on-air events reach the phone listener and clear when a source leaves',()=>{
 const {room,messages,add,send,director}=fixture();const handlers=new Map();const socket={on:(e,h)=>handlers.set(e,h),off:e=>handlers.delete(e)};let live=[];
 const stop=listenForProgramStatus(socket,p=>live=p.liveSlots);const a=add('a','camera'),b=add('b','camera');room.cameras.set('a',{socketId:'a',slotId:1});room.cameras.set('b',{socketId:'b',slotId:2});
 send(director,'program:update',{liveSlots:[1]});for(const m of messages.get('b'))handlers.get(m.event)?.(m.payload);assert.deepEqual(live,[1]);
 messages.set('b',[]);room.removeSession(a);for(const m of messages.get('b'))handlers.get(m.event)?.(m.payload);assert.deepEqual(live,[]);stop();assert.equal(handlers.size,0);
});
test('unknown video and a registered socket are not reported as decoded camera video',()=>{
 assert.equal(cameraVideoStatus({},null),'WAITING FOR VIDEO');assert.equal(cameraVideoStatus({}, {getVideoTracks:()=>[{readyState:'live',muted:true}]}),'WAITING FOR VIDEO');assert.equal(cameraVideoStatus({}, {getVideoTracks:()=>[{readyState:'live',muted:false}]}),'VIDEO READY');
});
test('camera recovery IDs persist locally and tolerate unavailable storage',()=>{
 const map=new Map();const storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};assert.equal(cameraClientId(storage,()=>id1),id1);assert.equal(cameraClientId(storage,()=>id2),id1);
 assert.equal(cameraClientId({getItem(){throw new Error('private mode')}},()=>id2),id2);
});
test('disconnected camera numbers cannot route replacement footage automatically',()=>{
 assert.deepEqual(withoutCameraSource({mode:'pip',primary:1,secondary:2},1),{mode:'single',primary:null,secondary:null});assert.deepEqual(withoutCameraSource({mode:'pip',primary:1,secondary:2},2),{mode:'single',primary:1,secondary:null});
 assert.deepEqual(programCameraSlots({mode:'nine'},true),[]);assert.deepEqual(programCameraSlots({mode:'pip',primary:'director',secondary:2}),[2]);
});
