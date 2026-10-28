const { app, BrowserWindow, session, shell, desktopCapturer, dialog } = require("electron");

const { isMonitorPopup } = require("./windowPolicy.cjs");

const APP_URL = process.env.SCENEPILOT_APP_URL ||
  "https://scenepilot.ryanedavis.workers.dev/app";
const APP_ORIGIN = new URL(APP_URL).origin;

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
    return ["media", "display-capture"].includes(permission) && isScenePilotUrl(requestingOrigin);
  });

  appSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details?.requestingUrl || webContents.getURL();
    callback(["media", "display-capture"].includes(permission) && isScenePilotUrl(requestingUrl));
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
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
