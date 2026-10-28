const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const localRequire = createRequire(require('node:path').resolve(__dirname, '../main.cjs'));

async function setup() {
  const handlers = {};
  const electron = {
    app: {whenReady:()=>Promise.resolve(),on(){}},
    session: {defaultSession:{
      setPermissionCheckHandler(fn){handlers.check=fn;},
      setPermissionRequestHandler(fn){handlers.permission=fn;},
      setDisplayMediaRequestHandler(fn,opts){handlers.capture=fn;handlers.opts=opts;}
    }},
    desktopCapturer: {getSources:async()=>[{id:'screen:1',name:'Test Screen'}]},
    dialog: {showMessageBox:async()=>({response:1})},
    shell: {openExternal(){}},
    BrowserWindow: class { once(){} loadURL(){} webContents={setWindowOpenHandler(fn){handlers.open=fn;},on(){}}; }
  };
  vm.runInNewContext(fs.readFileSync(require('node:path').resolve(__dirname,'../main.cjs'),'utf8'), {
    require:name=>name==='electron'?electron:localRequire(name),process:{env:{},platform:'darwin'},URL
  });
  await Promise.resolve();
  return {handlers,electron};
}
test('desktop capture permissions stay scoped to the studio origin', async()=>{
  const {handlers}=await setup();
  assert.equal(handlers.check(null,'display-capture','https://scenepilot.ryanedavis.workers.dev'),true);
  assert.equal(handlers.check(null,'display-capture','https://example.com'),false);
  assert.equal(handlers.opts.useSystemPicker,true);
});
test('fallback shares only user-selected source and cancellation grants nothing', async()=>{
  const {handlers,electron}=await setup(); let result;
  const request={securityOrigin:'https://scenepilot.ryanedavis.workers.dev'};
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
