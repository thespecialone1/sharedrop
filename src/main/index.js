// Initialize Sentry FIRST - before any other imports
// [REMOVED] Sentry initialization

import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import FileServer from './file-server.js';
import Tunnel from './tunnel.js';
import SessionStore from './session-store.js';
import ChatStore from './chat-store.js';
import AlbumStore from './album-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let sessionStore;
let chatStore;
let albumStore;

// Active session tracking
let activeSessionId = null;
let activeFileServer = null;
let activeTunnel = null;
let deployStartTime = null;
let isDeploying = false; // Guard against concurrent deploys

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 800,
    minHeight: 550,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      devTools: true // FORCE ENABLE FOR DEBUGGING
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    icon: path.join(__dirname, '../../build/icon.png')
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }
}

app.whenReady().then(() => {
  const userDataPath = app.getPath('userData');
  sessionStore = new SessionStore(path.join(userDataPath, 'sessions.sqlite'));
  chatStore = new ChatStore(path.join(userDataPath, 'chat.sqlite'));
  albumStore = new AlbumStore(path.join(userDataPath, 'albums.sqlite'));

  createWindow();
});

// Fix for local WebRTC discovery (ICE failed)
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');

app.on('window-all-closed', async () => {
  await stopActiveSession();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Helper: Stop active session with safety wrappers
async function stopActiveSession() {
  // Stop tunnel first
  if (activeTunnel) {
    try {
      await activeTunnel.stop();
    } catch (e) {
      console.error('Error stopping tunnel:', e.message);
    }
    activeTunnel = null;
  }

  // Stop file server
  if (activeFileServer) {
    try {
      await activeFileServer.stop();
    } catch (e) {
      console.error('Error stopping file server:', e.message);
    }
    activeFileServer = null;
  }

  // Record session duration
  if (activeSessionId && deployStartTime) {
    try {
      const duration = Date.now() - deployStartTime;
      sessionStore.stopSession(activeSessionId, duration);
    } catch (e) {
      console.error('Error recording session duration:', e.message);
    }
  }

  activeSessionId = null;
  deployStartTime = null;
}

// IPC Handlers

// Get all sessions from vault
ipcMain.handle('get-sessions', () => {
  const sessions = sessionStore.getAllSessions();
  // Add message counts
  return sessions.map(s => ({
    ...s,
    messageCount: chatStore.getMessageCount(s.id),
    isActive: s.id === activeSessionId
  }));
});

// Select folder dialog
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const folderPath = result.filePaths[0];
    return { success: true, path: folderPath, name: path.basename(folderPath) };
  }
  return { success: false };
});

// Create new session
ipcMain.handle('create-session', async (_, folderPath, password = null) => {
  // Check if session already exists for this folder
  const existing = sessionStore.findByFolderPath(folderPath);
  if (existing) {
    return { success: true, session: existing, existing: true };
  }

  const session = sessionStore.createSession(folderPath, password);
  return { success: true, session, existing: false };
});

// Deploy session (start server + tunnel)
ipcMain.handle('deploy-session', async (_, sessionId) => {
  // Prevent duplicate concurrent deploys
  if (isDeploying) {
    return { success: false, error: 'Deployment already in progress' };
  }

  // Prevent deploying the same session that's already active
  if (activeSessionId === sessionId && activeFileServer && activeTunnel) {
    return { success: false, error: 'Session is already active' };
  }

  isDeploying = true;

  try {
    // Stop any currently active session first
    await stopActiveSession();

    const session = sessionStore.getSession(sessionId);
    if (!session) {
      isDeploying = false;
      return { success: false, error: 'Session not found' };
    }

    // Start file server with session ID as room ID, pass stores
    activeFileServer = new FileServer(session.folder_path, session.password, session.id, {
      chatStore,
      sessionStore,
      albumStore
    });

    // Bridge events from FileServer to Renderer
    activeFileServer.on('members-update', (data) => {
      if (mainWindow) {
        mainWindow.webContents.send('session:members', data);
      }
    });

    activeFileServer.on('albums-updated', () => {
      if (mainWindow) {
        mainWindow.webContents.send('album:update');
      }
    });

    const port = await activeFileServer.start();

    // Start tunnel
    activeTunnel = new Tunnel(port);
    const tunnelUrl = await activeTunnel.start();

    // Update session state
    activeSessionId = sessionId;
    deployStartTime = Date.now();
    sessionStore.deploySession(sessionId);

    isDeploying = false;
    return {
      success: true,
      url: tunnelUrl,
      password: session.password,
      sessionId,
      port
    };
  } catch (error) {
    console.error('Deploy error:', error.message);
    await stopActiveSession();
    isDeploying = false;
    return { success: false, error: error.message };
  }
});

// Stop session
ipcMain.handle('stop-session', async (_, sessionId) => {
  if (activeSessionId !== sessionId) {
    return { success: false, error: 'Session not active' };
  }
  await stopActiveSession();
  return { success: true };
});

