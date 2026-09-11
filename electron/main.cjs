const { app, BrowserWindow, session, shell } = require("electron");

const APP_URL = process.env.SCENEPILOT_APP_URL ||
  "https://scenepilot.ryanedavis.workers.dev/app";
const APP_ORIGIN = new URL(APP_URL).origin;

function isScenePilotUrl(value) {
  try {
    return new URL(value).origin === APP_ORIGIN;
  } catch (_) {
    return false;
  }
}

function openExternal(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "mailto:") {
      void shell.openExternal(url.toString());
    }
  } catch (_) {}
}

function configurePermissions() {
  const appSession = session.defaultSession;

  appSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    return permission === "media" && isScenePilotUrl(requestingOrigin);
  });

  appSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details?.requestingUrl || webContents.getURL();
    callback(permission === "media" && isScenePilotUrl(requestingUrl));
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    title: "ScenePilot",
    backgroundColor: "#080a08",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  window.once("ready-to-show", () => window.show());

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isScenePilotUrl(url)) return { action: "allow" };
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
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
