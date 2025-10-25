const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    createShare: (folderPath) => ipcRenderer.invoke('create-share', folderPath),
    getTunnelUrl: () => ipcRenderer.invoke('get-tunnel-url'),
    onStatus: (callback) => ipcRenderer.on('status', (event, message) => callback(message)),
    onTunnelReady: (callback) => ipcRenderer.on('tunnel-ready', (event, url) => callback(url)),
    onError: (callback) => ipcRenderer.on('error', (event, message) => callback(message)),
    onServerReady: (callback) => ipcRenderer.on('server-ready', () => callback())
});
