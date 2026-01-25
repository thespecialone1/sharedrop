const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Session management
    getSessions: () => ipcRenderer.invoke('get-sessions'),
    createSession: (folderPath, password) => ipcRenderer.invoke('create-session', folderPath, password),
    deploySession: (sessionId) => ipcRenderer.invoke('deploy-session', sessionId),
    stopSession: (sessionId) => ipcRenderer.invoke('stop-session', sessionId),
    deleteSession: (sessionId) => ipcRenderer.invoke('delete-session', sessionId),
    wipeSessionChat: (sessionId) => ipcRenderer.invoke('wipe-session-chat', sessionId),
    rotatePassword: (sessionId) => ipcRenderer.invoke('rotate-password', sessionId),
    getActiveSession: () => ipcRenderer.invoke('get-active-session'),

    // Folder operations
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    browseFolder: (sessionId, relativePath) => ipcRenderer.invoke('browse-folder', sessionId, relativePath),

    // Open in browser
    openExternal: (url) => ipcRenderer.invoke('open-external', url),

    // App info
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),

    // Session Control (Owner)
    onSessionMembersUpdate: (callback) => ipcRenderer.on('session:members', (_, data) => callback(data)),
    kickUser: (sessionId, socketId, reason) => ipcRenderer.invoke('owner-kick', { sessionId, socketId, reason }),
    banUser: (sessionId, canonicalUsername, reason, scope) => ipcRenderer.invoke('owner-ban', { sessionId, canonicalUsername, reason, scope }),
    unbanUser: (sessionId, canonicalUsername, scope) => ipcRenderer.invoke('owner-unban', { sessionId, canonicalUsername, scope }),
    getBannedUsers: (sessionId) => ipcRenderer.invoke('owner-get-bans', { sessionId })
});
