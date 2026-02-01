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
    getServerPort: () => ipcRenderer.invoke('get-server-port'),

    // Session Control (Owner)
    onSessionMembersUpdate: (callback) => ipcRenderer.on('session:members', (_, data) => callback(data)),
    kickUser: (sessionId, socketId, reason) => ipcRenderer.invoke('owner-kick', { sessionId, socketId, reason }),
    banUser: (sessionId, canonicalUsername, reason, scope) => ipcRenderer.invoke('owner-ban', { sessionId, canonicalUsername, reason, scope }),
    unbanUser: (sessionId, canonicalUsername, scope) => ipcRenderer.invoke('owner-unban', { sessionId, canonicalUsername, scope }),
    getBannedUsers: (sessionId) => ipcRenderer.invoke('owner-get-bans', { sessionId }),

    // Album management
    getAlbums: (sessionId) => ipcRenderer.invoke('get-albums', sessionId),
    createAlbum: (sessionId, name, type) => ipcRenderer.invoke('create-album', { sessionId, name, type }),
    approveAlbum: (sessionId, albumId) => ipcRenderer.invoke('approve-album', { sessionId, albumId }),
    lockAlbum: (sessionId, albumId, locked) => ipcRenderer.invoke('lock-album', { sessionId, albumId, locked }),
    deleteAlbum: (sessionId, albumId) => ipcRenderer.invoke('delete-album', { sessionId, albumId }),
    addAlbumItem: (sessionId, albumId, filePath, metadata) => ipcRenderer.invoke('add-album-item', { sessionId, albumId, filePath, metadata }),
    removeAlbumItem: (sessionId, itemId) => ipcRenderer.invoke('remove-album-item', { sessionId, itemId }),
    updateAlbumItem: (sessionId, itemId, updates) => ipcRenderer.invoke('update-album-item', { sessionId, itemId, updates }),
    exportAlbums: (sessionId) => ipcRenderer.invoke('export-albums', sessionId),
    onAlbumUpdate: (callback) => {
        const handler = (_, data) => callback(data);
        ipcRenderer.on('album:update', handler);
        return () => ipcRenderer.removeListener('album:update', handler);
    },

    // Recovery
    checkRecovery: (folderPath) => ipcRenderer.invoke('check-recovery', folderPath),
    resumeCollaboration: (folderPath, newSessionId) => ipcRenderer.invoke('resume-collaboration', { folderPath, newSessionId }),
    startFresh: (sessionId) => ipcRenderer.invoke('start-fresh', sessionId)
});
