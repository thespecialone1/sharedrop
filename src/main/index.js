import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import FileServer from './file-server.js';
import Tunnel from './tunnel.js';
import SessionStore from './session-store.js';
import ChatStore from './chat-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let sessionStore;
let chatStore;

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
      devTools: process.env.NODE_ENV === 'development'
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 }
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }
}

app.whenReady().then(() => {
  // Use userData directory for database (writable in production)
  const userDataPath = app.getPath('userData');
  sessionStore = new SessionStore(path.join(userDataPath, 'sessions.sqlite'));
  chatStore = new ChatStore(path.join(userDataPath, 'chat.sqlite'));

  createWindow();
});

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
      sessionStore
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
  // Also clear chat history
  chatStore.clearRoom(sessionId);
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

// Get app version
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});