// Delete session from vault
ipcMain.handle('delete-session', async (_, sessionId) => {
  if (activeSessionId === sessionId) {
    await stopActiveSession();
  }
  // Clear all session data
  chatStore.clearRoom(sessionId);
  if (albumStore) {
    albumStore.clearSessionData(sessionId);
  }
  const deleted = sessionStore.deleteSession(sessionId);
  return { success: deleted };
});

// Wipe chat history
ipcMain.handle('wipe-session-chat', async (_, sessionId) => {
  const result = chatStore.clearRoom(sessionId);
  // Notify connected clients if session is active
  if (activeSessionId === sessionId && activeFileServer) {
    activeFileServer.io.to(sessionId).emit('history-cleared');
  }
  return { success: true, deleted: result.deleted };
});

// Rotate password
ipcMain.handle('rotate-password', async (_, sessionId) => {
  const session = sessionStore.rotatePassword(sessionId);
  if (!session) {
    return { success: false, error: 'Session not found' };
  }
  return { success: true, password: session.password };
});

// Get active session info
ipcMain.handle('get-active-session', () => {
  if (!activeSessionId) return { active: false };

  const session = sessionStore.getSession(activeSessionId);
  return {
    active: true,
    sessionId: activeSessionId,
    tunnelUrl: activeTunnel?.url,
    password: session?.password,
    deployedAt: deployStartTime
  };
});

