const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

let mainWindow;
let serverProcess;
let tunnelProcess;
let tunnelUrl = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 700,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        titleBarStyle: 'hiddenInset',
        title: 'ShareDrop'
    });

    mainWindow.loadFile('electron-ui.html');
}

function startServer() {
    // When packaged, __dirname points to app.asar, need to use resources path
    const serverPath = app.isPackaged 
        ? path.join(process.resourcesPath, 'file-share-app')
        : path.join(__dirname, 'file-share-app');
    
    console.log('App packaged:', app.isPackaged);
    console.log('Starting server from:', serverPath);
    console.log('File exists:', fs.existsSync(serverPath));
    
    serverProcess = spawn(serverPath);
    
    serverProcess.stdout.on('data', (data) => {
        console.log(`Server: ${data}`);
    });
    
    serverProcess.stderr.on('data', (data) => {
        console.error(`Server Error: ${data}`);
    });
    
    serverProcess.on('error', (error) => {
        console.error('Failed to start server:', error);
        if (mainWindow) {
            mainWindow.webContents.send('error', 'Failed to start server: ' + error.message);
        }
    });
    
    serverProcess.on('close', (code) => {
        console.log('Server process closed with code:', code);
    });
    
    setTimeout(checkCloudflared, 2000);
}

function checkCloudflared() {
    // Try common paths for cloudflared
    const paths = [
        '/opt/homebrew/bin/cloudflared',
        '/usr/local/bin/cloudflared',
        'cloudflared'
    ];
    
    // Try to start tunnel with first available path
    startTunnel(paths[0]);
}

function installCloudflared() {
    const installProcess = spawn('brew', ['install', 'cloudflare/cloudflare/cloudflared']);
    
    installProcess.on('close', (code) => {
        if (code === 0) {
            mainWindow.webContents.send('status', 'Cloudflared installed!');
            startTunnel();
        } else {
            mainWindow.webContents.send('error', 'Failed to install cloudflared. Please install manually: brew install cloudflare/cloudflare/cloudflared');
        }
    });
}

function startTunnel(cloudflaredPath) {
    mainWindow.webContents.send('status', 'Starting tunnel...');
    console.log('Starting cloudflared from:', cloudflaredPath);
    tunnelProcess = spawn(cloudflaredPath, ['tunnel', '--url', 'http://localhost:8080']);
    
    let stderrBuffer = '';
    
    tunnelProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('Tunnel stdout:', output);
    });
    
    tunnelProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderrBuffer += output;
        console.log('Tunnel stderr:', output);
        
        // Check for URL in current chunk or accumulated buffer
        const match = stderrBuffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (match && !tunnelUrl) {
            tunnelUrl = match[0];
            console.log('✓ Tunnel URL found:', tunnelUrl);
            mainWindow.webContents.send('tunnel-ready', tunnelUrl);
            mainWindow.webContents.send('status', 'Tunnel active!');
        }
    });
    
    tunnelProcess.on('error', (error) => {
        console.error('Tunnel error:', error);
        mainWindow.webContents.send('error', 'Failed to start tunnel: ' + error.message);
    });
    
    tunnelProcess.on('close', (code) => {
        console.log('Tunnel process closed with code:', code);
        if (code !== 0 && !tunnelUrl) {
            mainWindow.webContents.send('error', 'Tunnel failed to start');
        }
    });
}

ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
});

ipcMain.handle('create-share', async (event, folderPath) => {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({ folder_path: folderPath });
        
        const options = {
            hostname: 'localhost',
            port: 8080,
            path: '/api/shares',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };
        
        const req = http.request(options, (res) => {
            let responseData = '';
            
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            
            res.on('end', () => {
                if (res.statusCode === 200) {
                    const share = JSON.parse(responseData);
                    resolve({
                        ...share,
                        public_url: tunnelUrl ? `${tunnelUrl}/share/${share.id}` : `http://localhost:8080/share/${share.id}`
                    });
                } else {
                    reject(new Error(responseData));
                }
            });
        });
        
        req.on('error', (error) => {
            reject(error);
        });
        
        req.write(data);
        req.end();
    });
});

ipcMain.handle('get-tunnel-url', () => {
    return tunnelUrl;
});

app.whenReady().then(() => {
    createWindow();
    startServer();
});

app.on('window-all-closed', () => {
    if (serverProcess) serverProcess.kill();
    if (tunnelProcess) tunnelProcess.kill();
    app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
