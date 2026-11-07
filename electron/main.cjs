const { app, BrowserWindow, session, shell, desktopCapturer, dialog, ipcMain, inAppPurchase } = require("electron");

const path = require('node:path');
const { createStoreKit } = require('./storeKit.cjs');
const { createDesktopAuth } = require('./desktopAuth.cjs');
const { isMonitorPopup } = require("./windowPolicy.cjs");

const APP_URL = process.env.SCENEPILOT_APP_URL ||
  "https://urbandirector.icomputeranything.com/app";
const APP_ORIGIN = new URL(APP_URL).origin;
// Chromium 152 gates local ICE routes and monitor placement separately.
// These capabilities are restricted to the configured first-party app origin.
const STUDIO_PERMISSIONS = new Set(["media", "display-capture", "window-management", "local-network", "local-network-access", "loopback-network", "fullscreen"]);

function isScenePilotUrl(value) {
  try {
    return new URL(value).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

function openExternal(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "mailto:") {
      void shell.openExternal(url.toString());
    }
  } catch {}
}

function configurePermissions() {
  const appSession = session.defaultSession;

  appSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    return STUDIO_PERMISSIONS.has(permission) && isScenePilotUrl(requestingOrigin);
  });

  appSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details?.requestingUrl || webContents.getURL();
    callback(STUDIO_PERMISSIONS.has(permission) && isScenePilotUrl(requestingUrl));
  });

  appSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (!isScenePilotUrl(request.securityOrigin)) return callback({});
    try {
      // macOS 15+ uses the OS picker; other systems get an explicit selection.
      const sources = await desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: { width: 0, height: 0 } });
      if (!sources.length) return callback({});
      const choice = await dialog.showMessageBox({
        type: "question", title: "Share screen / window", message: "Choose the source to share with Urban Director Studio",
        buttons: ["Cancel", ...sources.map(source => source.name)], defaultId: 0, cancelId: 0, noLink: true
      });
      const source = sources[choice.response - 1];
      callback(source ? { video: source } : {});
    } catch { callback({}); }
  }, { useSystemPicker: true });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    title: "Urban Director Studio",
    backgroundColor: "#080a08",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      additionalArguments: [process.mas && process.platform==='darwin' ? '--uds-mas' : '--uds-direct'],
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  window.once("ready-to-show", () => window.show());

  window.webContents.setWindowOpenHandler(({ url, frameName }) => {
    // Monitor portals require the inherited origin and opener of about:blank.
    if (isMonitorPopup(url, frameName) || isScenePilotUrl(url)) return { action: "allow" };
    openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (isScenePilotUrl(url)) return;
    event.preventDefault();
    openExternal(url);
  });

  void window.loadURL(APP_URL);
}

app.whenReady().then(() => {
  configurePermissions();
  const auth=createDesktopAuth({origin:APP_ORIGIN,openExternal:url=>shell.openExternal(url),cookies:session.defaultSession.cookies});
  const trusted=event=>event.senderFrame && event.senderFrame===event.sender.mainFrame && isScenePilotUrl(event.senderFrame.url);
  ipcMain.handle('uds:auth:start',event=>{
    if(!trusted(event)) throw new Error('Untrusted sign-in request');
    return auth.start();
  });
  ipcMain.handle('uds:auth:cancel',event=>{
    if(!trusted(event)) throw new Error('Untrusted sign-in request');
    auth.cancel();
  });
  app.on('before-quit',()=>auth.cancel());
  if(process.mas && process.platform==='darwin') {
    const store=createStoreKit({store:inAppPurchase,openExternal:url=>shell.openExternal(url),request:async(route,body)=>{
      const response=await session.defaultSession.fetch(`${APP_ORIGIN}${route}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Urban-Director-Platform':'macos','Origin':APP_ORIGIN},...(body?{body:JSON.stringify(body)}:{})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Apple verification failed.');return data;
    }});
    for(const method of ['getProduct','purchase','restore','currentEntitlement','manageSubscriptions']) {
      ipcMain.handle(`uds:store:${method}`,event=>{
        if(!trusted(event))throw new Error('Untrusted purchase request');
        return store[method]();
      });
    }
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
