import express from 'express';
import session from 'express-session';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { Server } from 'socket.io';
import http from 'http';
import ChatStore from './chat-store.js';
import SessionStore from './session-store.js';
import { generateZip } from './zip.js';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

import ffmpegPath from 'ffmpeg-static';
import { exec } from 'child_process';

const EBOOK_CONVERT_BIN = process.env.CALIBRE_BIN_PATH || 'ebook-convert';
let hasEbookConvert = false;
exec(`${EBOOK_CONVERT_BIN} --version`, (err) => {
    if (!err) {
        hasEbookConvert = true;
        console.log('ebook-convert (Calibre) is available for MOBI conversion.');
    } else {
        console.log('ebook-convert (Calibre) not found. MOBI preview will be disabled.');
    }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Preview cache directory
const CACHE_DIR = path.join(__dirname, 'cache/previews');
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Placeholder image for failed previews (1x1 gray pixel)
const PLACEHOLDER_JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQCEARIxAAAJGAX/2Q==', 'base64');

const getCacheKey = (filePath) => {
    try {
        const stat = fs.statSync(filePath);
        return crypto.createHash('md5').update(`${filePath}:${stat.mtime.getTime()}`).digest('hex');
    } catch {
        return crypto.createHash('md5').update(filePath).digest('hex');
    }
};

const getCachedPreview = (cacheKey) => {
    const cachePath = path.join(CACHE_DIR, `${cacheKey}.jpg`);
    if (fs.existsSync(cachePath)) return cachePath;
    return null;
};

const saveToCacheAsync = (cacheKey, buffer) => {
    if (buffer && buffer.length > 100) {
        const cachePath = path.join(CACHE_DIR, `${cacheKey}.jpg`);
        fs.writeFile(cachePath, buffer, () => { });
    }
};

// Filter hidden/system files (macOS AppleDouble, .DS_Store, etc.)
const HIDDEN_FILE_PATTERNS = [
    /^\._/,              // AppleDouble metadata files
    /^\.DS_Store$/i,
    /^\.Spotlight-V100$/i,
    /^\.Trashes$/i,
    /^\.fseventsd$/i,
    /^\.TemporaryItems$/i,
    /^\.localized$/i,
    /^\.__MACOSX$/i,
    /^desktop\.ini$/i,  // Windows
    /^Thumbs\.db$/i,    // Windows
];

const isHiddenSystemFile = (filename) => {
    if (!filename) return true;
    // All dotfiles are hidden by default
    if (filename.startsWith('.')) return true;
    // Check against patterns
    return HIDDEN_FILE_PATTERNS.some(pattern => pattern.test(filename));
};

class FileServer extends EventEmitter {
    constructor(sharedPath, password, sessionId = null, stores = {}) {
        super();
        this.sharedPath = sharedPath;
        this.password = password;
        // Use sessionId if provided, otherwise derive from path (for backwards compatibility)
        this.roomId = sessionId || crypto.createHash('sha256').update(path.resolve(sharedPath)).digest('hex').slice(0, 12);
        this.sessionId = sessionId; // Store for user tracking
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = new Server(this.server);
        this.activeUsers = new Map();
        // Use passed stores or null (some features may be limited)
        this.chatStore = stores.chatStore || null;
        this.sessionStore = stores.sessionStore || null;

        // Track connections for proper cleanup
        this.activeSockets = new Set();
        this.isStopped = false;

        // Voice room state: Map<roomId, { hostSocketId, participants: Set<socketId> }>
        this.voiceRooms = new Map();

        // Session Control State
        this.sessionBans = new Set(); // Set<canonicalUsername>
        this.tempKickedUsers = new Set(); // Set<canonicalUsername>

        // Track HTTP connections
        this.server.on('connection', (socket) => {
            this.activeSockets.add(socket);
            socket.on('close', () => this.activeSockets.delete(socket));
        });

        this.setupMiddleware();
        this.setupRoutes();
        this.setupFrontend();
        this.setupSockets();
    }

    emitMembersUpdate(roomId = this.roomId) {
        const members = Array.from(this.activeUsers.values())
            .filter(u => u.roomId === roomId)
            .map(u => ({
                username: u.username,
                canonicalUsername: u.canonicalUsername,
                color: u.color,
                joinedAt: u.joinedAt,
                socketId: u.socketId // Active socket ID
            }));

        // Emit locally for Main Process to pick up
        this.emit('members-update', { roomId, members });
        // Broadcast to owner if they are listening via socket? No, owner uses IPC. Active users don't need full list usually?
        // Actually, let's broadcast to the room too so everyone sees who is there (optional, but good for transparency)
        this.io.to(roomId).emit('session:members', { members });
    }

    kickUser(socketId, reason = 'Kicked by owner') {
        const user = this.activeUsers.get(socketId);
        if (!user) return false;

        const socket = Array.from(this.activeSockets).find(s => s.id === socketId);
        if (socket) {
            socket.emit('session:kicked', { reason, scope: 'session' });
            socket.disconnect(true);
        }

        // Add to temp kicked (cleared on server restart)
        this.tempKickedUsers.add(user.canonicalUsername);

        this.activeUsers.delete(socketId);
        this.emitMembersUpdate(user.roomId);
        return true;
    }

    banUser(canonicalUsername, reason = 'Banned by owner') {
        this.sessionBans.add(canonicalUsername);

        // Find and kick all active sockets for this user
        for (const [socketId, user] of this.activeUsers.entries()) {
            if (user.canonicalUsername === canonicalUsername) {
                const socket = Array.from(this.activeSockets).find(s => s.id === socketId);
                if (socket) {
                    socket.emit('session:kicked', { reason, scope: 'session' });
                    socket.disconnect(true);
                }
                this.activeUsers.delete(socketId);
            }
        }
        this.emitMembersUpdate();
        return true;
    }

    unbanUser(canonicalUsername) {
        this.sessionBans.delete(canonicalUsername);
        this.tempKickedUsers.delete(canonicalUsername);
        // Also check global bans if we want to support unbanning global via session UI?
        // For now, assume this is session-scope unban.
        this.emitMembersUpdate();
        return true;
    }

    getBannedUsers() {
        return {
            sessionBans: Array.from(this.sessionBans),
            tempKicked: Array.from(this.tempKickedUsers)
        };
    }

    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(session({
            secret: crypto.randomBytes(32).toString('hex'),
            resave: false,
            saveUninitialized: false,
            cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
        }));
    }

    setupFrontend() {
        if (process.env.NODE_ENV === 'development') {
            import('http-proxy-middleware').then(({ createProxyMiddleware }) => {
                this.app.use(createProxyMiddleware({
                    target: 'http://localhost:3000',
                    changeOrigin: true,
                    ws: true,
                    pathFilter: (p) => !p.startsWith('/api') && !p.startsWith('/socket.io')
                }));
            }).catch(() => { });
        } else {
            // Production mode - ensure dist exists
            const distPath = path.join(__dirname, '../../dist');
            const indexPath = path.join(distPath, 'index.html');
            if (fs.existsSync(indexPath)) {
                this.app.use(express.static(distPath));
                this.app.get('*', (req, res) => {
                    if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) return res.status(404).send('Not Found');
                    res.sendFile(indexPath);
                });
            } else {
                console.error('Production build not found at:', distPath);
            }
        }
    }

    setupRoutes() {
        this.app.post('/api/auth', (req, res) => {
            if (req.body.password === this.password) {
                req.session.authenticated = true;
                res.json({ success: true });
            } else res.status(401).json({ success: false });
        });

        const requireAuth = (req, res, next) => {
            // Allow certain read-only auth/room checks without full validation
            if (req.originalUrl.startsWith('/api/auth') || req.originalUrl.startsWith('/api/room')) {
                return next();
            }

            if (req.session.authenticated) {
                // Check bans
                if (req.session.username) {
                    const canonicalName = req.session.username.toLowerCase();
                    if (this.sessionBans.has(canonicalName) || this.tempKickedUsers.has(canonicalName)) {
                        return res.status(403).json({ error: 'Access Denied: You have been kicked or banned.' });
                    }
                    if (this.sessionStore && this.sessionStore.isGloballyBanned(canonicalName)) {
                        return res.status(403).json({ error: 'Access Denied: Global Ban.' });
                    }
                }
                return next();
            }
            res.status(401).json({ error: 'Unauthorized' });
        };

        // endpoint to bind username to session for ban enforcement
        this.app.post('/api/register-client', requireAuth, (req, res) => {
            const { username } = req.body;
            if (username) {
                req.session.username = username;
                req.session.save();
            }
            res.json({ success: true });
        });

        const requireOwner = (req, res, next) => {
            const ownerPassword = req.headers['x-owner-password'];
            if (ownerPassword && ownerPassword === this.password) next();
            else res.status(401).json({ error: 'Unauthorized' });
        };

        const setOwnerCors = (res) => {
            res.set('Access-Control-Allow-Origin', '*');
            res.set('Access-Control-Allow-Headers', 'Content-Type, X-Owner-Password');
        };

        this.app.get('/api/browse', requireAuth, (req, res) => {
            const relPath = req.query.path || '';
            const search = (req.query.search || '').toLowerCase();
            const sort = req.query.sort || 'name_asc';
            const fullPath = path.resolve(this.sharedPath, relPath);

            if (!fullPath.startsWith(path.resolve(this.sharedPath))) return res.status(403).send('Forbidden');

            try {
                let items = fs.readdirSync(fullPath, { withFileTypes: true });
                let stats = { folders: 0, images: 0, videos: 0, others: 0 };

                // Filter out hidden/system files first
                items = items.filter(item => !isHiddenSystemFile(item.name));

                let result = items.map(item => {
                    try {
                        const statsObj = fs.statSync(path.join(fullPath, item.name));
                        const isDir = item.isDirectory();
                        if (isDir) stats.folders++;
                        else {
                            const ext = path.extname(item.name).toLowerCase();
                            if (['.jpg', '.jpeg', '.png', '.webp', '.heic', '.dng', '.gif', '.bmp', '.raw', '.arw'].includes(ext)) stats.images++;
                            else if (['.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v'].includes(ext)) stats.videos++;
                            else stats.others++;
                        }
                        return { name: item.name, isDirectory: isDir, size: isDir ? null : statsObj.size, mtime: statsObj.mtime };
                    } catch {
                        return null;
                    }
                }).filter(Boolean);

                if (search) result = result.filter(i => i.name.toLowerCase().includes(search));
                result.sort((a, b) => {
                    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
                    const [field, order] = sort.split('_');
                    let comp = field === 'size' ? ((a.size || 0) - (b.size || 0)) : field === 'date' ? (new Date(a.mtime) - new Date(b.mtime)) : a.name.localeCompare(b.name);
                    return order === 'desc' ? -comp : comp;
                });

                res.json({ path: relPath, items: result, stats, roomId: this.roomId });
            } catch (e) { res.status(404).send('Not Found'); }
        });

        this.app.get('/api/room', (req, res) => {
            if (req.session.authenticated || req.headers['x-owner-password'] === this.password) {
                setOwnerCors(res);
                res.json({ roomId: this.roomId });
            } else {
                res.status(401).json({ error: 'Unauthorized' });
            }
        });

        this.app.options('/api/room/:roomId/messages', (req, res) => {
            setOwnerCors(res);
            res.sendStatus(204);
        });

        this.app.delete('/api/room/:roomId/messages', requireOwner, (req, res) => {
            setOwnerCors(res);
            if (req.params.roomId !== this.roomId) return res.status(404).json({ error: 'Not Found' });
            const result = this.chatStore.clearRoom(this.roomId);
            this.io.to(this.roomId).emit('history-cleared');
            res.json({ success: true, deleted: result?.deleted || 0 });
        });

        // Preview endpoint - generates thumbnails
        this.app.get('/api/preview', requireAuth, async (req, res) => {
            const fullPath = path.resolve(this.sharedPath, req.query.path || '');
            const filename = path.basename(fullPath);
            const ext = path.extname(fullPath).toLowerCase();

            // Block hidden/system files
            if (isHiddenSystemFile(filename)) {
                return res.status(403).json({ error: 'System metadata file' });
            }

            if (!fs.existsSync(fullPath)) {
                return res.set('Content-Type', 'image/jpeg').send(PLACEHOLDER_JPG);
            }

            // --- Enhanced Preview Handling (Ebooks, Text, JSON) ---
            const format = req.query.format; // epub, mobi, text, json, auto

            // EPUB - Serve directly
            if (ext === '.epub' || format === 'epub') {
                res.set('Content-Type', 'application/epub+zip');
                return res.sendFile(fullPath);
            }

            // MOBI - Convert to EPUB
            if (ext === '.mobi' || format === 'mobi') {
                if (!hasEbookConvert) {
                    return res.status(501).json({
                        error: 'MOBI conversion unavailable. Server lacks Calibre (ebook-convert).',
                        downloadUrl: `/api/file?path=${encodeURIComponent(req.query.path)}`
                    });
                }

                const cacheKey = getCacheKey(fullPath) + '.epub';
                const cachePath = path.join(CACHE_DIR, cacheKey);

                // Serve cached if ready
                if (fs.existsSync(cachePath)) {
                    res.set('Content-Type', 'application/epub+zip');
                    return res.sendFile(cachePath);
                }

                // Check if conversion is already in progress (simple lock via temp file existence or memory?)
                // For simplicity, we'll just try to convert. Concurrent requests might be wasteful but safe enough for V1.
                // Better: return 202 Accepted or stream 
                // Client expects a URL. If we return 202, client needs to poll. 
                // The PLAN says: "Conversion should be async: show spinner and poll conversion status"
                // For this endpoint, if we want to blocking-wait or return immediately?
                // Let's implement a "check or start" logic.

                // If not exist, start conversion and return 202
                // We'll use a .lock file to signal in-progress
                const lockFile = cachePath + '.lock';
                if (fs.existsSync(lockFile)) {
                    // Check if lock is stale (> 5 mins)
                    const stats = fs.statSync(lockFile);
                    if (Date.now() - stats.mtimeMs > 5 * 60 * 1000) {
                        fs.unlinkSync(lockFile); // Remove stale lock
                    } else {
                        return res.status(202).json({ status: 'converting' });
                    }
                }

                // Start conversion
                fs.writeFileSync(lockFile, 'locked');
                console.log(`Starting conversion: ${filename} -> EPUB`);

                exec(`${EBOOK_CONVERT_BIN} "${fullPath}" "${cachePath}"`, (err, stdout, stderr) => {
                    try { fs.unlinkSync(lockFile); } catch { }
                    if (err) {
                        console.error('MOBI conversion failed:', stderr);
                        // We can't reply to the original request if we already returned 202? 
                        // Actually we haven't returned yet if we are waiting? 
                        // If we want async polling, we MUST return 202 now.
                    } else {
                        console.log('MOBI conversion success:', cachePath);
                    }
                });

                return res.status(202).json({ status: 'converting' });
            }

            // TEXT - Serve with range support / plain text
            if (ext === '.txt' || format === 'text') {
                const stat = fs.statSync(fullPath);
                // Cap size for safety if no range? Client should handle ranges.
                // But for simple "preview", let's just stream it.
                res.set('Content-Type', 'text/plain; charset=utf-8');
                return fs.createReadStream(fullPath).pipe(res);
            }

            // JSON - Serve raw or pretty
            if (ext === '.json' || format === 'json') {
                // Determine size
                const stat = fs.statSync(fullPath);
                const PREVIEW_MAX_BYTES = process.env.PREVIEW_MAX_BYTES || 5 * 1024 * 1024; // 5MB limit for full parse

                if (stat.size > PREVIEW_MAX_BYTES && req.query.pretty) {
                    return res.status(413).json({
                        error: 'File too large for server-side pretty print.',
                        downloadUrl: `/api/file?path=${encodeURIComponent(req.query.path)}`
                    });
                }

                if (req.query.pretty) {
                    try {
                        const content = fs.readFileSync(fullPath, 'utf8');
                        const json = JSON.parse(content);
                        return res.json(json); // Express auto-prettifies based on env or we can force it
                    } catch (e) {
                        // Fallback to raw if invalid json
                        res.set('Content-Type', 'application/json');
                        return fs.createReadStream(fullPath).pipe(res);
                    }
                } else {
                    res.set('Content-Type', 'application/json');
                    return fs.createReadStream(fullPath).pipe(res);
                }
            }

            // --- End Enhanced Preview ---

            try {
                const cacheKey = getCacheKey(fullPath);
                const cached = getCachedPreview(cacheKey);
                if (cached) return res.sendFile(cached);

                // Standard images that Sharp handles well
                if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'].includes(ext)) {
                    try {
                        // .rotate() without args auto-applies EXIF orientation
                        const buf = await sharp(fullPath).rotate().resize(400, 400, { fit: 'cover' }).jpeg({ quality: 75 }).toBuffer();
                        saveToCacheAsync(cacheKey, buf);
                        return res.set('Content-Type', 'image/jpeg').send(buf);
                    } catch (e) {
                        console.error('Sharp preview error:', e.message);
                        return res.set('Content-Type', 'image/jpeg').send(PLACEHOLDER_JPG);
                    }
                }

                // HEIC/DNG/RAW - use FFmpeg
                if (['.heic', '.heif', '.dng', '.raw', '.arw', '.cr2', '.nef'].includes(ext)) {
                    return this.ffmpegPreview(fullPath, cacheKey, res);
                }

                // Video thumbnail
                if (['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v'].includes(ext)) {
                    return this.ffmpegVideoThumb(fullPath, cacheKey, res);
                }

                res.set('Content-Type', 'image/jpeg').send(PLACEHOLDER_JPG);
            } catch (e) {
                console.error('Preview error:', e.message);
                res.set('Content-Type', 'image/jpeg').send(PLACEHOLDER_JPG);
            }
        });

        // Stream endpoint - serves full-size media with range support
        this.app.get('/api/stream', requireAuth, async (req, res) => {
            const fullPath = path.resolve(this.sharedPath, req.query.path || '');
            const filename = path.basename(fullPath);
            const ext = path.extname(fullPath).toLowerCase();

            // Block hidden/system files
            if (isHiddenSystemFile(filename)) {
                return res.status(403).json({ error: 'System metadata file' });
            }

            if (!fs.existsSync(fullPath)) return res.status(404).send('Not Found');

            try {
                const stat = fs.statSync(fullPath);
                const fileSize = stat.size;

                // Native browser-supported formats with range request support
                if (['.mp4', '.webm', '.mov', '.m4v', '.mp3', '.wav', '.ogg', '.flac', '.m4a', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'].includes(ext)) {
                    const range = req.headers.range;
                    if (range) {
                        const parts = range.replace(/bytes=/, "").split("-");
                        const start = parseInt(parts[0], 10);
                        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                        const chunksize = (end - start) + 1;

                        const mimeTypes = {
                            '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/x-m4v',
                            '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.m4a': 'audio/mp4',
                            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp'
                        };

                        res.writeHead(206, {
                            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                            'Accept-Ranges': 'bytes',
                            'Content-Length': chunksize,
                            'Content-Type': mimeTypes[ext] || 'application/octet-stream',
                        });
                        fs.createReadStream(fullPath, { start, end }).pipe(res);
                    } else {
                        res.set('Accept-Ranges', 'bytes');
                        res.sendFile(fullPath);
                    }
                    return;
                }

                // HEIC/DNG/RAW - convert to JPEG
                if (['.heic', '.heif', '.dng', '.raw', '.arw', '.cr2', '.nef', '.orf', '.rw2'].includes(ext)) {
                    res.set('Content-Type', 'image/jpeg');
                    const ffmpeg = spawn(ffmpegPath, ['-i', fullPath, '-f', 'image2', '-q:v', '2', 'pipe:1']);
                    ffmpeg.stdout.pipe(res);
                    ffmpeg.stderr.on('data', () => { });
                    ffmpeg.on('error', () => { if (!res.headersSent) res.status(500).end(); });
                    res.on('close', () => ffmpeg.kill('SIGKILL'));
                    return;
                }

                // Unsupported Video - transcode
                if (['.mkv', '.avi', '.wmv', '.flv', '.ts'].includes(ext)) {
                    res.setHeader('Content-Type', 'video/mp4');
                    const ffmpeg = spawn(ffmpegPath, [
                        '-i', fullPath,
                        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
                        '-c:a', 'aac', '-b:a', '128k',
                        '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+faststart',
                        'pipe:1'
                    ]);
                    ffmpeg.stdout.pipe(res);
                    ffmpeg.stderr.on('data', () => { });
                    ffmpeg.on('error', () => { if (!res.headersSent) res.status(500).end(); });
                    res.on('close', () => ffmpeg.kill('SIGKILL'));
                    return;
                }

                res.sendFile(fullPath);
            } catch (e) {
                console.error('Stream error:', e.message);
                if (!res.headersSent) res.status(500).send('Error');
            }
        });

        this.app.get('/api/file', requireAuth, (req, res) => {
            const fullPath = path.resolve(this.sharedPath, req.query.path || '');
            const filename = path.basename(fullPath);

            // Block hidden/system files
            if (isHiddenSystemFile(filename)) {
                return res.status(403).json({ error: 'System metadata file' });
            }

            if (fs.existsSync(fullPath)) res.download(fullPath);
            else res.status(404).send('Not Found');
        });

        this.app.post('/api/download-zip', requireAuth, (req, res) => generateZip(this.sharedPath, req.body.paths, res));

        // RTC configuration endpoint for voice rooms
        this.app.get('/api/rtc-config', requireAuth, (req, res) => {
            const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
            // Add TURN server if configured
            if (process.env.TURN_URL) {
                iceServers.push({
                    urls: process.env.TURN_URL,
                    username: process.env.TURN_USER || '',
                    credential: process.env.TURN_PASS || ''
                });
            }
            res.json({ iceServers });
        });

        // Voice room status endpoint
        this.app.get('/api/voice-status', requireAuth, (req, res) => {
            const voiceRoom = this.voiceRooms.get(this.roomId);
            if (voiceRoom) {
                res.json({
                    active: true,
                    hostSocketId: voiceRoom.hostSocketId,
                    participantCount: voiceRoom.participants.size
                });
            } else {
                res.json({ active: false });
            }
        });
    }

    ffmpegPreview(fullPath, cacheKey, res) {
        res.set('Content-Type', 'image/jpeg');

        // Safety: Only attempt FFmpeg on supported video/image types
        const ext = path.extname(fullPath).toLowerCase();
        const supported = ['.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff'];
        if (!supported.includes(ext)) {
            return res.send(PLACEHOLDER_JPG);
        }

        let finished = false;

        const ffmpeg = spawn(ffmpegPath, [
            '-i', fullPath, '-vf', 'scale=400:-1', '-frames:v', '1', '-f', 'image2', '-q:v', '3', 'pipe:1'
        ]);

        // Timeout after 10 seconds
        const timeout = setTimeout(() => {
            if (!finished) {
                finished = true;
                console.log('FFmpeg preview timeout for:', path.basename(fullPath));
                try { ffmpeg.kill('SIGKILL'); } catch (e) { }
                if (!res.headersSent) res.send(PLACEHOLDER_JPG);
            }
        }, 10000);

        const chunks = [];
        ffmpeg.stdout.on('data', (chunk) => chunks.push(chunk));
        ffmpeg.stdout.on('end', () => {
            if (finished) return;
            finished = true;
            clearTimeout(timeout);
            const buf = Buffer.concat(chunks);
            if (buf.length > 100) {
                saveToCacheAsync(cacheKey, buf);
                res.send(buf);
            } else {
                res.send(PLACEHOLDER_JPG);
            }
        });
        ffmpeg.stderr.on('data', (data) => {
            // Log FFmpeg errors for debugging
            const msg = data.toString();
            if (msg.includes('Error') || msg.includes('error')) {
                console.log('FFmpeg stderr:', msg.slice(0, 200));
            }
        });
        ffmpeg.on('error', (e) => {
            if (finished) return;
            finished = true;
            clearTimeout(timeout);
            console.error('FFmpeg error:', e.message);
            if (!res.headersSent) res.send(PLACEHOLDER_JPG);
        });
        ffmpeg.on('close', (code) => {
            if (finished) return;
            finished = true;
            clearTimeout(timeout);
            if (code !== 0 && !res.headersSent) res.send(PLACEHOLDER_JPG);
        });
    }

    ffmpegVideoThumb(fullPath, cacheKey, res) {
        res.set('Content-Type', 'image/jpeg');
        const ffmpeg = spawn(ffmpegPath, [
            '-i', fullPath, '-ss', '00:00:01', '-vframes', '1', '-f', 'image2', '-vf', 'scale=400:-1', 'pipe:1'
        ]);
        const chunks = [];
        ffmpeg.stdout.on('data', (chunk) => chunks.push(chunk));
        ffmpeg.stdout.on('end', () => {
            const buf = Buffer.concat(chunks);
            if (buf.length > 100) {
                saveToCacheAsync(cacheKey, buf);
                res.send(buf);
            } else {
                res.send(PLACEHOLDER_JPG);
            }
        });
        ffmpeg.stderr.on('data', () => { });
        ffmpeg.on('error', () => res.send(PLACEHOLDER_JPG));
        ffmpeg.on('close', (code) => {
            if (code !== 0 && !res.headersSent) res.send(PLACEHOLDER_JPG);
        });
    }

    setupSockets() {
        this.io.on('connection', (socket) => {
            const getPresenceList = (roomId) => Array.from(this.activeUsers.values())
                .filter(u => u.roomId === roomId)
                .map(u => u.username);

            socket.on('check-username', ({ name, roomId }, cb) => {
                const room = roomId || this.roomId;
                const available = !Array.from(this.activeUsers.values()).some(u => u.roomId === room && u.username === name);
                if (cb) cb({ available });
            });

            socket.on('join-session', async ({ username, color, roomId }) => {
                const room = roomId || this.roomId;
                const canonicalName = (username || '').trim().toLowerCase();

                // 1. Validate Input
                if (!canonicalName || canonicalName.length < 2) {
                    return socket.emit('join-error', { code: 'INVALID_NAME', message: 'Name too short' });
                }

                // 2. Check Bans
                if (this.sessionBans.has(canonicalName)) {
                    return socket.emit('join-error', { code: 'BANNED', message: 'You are banned from this session.' });
                }
                if (this.sessionStore && this.sessionStore.isGloballyBanned(canonicalName)) {
                    const banInfo = this.sessionStore.getGlobalBannedUser(canonicalName);
                    return socket.emit('join-error', { code: 'BANNED', message: banInfo?.reason || 'You are globally banned.' });
                }
                if (this.tempKickedUsers.has(canonicalName)) {
                    return socket.emit('join-error', { code: 'KICKED', message: 'You were kicked from this session.' });
                }

                // 3. Check Uniqueness
                const isTaken = Array.from(this.activeUsers.values()).some(u => u.roomId === room && u.canonicalUsername === canonicalName);
                if (isTaken) {
                    return socket.emit('join-error', { code: 'USERNAME_TAKEN', message: 'Name already taken.' });
                }

                // 4. Success - Register User
                const userObj = {
                    username: username.trim(), // Keep original casing for display if possible, but we use canonical for logic
                    canonicalUsername: canonicalName,
                    color,
                    roomId: room,
                    socketId: socket.id,
                    joinedAt: new Date().toISOString()
                };

                this.activeUsers.set(socket.id, userObj);
                socket.join(room);

                // Init notification preferences (default enabled)
                socket.notificationOptOut = false;

                // Track user in session for owner dashboard
                if (this.sessionId) {
                    try {
                        this.sessionStore.addUserToSession(this.sessionId, userObj.username);
                    } catch (e) {
                        console.error('Error tracking user:', e.message);
                    }
                }

                // Emit updates
                this.emitMembersUpdate(room);

                const history = this.chatStore.getRoomMessages(room, 100).map(m => ({
                    id: String(m.id),
                    sender: m.username,
                    text: m.text,
                    timestamp: Number(m.timestamp),
                    color: m.color || this.getPastelColor(m.username),
                    replyTo: m.replyTo ? String(m.replyTo) : null,
                    attachments: m.attachments || null,
                    reactions: m.reactions || {}
                }));
                socket.emit('chat-history', history);

                // Legacy presence update (keep for guest compatibility if needed)
                const getPresenceList = (roomId) => Array.from(this.activeUsers.values())
                    .filter(u => u.roomId === roomId)
                    .map(u => u.username);
                this.io.to(room).emit('presence-update', getPresenceList(room));

                // Sync voice room status if one is active
                const voiceRoom = this.voiceRooms.get(room);
                if (voiceRoom) {
                    socket.emit('voice-started', {
                        roomId: room,
                        hostSocketId: voiceRoom.hostSocketId,
                        hostUsername: voiceRoom.hostUsername,
                        participantCount: voiceRoom.participants.size
                    });
                }
            });

            // Enhanced send-message with reply and attachments support
            socket.on('send-message', (data, cb) => {
                const user = this.activeUsers.get(socket.id);
                if (!user) return;

                // Support both old (string) and new (object) format
                const text = typeof data === 'string' ? data : data.text;
                const replyTo = typeof data === 'object' ? data.replyTo : null;
                const attachments = typeof data === 'object' ? data.attachments : null;

                if (!text || !text.trim()) return;

                // Limit attachments to 5
                const validAttachments = attachments && Array.isArray(attachments)
                    ? attachments.slice(0, 5)
                    : null;

                const id = this.chatStore.saveMessage(
                    user.roomId,
                    user.username,
                    user.color,
                    text.trim(),
                    replyTo ? parseInt(replyTo) : null,
                    validAttachments
                );

                const msg = {
                    id: String(id),
                    sender: user.username,
                    color: user.color,
                    text: text.trim(),
                    timestamp: Date.now(),
                    replyTo: replyTo ? String(replyTo) : null,
                    attachments: validAttachments,
                    reactions: {}
                };
                // Notification: New Message
                socket.to(user.roomId).emit('notification:new-message', {
                    sessionId: user.roomId,
                    messageId: String(id),
                    from: { username: user.username, color: user.color },
                    preview: text ? text.substring(0, 100) : (validAttachments ? 'Sent an attachment' : ''),
                    sentAt: new Date().toISOString()
                });

                socket.to(user.roomId).emit('chat-message', msg);
                if (cb) cb({ success: true, id: String(id) });
            });

            // Reaction handling
            socket.on('react-message', ({ messageId, emoji }, cb) => {
                const user = this.activeUsers.get(socket.id);
                if (!user || !messageId || !emoji) return;

                const success = this.chatStore.addReaction(parseInt(messageId), user.username, emoji);
                if (success) {
                    const reactions = this.chatStore.getReactions(parseInt(messageId));
                    this.io.to(user.roomId).emit('reaction-update', {
                        messageId: String(messageId),
                        reactions
                    });

                    // Notification: Reaction
                    socket.to(user.roomId).emit('notification:reaction', {
                        sessionId: user.roomId,
                        messageId: String(messageId),
                        by: { socketId: socket.id, username: user.username },
                        type: emoji,
                        sentAt: new Date().toISOString()
                    });
                }
                if (cb) cb({ success });
            });

            // Remove reaction
            socket.on('remove-reaction', ({ messageId }, cb) => {
                const user = this.activeUsers.get(socket.id);
                if (!user || !messageId) return;

                const success = this.chatStore.removeReaction(parseInt(messageId), user.username);
                if (success) {
                    const reactions = this.chatStore.getReactions(parseInt(messageId));
                    this.io.to(user.roomId).emit('reaction-update', {
                        messageId: String(messageId),
                        reactions
                    });
                }
                if (cb) cb({ success });
            });

            // Delete message
            socket.on('delete-message', ({ messageId }, cb) => {
                const user = this.activeUsers.get(socket.id);
                if (!user || !messageId) return;

                const msg = this.chatStore.getMessage(parseInt(messageId));
                if (!msg) return cb && cb({ success: false, error: 'Message not found' });

                // Only allow sender to delete (or owner logic if we had it, but strict sender is safe)
                if (msg.username !== user.username) {
                    return cb && cb({ success: false, error: 'Unauthorized' });
                }

                const success = this.chatStore.deleteMessage(parseInt(messageId));
                if (success) {
                    this.io.to(user.roomId).emit('message-deleted', { messageId: String(messageId) });
                }
                if (cb) cb({ success });
            });

            socket.on('typing', (isTyping) => {
                const user = this.activeUsers.get(socket.id);
                if (user) socket.to(user.roomId).emit('typing-update', { username: user.username, isTyping });
            });

            // ========== VOICE ROOM SIGNALING ==========

            // Start a voice room (only if none exists for this session)
            socket.on('voice-start', (data, cb) => {
                const user = this.activeUsers.get(socket.id);
                if (!user) return cb?.({ success: false, error: 'Not authenticated' });

                const room = user.roomId;
                // Resuming host session?
                // Check if there is an existing room where this user WAS the host
                // Typically we'd check against a persistent ID, but username is our best proxy here + sessionId
                const existingRoom = this.voiceRooms.get(room);
                if (existingRoom && existingRoom.hostUsername === user.username) {
                    // It's the previous host returning!
                    console.log(`Host ${user.username} reconnected to voice room`);
                    if (existingRoom.disconnectTimeout) {
                        clearTimeout(existingRoom.disconnectTimeout);
                        existingRoom.disconnectTimeout = null;
                    }
                    existingRoom.hostSocketId = socket.id;
                    existingRoom.participants.add(socket.id);
                    cb?.({ success: true, hostSocketId: socket.id });

                    this.io.to(room).emit('voice-started', {
                        roomId: room,
                        hostSocketId: socket.id,
                        hostUsername: user.username,
                        participantCount: existingRoom.participants.size
                    });

                    // Notification: Voice Started (Resumed)
                    this.io.to(room).emit('notification:voice-started', {
                        sessionId: room,
                        host: { socketId: socket.id, username: user.username },
                        startedAt: new Date().toISOString(),
                        isResume: true
                    });

                    this.broadcastVoiceState(room);
                    return;
                }

                if (existingRoom) {
                    return cb?.({ success: false, error: 'Voice room already active' });
                }

                // Create new voice room
                this.voiceRooms.set(room, {
                    hostSocketId: socket.id,
                    hostUsername: user.username,
                    participants: new Set([socket.id]),
                    locked: false,
                    mutedAll: false,
                    startTime: Date.now()
                });

                console.log(`Voice room started by ${user.username} in ${room}`);

                // Notify all users in the room
                this.io.to(room).emit('voice-started', {
                    roomId: room,
                    hostSocketId: socket.id,
                    hostUsername: user.username
                });

                // Notification: Voice Started
                this.io.to(room).emit('notification:voice-started', {
                    sessionId: room,
                    host: { socketId: socket.id, username: user.username },
                    startedAt: new Date(this.voiceRooms.get(room).startTime).toISOString()
                });

                this.broadcastVoiceState(room);

                cb?.({ success: true, hostSocketId: socket.id });
            });

            // Stop the voice room (host only)
            socket.on('voice-stop', (data, cb) => {
                const user = this.activeUsers.get(socket.id);
                if (!user) return cb?.({ success: false, error: 'Not authenticated' });

                const room = user.roomId;
                const voiceRoom = this.voiceRooms.get(room);

                if (!voiceRoom) {
                    return cb?.({ success: false, error: 'No active voice room' });
                }

                if (voiceRoom.hostSocketId !== socket.id) {
                    return cb?.({ success: false, error: 'Only the host can stop the voice room' });
                }

                console.log(`Voice room stopped by ${user.username} in ${room}`);

                // Notify all users and delete room
                this.io.to(room).emit('voice-stopped', { roomId: room });

                // Notification: Voice Ended
                this.io.to(room).emit('notification:voice-ended', {
                    sessionId: room,
                    endedAt: new Date().toISOString()
                });

                this.voiceRooms.delete(room);

                // Broadcast empty/inactive state or just let the stopped event handle it?
                // Ideally send a final state update saying "active: false" BEFORE deleting?
                // Or deleting it means next getVoiceState returns null/false.
                // We should broadcast to the room that state has changed.
                // Since room is deleted, broadcastVoiceState(room) returns early.
                // We need to manually emit inactive state.
                this.io.to(room).emit('voice-state', { active: false, roomId: room, participantCount: 0 });

                cb?.({ success: true });
            });

            // Join an existing voice room
            socket.on('voice-join', (data, cb) => {
                const user = this.activeUsers.get(socket.id);
                if (!user) return cb?.({ success: false, error: 'Not authenticated' });

                const room = user.roomId;
                const voiceRoom = this.voiceRooms.get(room);

                if (!voiceRoom) {
                    return cb?.({ success: false, error: 'No active voice room' });
                }

                if (voiceRoom.participants.has(socket.id)) {
                    return cb?.({ success: false, error: 'Already in voice room' });
                }

                if (voiceRoom.locked && voiceRoom.hostSocketId !== socket.id) {
                    return cb?.({ success: false, error: 'Room is locked' });
                }

                // Check if this is the host returning
                if (voiceRoom.hostUsername === user.username) {
                    console.log(`Host ${user.username} returning to voice room via join`);
                    if (voiceRoom.disconnectTimeout) {
                        clearTimeout(voiceRoom.disconnectTimeout);
                        voiceRoom.disconnectTimeout = null;
                    }
                    voiceRoom.hostSocketId = socket.id;
                    // Notify everyone that host is back/updated
                    this.io.to(room).emit('voice-started', {
                        roomId: room,
                        hostUsername: user.username,
                        participantCount: voiceRoom.participants.size + 1
                    });

                    // Notification: Voice Started (Host Re-join via Join)
                    this.io.to(room).emit('notification:voice-started', {
                        sessionId: room,
                        host: { socketId: socket.id, username: user.username },
                        startedAt: new Date().toISOString(),
                        isResume: true
                    });
                }

                // Add to participants
                voiceRoom.participants.add(socket.id);
                const existingParticipants = Array.from(voiceRoom.participants)
                    .filter(id => id !== socket.id)
                    .map(id => {
                        const u = this.activeUsers.get(id);
                        return { socketId: id, username: u?.username || 'Unknown' };
                    });

                console.log(`${user.username} joined voice room in ${room}`);

                // Notify others about new participant
                socket.to(room).emit('voice-joined', {
                    socketId: socket.id,
                    username: user.username
                });

                this.broadcastVoiceState(room);

                cb?.({
                    success: true,
                    participants: existingParticipants,
                    hostSocketId: voiceRoom.hostSocketId
                });
            });

            // Leave the voice room
            socket.on('voice-leave', (data, cb) => {
                const user = this.activeUsers.get(socket.id);
                if (!user) return cb?.({ success: false, error: 'Not authenticated' });

                const room = user.roomId;
                const voiceRoom = this.voiceRooms.get(room);

                if (!voiceRoom || !voiceRoom.participants.has(socket.id)) {
                    return cb?.({ success: false, error: 'Not in voice room' });
                }

                // If host leaves, stop the entire room
                if (voiceRoom.hostSocketId === socket.id) {
                    console.log(`Host ${user.username} left, stopping voice room in ${room}`);
                    this.io.to(room).emit('voice-stopped', { roomId: room });

                    // Notification: Voice Ended
                    this.io.to(room).emit('notification:voice-ended', {
                        sessionId: room,
                        endedAt: new Date().toISOString()
                    });

                    this.voiceRooms.delete(room);
                    this.io.to(room).emit('voice-state', { active: false, roomId: room, participantCount: 0 });
                } else {
                    // Regular participant leaves
                    voiceRoom.participants.delete(socket.id);
                    console.log(`${user.username} left voice room in ${room}`);
                    socket.to(room).emit('voice-left', {
                        socketId: socket.id,
                        username: user.username
                    });
                    this.broadcastVoiceState(room);
                }

                cb?.({ success: true });
            });

            // HOST: End Voice
            socket.on('voice-end', (data, cb) => {
                const user = this.activeUsers.get(socket.id);
                if (!user) return cb?.({ success: false });
                const room = user.roomId;
                const voiceRoom = this.voiceRooms.get(room);

                if (voiceRoom && voiceRoom.hostSocketId === socket.id) {
                    console.log(`Voice room ended by host ${user.username}`);
                    this.io.to(room).emit('voice-ended', { roomId: room });
                    this.voiceRooms.delete(room);
                    this.io.to(room).emit('voice-state', { active: false, roomId: room, participantCount: 0 });
                    this.activeUsers.forEach(u => {
                        // getPresenceList is a local helper, not a class method
                        if (u.roomId === room) this.io.to(room).emit('presence-update', getPresenceList(room));
                    });
                    cb?.({ success: true });
                } else {
                    cb?.({ success: false, error: 'Not authorized' });
                }
            });

            // WebRTC signaling: forward offer
            socket.on('voice-offer', ({ toSocketId, sdp }) => {
                const user = this.activeUsers.get(socket.id);
                if (!user) return;

                this.io.to(toSocketId).emit('voice-offer', {
                    fromSocketId: socket.id,
                    fromUsername: user.username,
                    sdp
                });
            });

            // WebRTC signaling: forward answer
            socket.on('voice-answer', ({ toSocketId, sdp }) => {
                const user = this.activeUsers.get(socket.id);
                if (!user) return;

                this.io.to(toSocketId).emit('voice-answer', {
                    fromSocketId: socket.id,
                    fromUsername: user.username,
                    sdp
                });
            });

            // WebRTC signaling: forward ICE candidate
            socket.on('voice-ice-candidate', ({ toSocketId, candidate }) => {
                this.io.to(toSocketId).emit('voice-ice-candidate', {
                    fromSocketId: socket.id,
                    candidate
                });
            });

            // CRITICAL: WebRTC signaling for ICE Restart (network recovery)
            // This allows peers to negotiate a new connection if the old one drops.
            socket.on('voice-restart', ({ toSocketId, sdp }) => {
                const user = this.activeUsers.get(socket.id);
                if (!user) return;

                console.log(`Forwarding ICE restart from ${user.username} to ${toSocketId}`);
                this.io.to(toSocketId).emit('voice-restart', {
                    fromSocketId: socket.id,
                    fromUsername: user.username,
                    sdp
                });
            });

            // Owner actions
            socket.on('voice-lock', () => {
                const user = this.activeUsers.get(socket.id);
                if (!user) return;
                const room = user.roomId;
                const voiceRoom = this.voiceRooms.get(room);

                if (voiceRoom && voiceRoom.hostSocketId === socket.id) {
                    voiceRoom.locked = true;
                    this.io.to(room).emit('voice-locked');
                    this.broadcastVoiceState(room);
                }
            });

            socket.on('voice-unlock', () => {
                const user = this.activeUsers.get(socket.id);
                if (!user) return;
                const room = user.roomId;
                const voiceRoom = this.voiceRooms.get(room);

                if (voiceRoom && voiceRoom.hostSocketId === socket.id) {
                    voiceRoom.locked = false;
                    this.io.to(room).emit('voice-unlocked');
                    this.broadcastVoiceState(room);
                }
            });

            socket.on('voice-mute-all', () => {
                const user = this.activeUsers.get(socket.id);
                if (!user) return;
                const room = user.roomId;
                const voiceRoom = this.voiceRooms.get(room);

                if (voiceRoom && voiceRoom.hostSocketId === socket.id) {
                    voiceRoom.mutedAll = true;
                    this.io.to(room).emit('voice-muted-all');
                    this.broadcastVoiceState(room);
                }
            });

            socket.on('voice-kick', ({ targetSocketId }) => {
                const user = this.activeUsers.get(socket.id);
                if (!user) return;
                const room = user.roomId;
                const voiceRoom = this.voiceRooms.get(room);

                if (voiceRoom && voiceRoom.hostSocketId === socket.id) {
                    if (voiceRoom.participants.has(targetSocketId)) {
                        voiceRoom.participants.delete(targetSocketId);
                        this.io.to(targetSocketId).emit('voice-kicked');
                        this.io.to(room).emit('voice-left', { socketId: targetSocketId });
                        this.broadcastVoiceState(room);
                    }
                }
            });

            socket.on('reaction', ({ type }) => {
                const user = this.activeUsers.get(socket.id);
                if (!user) return;

                // Server authoritative broadcast (everyone including sender)
                this.io.to(user.roomId).emit('reaction-broadcast', {
                    username: user.username,
                    color: user.color || this.getPastelColor(user.username),
                    type,
                    socketId: socket.id,
                    timestamp: Date.now()
                });
            });

            socket.on('speaking', ({ isSpeaking }) => {
                const user = this.activeUsers.get(socket.id);
                if (!user) return;
                this.io.to(user.roomId).emit('voice-speaking', {
                    socketId: socket.id,
                    isSpeaking
                });
            });

            // ========== END VOICE ROOM SIGNALING ==========

            socket.on('disconnect', () => {
                const user = this.activeUsers.get(socket.id);
                if (user) {
                    // Clean up voice room participation on disconnect
                    const voiceRoom = this.voiceRooms.get(user.roomId);
                    if (voiceRoom && voiceRoom.participants.has(socket.id)) {
                        if (voiceRoom.hostSocketId === socket.id) {
                            // Host disconnected - give 15s grace period to reconnect
                            console.log(`Voice host ${user.username} disconnected, starting 15s grace period`);
                            voiceRoom.participants.delete(socket.id);

                            // Clear any existing timeout
                            if (voiceRoom.disconnectTimeout) {
                                clearTimeout(voiceRoom.disconnectTimeout);
                            }

                            // Set grace period timeout
                            voiceRoom.disconnectTimeout = setTimeout(() => {
                                // Check if room still exists and host hasn't returned
                                const room = this.voiceRooms.get(user.roomId);
                                if (room && room.hostUsername === user.username && !room.participants.has(room.hostSocketId)) {
                                    console.log(`Voice host ${user.username} did not return, destroying room`);
                                    this.io.to(user.roomId).emit('voice-stopped', { roomId: user.roomId });
                                    this.voiceRooms.delete(user.roomId);
                                    this.io.to(user.roomId).emit('voice-state', { active: false, roomId: user.roomId, participantCount: 0 });
                                }
                            }, 15000);

                            // Notify participants that host is temporarily gone
                            this.io.to(user.roomId).emit('voice-state', {
                                active: true,
                                roomId: user.roomId,
                                hostSocketId: null, // Host temporarily disconnected
                                participantCount: voiceRoom.participants.size,
                                hostReconnecting: true
                            });
                        } else {
                            // Participant disconnected
                            voiceRoom.participants.delete(socket.id);
                            this.io.to(user.roomId).emit('voice-left', {
                                socketId: socket.id,
                                username: user.username
                            });
                            this.broadcastVoiceState(user.roomId);
                        }
                    }

                    this.activeUsers.delete(socket.id);
                    // Legacy presence update
                    const room = user.roomId; // user object is still valid here
                    const getPresenceList = (roomId) => Array.from(this.activeUsers.values())
                        .filter(u => u.roomId === roomId)
                        .map(u => u.username);
                    this.io.to(room).emit('presence-update', getPresenceList(room));

                    // New Roster update
                    this.emitMembersUpdate(room);
                }
            });
        });
    }

    // Helper to broadcast full voice state
    broadcastVoiceState(roomId) {
        const voiceRoom = this.voiceRooms.get(roomId);
        if (!voiceRoom) return;

        this.io.to(roomId).emit('voice-state', {
            active: true,
            roomId,
            hostSocketId: voiceRoom.hostSocketId,
            participantCount: voiceRoom.participants.size,
            locked: voiceRoom.locked,
            mutedAll: voiceRoom.mutedAll,
            participants: Array.from(voiceRoom.participants)
        });
    }

    getPastelColor(username) {
        let hash = 0;
        for (let i = 0; i < username.length; i++) {
            hash = username.charCodeAt(i) + ((hash << 5) - hash);
        }
        return `hsl(${Math.abs(hash % 360)}, 70%, 85%)`;
    }

    start() {
        return new Promise((resolve, reject) => {
            this.server.listen(0, '127.0.0.1', () => {
                console.log(`Server at http://127.0.0.1:${this.server.address().port}`);
                resolve(this.server.address().port);
            });
            this.server.on('error', reject);
        });
    }

    // CRITICAL: stop() method for session termination
    stop() {
        return new Promise((resolve) => {
            // Prevent double-stop
            if (this.isStopped) {
                resolve();
                return;
            }
            this.isStopped = true;

            console.log('FileServer stopping...');

            // 1. Disconnect all Socket.IO clients
            try {
                this.io.disconnectSockets(true);
            } catch (e) {
                console.error('Error disconnecting sockets:', e.message);
            }

            // 2. Close Socket.IO server
            try {
                this.io.close();
            } catch (e) {
                console.error('Error closing Socket.IO:', e.message);
            }

            // 3. Destroy all HTTP connections
            for (const socket of this.activeSockets) {
                try {
                    socket.destroy();
                } catch (e) {
                    // Socket may already be destroyed
                }
            }
            this.activeSockets.clear();

            // 4. Clear active users
            this.activeUsers.clear();

            // 5. Close HTTP server
            this.server.close(() => {
                console.log('FileServer stopped');
                resolve();
            });

            // 6. Force resolve after timeout
            setTimeout(() => {
                console.log('FileServer force stopped');
                resolve();
            }, 1000);
        });
    }
}

export default FileServer;