// Browse folder contents (for owner file browser)
ipcMain.handle('browse-folder', async (_, sessionId, relativePath = '') => {
  const session = sessionStore.getSession(sessionId);
  if (!session) return { success: false, error: 'Session not found' };

  const fullPath = path.resolve(session.folder_path, relativePath);

  // Security check
  if (!fullPath.startsWith(path.resolve(session.folder_path))) {
    return { success: false, error: 'Invalid path' };
  }

  try {
    const { readdirSync, statSync } = await import('fs');
    const items = readdirSync(fullPath, { withFileTypes: true });

    const result = items.map(item => {
      try {
        const itemPath = path.join(fullPath, item.name);
        const stats = statSync(itemPath);
        return {
          name: item.name,
          isDirectory: item.isDirectory(),
          size: item.isDirectory() ? null : stats.size,
          mtime: stats.mtime
        };
      } catch {
        return null;
      }
    }).filter(Boolean);

    return { success: true, items: result, path: relativePath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Open URL in system browser
ipcMain.handle('open-external', async (_, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// --- Owner Session Controls ---

ipcMain.handle('owner-kick', async (_, { sessionId, socketId, reason }) => {
  if (activeSessionId !== sessionId || !activeFileServer) return { success: false, error: 'Session not active' };
  const result = activeFileServer.kickUser(socketId, reason);
  return { success: result };
});

ipcMain.handle('owner-ban', async (_, { sessionId, canonicalUsername, reason, scope }) => {
  if (activeSessionId !== sessionId || !activeFileServer) return { success: false, error: 'Session not active' };

  if (scope === 'global') {
    sessionStore.addGlobalBan(canonicalUsername, reason);
    // Also kick/ban from current session to immediate effect
    activeFileServer.banUser(canonicalUsername, reason);
    return { success: true };
  } else {
    const result = activeFileServer.banUser(canonicalUsername, reason);
    return { success: result };
  }
});

ipcMain.handle('owner-unban', async (_, { sessionId, canonicalUsername, scope }) => {
  if (activeSessionId !== sessionId || !activeFileServer) return { success: false, error: 'Session not active' };

  if (scope === 'global') {
    sessionStore.removeGlobalBan(canonicalUsername);
    // Also unban from session just in case
    activeFileServer.unbanUser(canonicalUsername);
    return { success: true };
  } else {
    const result = activeFileServer.unbanUser(canonicalUsername);
    return { success: result };
  }
});

ipcMain.handle('owner-get-bans', async (_, { sessionId }) => {
  if (activeSessionId !== sessionId || !activeFileServer) return { success: false, error: 'Session not active' };

  const sessionBans = activeFileServer.getBannedUsers ? activeFileServer.getBannedUsers() : { sessionBans: [], tempKicked: [] };
  // Also get global bans
  const globalBans = sessionStore.getAllGlobalBans ? sessionStore.getAllGlobalBans() : [];

  return {
    success: true,
    bans: {
      session: sessionBans.sessionBans || [],
      tempKicked: sessionBans.tempKicked || [],
      global: globalBans
    }
  };
});

// Get app version
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// ========== ALBUM IPC HANDLERS ==========

ipcMain.handle('get-albums', async (_, sessionId) => {
  if (activeSessionId !== sessionId || !activeFileServer) {
    return { success: false, error: 'Session not active' };
  }
  try {
    const response = await fetch(`http://127.0.0.1:${activeFileServer.server.address().port}/api/albums`, {
      headers: { 'X-Owner-Password': activeFileServer.password }
    });
    const data = await response.json();
    return { success: true, albums: data.albums || [] };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('create-album', async (_, { sessionId, name, type }) => {
  console.log('[IPC] create-album received:', { sessionId, name, type, activeSessionId, hasActiveFileServer: !!activeFileServer });

  if (activeSessionId !== sessionId || !activeFileServer) {
    console.warn('[IPC] create-album failed: Session not active');
    return { success: false, error: 'Session not active' };
  }
  try {
    const port = activeFileServer.server.address().port;
    const url = `http://127.0.0.1:${port}/api/albums`;
    console.log('[IPC] Sending create request to:', url);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Owner-Password': activeFileServer.password
      },
      body: JSON.stringify({ name, type, isOwner: true, createdBy: 'Owner' })
    });

    // Check for HTTP errors explicitly
    if (!response.ok) {
      const text = await response.text();
      console.error('[IPC] Create request failed with status:', response.status, text);
      return { success: false, error: `Server error: ${response.status}` };
    }

    const data = await response.json();
    console.log('[IPC] create-album response:', data);
    return data;
  } catch (e) {
    console.error('[IPC] create-album exception:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('approve-album', async (_, { sessionId, albumId }) => {
  if (activeSessionId !== sessionId || !activeFileServer) {
    return { success: false, error: 'Session not active' };
  }
  try {
    const response = await fetch(`http://127.0.0.1:${activeFileServer.server.address().port}/api/albums/${albumId}/approve`, {
      method: 'POST',
      headers: { 'X-Owner-Password': activeFileServer.password }
    });
    const data = await response.json();
    return data;
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('lock-album', async (_, { sessionId, albumId, locked }) => {
  if (activeSessionId !== sessionId || !activeFileServer) {
    return { success: false, error: 'Session not active' };
  }
  try {
    const response = await fetch(`http://127.0.0.1:${activeFileServer.server.address().port}/api/albums/${albumId}/lock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Owner-Password': activeFileServer.password
      },
      body: JSON.stringify({ locked })
    });
    const data = await response.json();
    return data;
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('delete-album', async (_, { sessionId, albumId }) => {
  if (activeSessionId !== sessionId || !activeFileServer) {
    return { success: false, error: 'Session not active' };
  }
  try {
    const response = await fetch(`http://127.0.0.1:${activeFileServer.server.address().port}/api/albums/${albumId}`, {
      method: 'DELETE',
      headers: { 'X-Owner-Password': activeFileServer.password }
    });
    const data = await response.json();
    return data;
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('add-album-item', async (_, { sessionId, albumId, filePath, metadata }) => {
  if (activeSessionId !== sessionId || !activeFileServer) {
    return { success: false, error: 'Session not active' };
  }
  try {
    const response = await fetch(`http://127.0.0.1:${activeFileServer.server.address().port}/api/albums/${albumId}/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Owner-Password': activeFileServer.password
      },
      body: JSON.stringify({ filePath, metadata })
    });
    const data = await response.json();
    return data;
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('remove-album-item', async (_, { sessionId, itemId }) => {
  if (activeSessionId !== sessionId || !activeFileServer) {
    return { success: false, error: 'Session not active' };
  }
  try {
    const response = await fetch(`http://127.0.0.1:${activeFileServer.server.address().port}/api/albums/items/${itemId}`, {
      method: 'DELETE',
      headers: { 'X-Owner-Password': activeFileServer.password }
    });
    const data = await response.json();
    return data;
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('update-album-item', async (_, { sessionId, itemId, updates }) => {
  if (activeSessionId !== sessionId || !activeFileServer) {
    return { success: false, error: 'Session not active' };
  }
  try {
    const response = await fetch(`http://127.0.0.1:${activeFileServer.server.address().port}/api/albums/items/${itemId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Owner-Password': activeFileServer.password
      },
      body: JSON.stringify(updates)
    });
    const data = await response.json();
    return data;
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('export-albums', async (_, sessionId) => {
  if (activeSessionId !== sessionId || !activeFileServer) {
    return { success: false, error: 'Session not active' };
  }
  try {
    const response = await fetch(`http://127.0.0.1:${activeFileServer.server.address().port}/api/albums/export`, {
      method: 'POST',
      headers: { 'X-Owner-Password': activeFileServer.password }
    });
    const data = await response.json();
    return { success: true, data };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('check-recovery', async (_, folderPath) => {
  if (!albumStore) {
    return { hasRecovery: false };
  }
  const existing = albumStore.findByFolderPath(folderPath);
  return { hasRecovery: !!existing, data: existing };
});

ipcMain.handle('resume-collaboration', async (_, { folderPath, newSessionId }) => {
  if (!albumStore) {
    return { success: false, error: 'Album store unavailable' };
  }
  const existing = albumStore.findByFolderPath(folderPath);
  if (!existing) {
    return { success: false, error: 'No existing collaboration found' };
  }
  const result = albumStore.migrateToNewSession(existing.session_id, newSessionId);
  return { success: true, migrated: result };
});

ipcMain.handle('start-fresh', async (_, sessionId) => {
  if (!albumStore) {
    return { success: false, error: 'Album store unavailable' };
  }
  albumStore.clearSessionData(sessionId);
  return { success: true };
});

ipcMain.handle('get-server-port', () => {
  if (activeFileServer && activeFileServer.server) {
    return { success: true, port: activeFileServer.server.address().port };
  }
  return { success: false, error: 'Server not running' };
});
