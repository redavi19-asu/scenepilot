const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

async function launch(platform = 'darwin') {
  const windows = [];
  let menu;
  const app = new EventEmitter();
  app.whenReady = () => Promise.resolve();
  class BrowserWindow extends EventEmitter {
    constructor() {
      super(); windows.push(this);
      this.webContents = new EventEmitter();
      this.webContents.setWindowOpenHandler = () => {};
      this.destroyed = false; this.minimized = false;
      this.shown = 0; this.focused = 0;
    }
    isDestroyed() { return this.destroyed; }
    isMinimized() { return this.minimized; }
    restore() { this.minimized = false; }
    show() { this.shown++; }
    focus() { this.focused++; }
    loadURL() {}
    close() { this.destroyed = true; this.emit('closed'); }
  }
  const electron = {
    app, BrowserWindow,
    Menu: { buildFromTemplate: template => template, setApplicationMenu: value => { menu = value; } },
    session: { defaultSession: { cookies: {}, setPermissionCheckHandler() {}, setPermissionRequestHandler() {}, setDisplayMediaRequestHandler() {} } },
    ipcMain: { handle() {} }, shell: {}
  };
  const filename = path.join(__dirname, '../main.cjs');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    __dirname: path.dirname(filename), process: { platform, env: {} }, URL,
    require: name => name === 'electron' ? electron : name === './desktopAuth.cjs' ? { createDesktopAuth: () => ({ cancel() {} }) } : require(name.startsWith('./') ? path.join(path.dirname(filename), name) : name)
  });
  await Promise.resolve();
  return { app, windows, menu };
}

test('Window menu reopens a closed main window while a monitor remains open', async () => {
  const { windows, menu } = await launch();
  const reopen = menu.find(item => item.role === 'windowMenu').submenu.find(item => item.label === 'Open Main Window');
  assert.ok(reopen);
  windows.push({ monitor: true });
  windows[0].close();
  reopen.click();
  assert.equal(windows.length, 3);
  assert.equal(windows[2].focused, 1);
  reopen.click();
  assert.equal(windows.length, 3, 'repeated menu use must not duplicate the main window');
});

test('menu restores a minimized main window and focuses it', async () => {
  const { windows, menu } = await launch();
  windows[0].minimized = true;
  menu.find(item => item.role === 'windowMenu').submenu[0].click();
  assert.equal(windows[0].minimized, false);
  assert.equal(windows[0].shown, 1);
  assert.equal(windows[0].focused, 1);
});

test('Dock activation reopens the main window with an existing monitor', async () => {
  const { windows, app } = await launch();
  windows.push({ monitor: true });
  windows[0].close();
  app.emit('activate');
  assert.equal(windows.length, 3);
  assert.equal(windows[2].focused, 1);
});

test('custom Mac application menu is not installed on Windows', async () => {
  const { menu } = await launch('win32');
  assert.equal(menu, undefined);
});
