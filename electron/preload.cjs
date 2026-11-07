const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('urbanDirectorDesktop', Object.freeze({
  store: process.argv.includes('--uds-mas') ? 'mac-app-store' : 'direct',
  storeKit: process.argv.includes('--uds-mas') ? Object.freeze(Object.fromEntries(['getProduct','purchase','restore','currentEntitlement','manageSubscriptions'].map(method=>[method,()=>ipcRenderer.invoke(`uds:store:${method}`)]))) : undefined,
  auth: Object.freeze({start:()=>ipcRenderer.invoke('uds:auth:start'),cancel:()=>ipcRenderer.invoke('uds:auth:cancel')})
}));
