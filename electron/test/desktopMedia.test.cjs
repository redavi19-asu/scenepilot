const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const localRequire = createRequire(require('node:path').resolve(__dirname, '../main.cjs'));

async function setup() {
  const handlers = {};
  const electron = {
    Menu: {buildFromTemplate: value => value, setApplicationMenu(){}},
    ipcMain: {handle(name,fn){handlers[name]=fn;}},
    app: {whenReady:()=>Promise.resolve(),on(){}},
    session: {defaultSession:{
      setPermissionCheckHandler(fn){handlers.check=fn;},
      setPermissionRequestHandler(fn){handlers.permission=fn;},
      setDisplayMediaRequestHandler(fn,opts){handlers.capture=fn;handlers.opts=opts;}
    }},
    desktopCapturer: {getSources:async()=>[{id:'screen:1',name:'Test Screen'}]},
    dialog: {showMessageBox:async()=>({response:1})},
    shell: {openExternal(){}},
    BrowserWindow: class { on(){} once(){} loadURL(){} webContents={setWindowOpenHandler(fn){handlers.open=fn;},on(){}}; }
  };
  vm.runInNewContext(fs.readFileSync(require('node:path').resolve(__dirname,'../main.cjs'),'utf8'), {
    __dirname:require('node:path').resolve(__dirname,'..'),require:name=>name==='electron'?electron:localRequire(name),process:{env:{},platform:'darwin'},URL
  });
  await Promise.resolve();
  return {handlers,electron};
}
test('desktop capture permissions stay scoped to the studio origin', async()=>{
  const {handlers}=await setup();
  assert.equal(handlers.check(null,'display-capture','https://urbandirector.icomputeranything.com'),true);
  assert.equal(handlers.check(null,'display-capture','https://example.com'),false);
  assert.equal(handlers.opts.useSystemPicker,true);
});
test('fallback shares only user-selected source and cancellation grants nothing', async()=>{
  const {handlers,electron}=await setup(); let result;
  const request={securityOrigin:'https://urbandirector.icomputeranything.com'};
  await handlers.capture(request,value=>result=value);
  assert.equal(result.video.id,'screen:1'); assert.equal(result.audio,undefined);
  electron.dialog.showMessageBox=async()=>({response:0});
  await handlers.capture(request,value=>result=value); assert.equal(result.video,undefined);
  await handlers.capture({securityOrigin:'https://example.com'},value=>result=value);
  assert.equal(result.video,undefined);
});
test('wrapper allows monitor portal but denies arbitrary blank window',async()=>{
  const {handlers}=await setup();
  assert.equal(handlers.open({url:'about:blank',frameName:'uds-popout-preview'}).action,'allow');
  assert.equal(handlers.open({url:'about:blank',frameName:'other'}).action,'deny');
});

test('native monitor placement and local camera routes are allowed only for Studio', async()=>{
 const {handlers}=await setup();
 for(const permission of ['window-management','local-network','local-network-access','loopback-network','fullscreen']) {
  assert.equal(handlers.check(null,permission,'https://urbandirector.icomputeranything.com'),true);
  assert.equal(handlers.check(null,permission,'https://example.com'),false);
 }
 assert.equal(handlers.check(null,'geolocation','https://urbandirector.icomputeranything.com'),false);
});


test('privileged desktop IPC rejects external origins and subframes',async()=>{
 const {handlers}=await setup();
 const frame={url:'https://example.com/'};
 assert.throws(()=>handlers['uds:auth:start']({senderFrame:frame,sender:{mainFrame:frame}}),/Untrusted/);
 const main={url:'https://urbandirector.icomputeranything.com/app'};
 assert.throws(()=>handlers['uds:auth:cancel']({senderFrame:{url:main.url},sender:{mainFrame:main}}),/Untrusted/);
 assert.doesNotThrow(()=>handlers['uds:auth:cancel']({senderFrame:main,sender:{mainFrame:main}}));
});
