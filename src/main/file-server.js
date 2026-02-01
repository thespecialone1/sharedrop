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
import AlbumStore from './album-store.js';
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
        this.albumStore = stores.albumStore || null;

        // Track connections for proper cleanup
        this.activeSockets = new Set();
        this.isStopped = false;

        // Voice room state: Map<roomId, { hostSocketId, participants: Set<socketId> }>
        this.voiceRooms = new Map();
        // Video room state: Map<roomId, { hostSocketId, participants: Set<socketId>, active: boolean }>
        this.videoRooms = new Map();

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

            // Allow Owner Header Auth (Fix for IPC calls)
            const ownerPassword = req.headers['x-owner-password'];
            if (ownerPassword && ownerPassword === this.password) {
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

        // ========== ALBUM ROUTES ==========

        const requireAlbumStore = (req, res, next) => {
            if (!this.albumStore) {
                return res.status(503).json({ error: 'Album feature unavailable' });
            }
            next();
        };

        this.app.get('/api/albums', requireAuth, requireAlbumStore, (req, res) => {
            if (!this.albumStore) return res.status(503).json({ error: 'Unavailable' });
            const albums = this.albumStore.getSessionAlbums(this.roomId);
            const albumsWithItems = albums.map(album => ({
                ...album,
                items: this.albumStore.getAlbumItems(album.id)
            }));
            res.json({ albums: albumsWithItems });
        });

        this.app.post('/api/albums', requireAuth, requireAlbumStore, (req, res) => {
            if (!this.albumStore) return res.status(503).json({ error: 'Unavailable' });

            const { name, type, isOwner, createdBy } = req.body;
            console.log('[FileServer] POST /api/albums:', { name, type, isOwner, createdBy, roomId: this.roomId });

            // Use provided createdBy if owner, otherwise fallback to session or Guest
            const username = (isOwner && createdBy) ? createdBy : (req.session.username || 'Guest');

            if (!isOwner) {
                console.warn('[FileServer] Album creation denied: Not owner');
                return res.status(403).json({ error: 'Only owner can create albums' });
            }

            try {
                const album = this.albumStore.createAlbum(this.roomId, name, type, username, 'approved', this.folderPath);
                this.io.to(this.roomId).emit('album:sync', this.getAlbumsSyncData());
                this.emit('albums-updated');
                console.log('[FileServer] Album created, syncing...');

                res.json({ success: true, album });
            } catch (e) {
                console.error('[FileServer] Album creation error:', e);
                res.status(500).json({ error: e.message });
            }
        });

        this.app.post('/api/albums/suggest', requireAuth, requireAlbumStore, (req, res) => {
            if (!this.albumStore) return res.status(503).json({ error: 'Unavailable' });

            const { name, type } = req.body;
            const username = req.session.username || 'Guest';

            const album = this.albumStore.createAlbum(this.roomId, name, type, username, 'suggested', this.folderPath);
            this.io.to(this.roomId).emit('album:sync', this.getAlbumsSyncData());
            this.emit('albums-updated');

            res.json({ success: true, album });
        });

        this.app.post('/api/albums/:id/approve', requireOwner, requireAlbumStore, (req, res) => {
            if (!this.albumStore) return res.status(503).json({ error: 'Unavailable' });
            const album = this.albumStore.updateAlbum(req.params.id, {
                status: 'approved',
                approvedBy: 'owner'
            });
            this.io.to(this.roomId).emit('album:sync', this.getAlbumsSyncData());
            this.emit('albums-updated');
            res.json({ success: true, album });
        });

        this.app.post('/api/albums/:id/lock', requireOwner, requireAlbumStore, (req, res) => {
            if (!this.albumStore) return res.status(503).json({ error: 'Unavailable' });
            const { locked } = req.body;
            const album = this.albumStore.updateAlbum(req.params.id, { locked });
            this.io.to(this.roomId).emit('album:sync', this.getAlbumsSyncData());
            this.emit('albums-updated');
            res.json({ success: true, album });
        });

        this.app.delete('/api/albums/:id', requireOwner, requireAlbumStore, (req, res) => {
            if (!this.albumStore) return res.status(503).json({ error: 'Unavailable' });
            const success = this.albumStore.deleteAlbum(req.params.id);
            this.io.to(this.roomId).emit('album:sync', this.getAlbumsSyncData());
            this.emit('albums-updated');
            res.json({ success });
        });

        this.app.post('/api/albums/:id/items', requireAuth, requireAlbumStore, (req, res) => {
            if (!this.albumStore) return res.status(503).json({ error: 'Unavailable' });

            const { filePath, metadata } = req.body;
            const username = req.session.username || 'Guest';
            const album = this.albumStore.getAlbum(req.params.id);

            if (!album) {
                return res.status(404).json({ error: 'Album not found' });
            }

            if (album.locked) {
                return res.status(403).json({ error: 'Album is locked' });
            }

            if (album.status === 'suggested' && album.created_by !== username) {
                return res.status(403).json({ error: 'Cannot add to unapproved album' });
            }

            const item = this.albumStore.addItem(req.params.id, filePath, username, metadata);
            this.io.to(this.roomId).emit('album:sync', this.getAlbumsSyncData());
            this.emit('albums-updated');

            res.json({ success: true, item });
        });

        this.app.delete('/api/albums/items/:itemId', requireAuth, requireAlbumStore, (req, res) => {
            if (!this.albumStore) return res.status(503).json({ error: 'Unavailable' });

            const item = this.albumStore.getItem(req.params.itemId);
            if (!item) {
                return res.status(404).json({ error: 'Item not found' });
            }

            const album = this.albumStore.getAlbum(item.album_id);
            const username = req.session.username || 'Guest';

            if (album.locked) {
                return res.status(403).json({ error: 'Album is locked' });
            }

            if (album.created_by !== username && item.added_by !== username) {
                return res.status(403).json({ error: 'Cannot remove this item' });
            }

            const success = this.albumStore.removeItem(req.params.itemId);
            this.io.to(this.roomId).emit('album:sync', this.getAlbumsSyncData());
            this.emit('albums-updated');

            res.json({ success });
        });

        this.app.patch('/api/albums/items/:itemId', requireAuth, requireAlbumStore, (req, res) => {
            if (!this.albumStore) return res.status(503).json({ error: 'Unavailable' });

            const item = this.albumStore.getItem(req.params.itemId);
            if (!item) {
                return res.status(404).json({ error: 'Item not found' });
            }

            const album = this.albumStore.getAlbum(item.album_id);
            const username = req.session.username || 'Guest';

            if (album.locked) {
                return res.status(403).json({ error: 'Album is locked' });
            }

            if (album.status === 'suggested' && album.created_by !== username) {
                return res.status(403).json({ error: 'Cannot edit unapproved album' });
            }

            const { favorite, note, coverRole } = req.body;
            const updates = {};
            if (favorite !== undefined) updates.favorite = favorite;
            if (note !== undefined) updates.note = note;
            if (coverRole !== undefined) updates.coverRole = coverRole;

            const updatedItem = this.albumStore.updateItem(req.params.itemId, updates);
            this.io.to(this.roomId).emit('album:sync', this.getAlbumsSyncData());
            this.emit('albums-updated');

            res.json({ success: true, item: updatedItem });
        });

        this.app.post('/api/albums/export', requireOwner, requireAlbumStore, (req, res) => {
            if (!this.albumStore) return res.status(503).json({ error: 'Unavailable' });
            const exportData = this.albumStore.exportSession(this.roomId);
            res.json(exportData);
        });

        this.app.get('/api/albums/recovery', requireOwner, (req, res) => {
            const folderPath = req.query.folderPath;
            if (!folderPath) {
                return res.status(400).json({ error: 'folderPath required' });
            }
            const existing = this.albumStore ? this.albumStore.findByFolderPath(folderPath) : null;
            res.json({ hasRecovery: !!existing, data: existing });
        });
    }

    setupSockets() {
        this.io.on('connection', (socket) => {
            const getPresenceList = (roomId) => Array.from(this.activeUsers.values())
                .filter(u => u.roomId === roomId)
                .map(u => u.username);

            // Video Room Signaling
            socket.on('video-start', ({ }, cb) => {
                const user = this.activeUsers.get(socket.id);
                if (!user) return cb({ success: false, error: 'User not found' });
                const roomId = user.roomId;
                if (!roomId) return cb({ success: false, error: 'No room context' });

                if (this.videoRooms.has(roomId)) {
                    return cb({ success: false, error: 'Video room already active' });
                }
                if (this.voiceRooms.has(roomId)) {
                    return cb({ success: false, error: 'Voice call currently active. Please stop voice first.' });
                }

                this.videoRooms.set(roomId, {
                    hostSocketId: socket.id,
                    participants: new Set([socket.id]),
                    active: true,
                    startedAt: Date.now()
                });

                this.io.to(roomId).emit('video-started', {
                    roomId,
                    host: { socketId: socket.id, username: user.username },
                    startedAt: Date.now()
                });

                this.emitVideoState(roomId);
                cb({ success: true, hostSocketId: socket.id });
            });

            socket.on('video-join', ({ }, cb) => {
                const user = this.activeUsers.get(socket.id);
                if (!user) return cb({ success: false, error: 'User not found' });
                const roomId = user.roomId;
                const videoRoom = this.videoRooms.get(roomId);
                if (!videoRoom) return cb({ success: false, error: 'No active video room' });

                if (this.sessionBans.has(user.canonicalUsername) || this.tempKickedUsers.has(user.canonicalUsername)) {
                    return cb({ success: false, error: 'Access Denied' });
                }

                videoRoom.participants.add(socket.id);
                this.io.to(roomId).emit('video-joined', {
                    roomId,
                    participant: { socketId: socket.id, username: user.username }
                });
                this.emitVideoState(roomId);

                const currentParticipants = Array.from(videoRoom.participants).map(sid => {
                    const u = this.activeUsers.get(sid);
                    return { socketId: sid, username: u ? u.username : 'Unknown' };
                }).filter(p => p.socketId !== socket.id);

                cb({ success: true, hostSocketId: videoRoom.hostSocketId, participants: currentParticipants });
            });

            socket.on('video-leave', () => {
                const user = this.activeUsers.get(socket.id);
                if (!user) return;
                const roomId = user.roomId;
                const videoRoom = this.videoRooms.get(roomId);

                if (videoRoom) {
                    videoRoom.participants.delete(socket.id);
                    this.io.to(roomId).emit('video-left', {
                        roomId,
                        participant: { socketId: socket.id, username: user.username }
                    });

                    if (videoRoom.participants.size === 0 || socket.id === videoRoom.hostSocketId) {
                        this.videoRooms.delete(roomId);
                        this.io.to(roomId).emit('video-ended', { roomId, endedAt: Date.now() });
                    } else {
                        this.emitVideoState(roomId);
                    }
                }
            });

            socket.on('video-offer', ({ toSocketId, sdp }) => {
                const user = this.activeUsers.get(socket.id);
                this.io.to(toSocketId).emit('video-offer', {
                    fromSocketId: socket.id,
                    fromUsername: user ? user.username : 'Unknown',
                    sdp
                });
            });

            socket.on('video-answer', ({ toSocketId, sdp }) => {
                this.io.to(toSocketId).emit('video-answer', {
                    fromSocketId: socket.id,
                    sdp
                });
            });

            socket.on('video-ice-candidate', ({ toSocketId, candidate }) => {
                this.io.to(toSocketId).emit('video-ice-candidate', {
                    fromSocketId: socket.id,
                    candidate
                });
            });

            socket.on('video-get-state', () => {
                const user = this.activeUsers.get(socket.id);
                if (user && user.roomId) {
                    this.emitVideoState(user.roomId);
                }
            });

            socket.on('check-username', ({ name, roomId }, cb) => {
                const room = roomId || this.roomId;
                const available = !Array.from(this.activeUsers.values()).some(u => u.roomId === room && u.username === name);
                if (cb) cb({ available });
            });

            socket.on('join-session', async ({ username, color, roomId }) => {
                const room = roomId || this.roomId;
                const canonicalName = (username || '').trim().toLowerCase();

                if (!canonicalName || canonicalName.length < 2) {
                    return socket.emit('join-error', { code: 'INVALID_NAME', message: 'Name too short' });
                }

                if (this.sessionBans.has(canonicalName)) {
                    return socket.emit('join-error', { code: 'BANNED', message: 'You are banned from this session.' });
                }
                if (this.tempKickedUsers.has(canonicalName)) {
                    return socket.emit('join-error', { code: 'KICKED', message: 'You were kicked from this session.' });
                }

                const isTaken = Array.from(this.activeUsers.values()).some(u => u.roomId === room && u.canonicalUsername === canonicalName);
                if (isTaken) {
                    return socket.emit('join-error', { code: 'USERNAME_TAKEN', message: 'Name already taken.' });
                }

                const userObj = {
                    username: username.trim(),
                    canonicalUsername: canonicalName,
                    color,
                    roomId: room,
                    socketId: socket.id,
                    joinedAt: new Date().toISOString()
                };

                this.activeUsers.set(socket.id, userObj);
                socket.join(room);

                if (this.sessionId) {
                    try {
                        this.sessionStore.addUserToSession(this.sessionId, userObj.username);
                    } catch (e) {
                        console.error('Error tracking user:', e.message);
                    }
                }

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

                // Send initial album sync immediately
                if (this.albumStore) {
                    socket.emit('album:sync', this.getAlbumsSyncData());
                }

                const getPresenceList = (roomId) => Array.from(this.activeUsers.values())
                    .filter(u => u.roomId === roomId)
                    .map(u => u.username);
                this.io.to(room).emit('presence-update', getPresenceList(room));

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

            socket.on('send-message', (data, cb) => {
                const user = this.activeUsers.get(socket.id);
                if (!user) return;

                const text = typeof data === 'string' ? data : (data.text || '');
                const replyTo = typeof data === 'object' ? data.replyTo : null;
                const attachments = typeof data === 'object' ? data.attachments : null;
                const validAttachments = attachments && Array.isArray(attachments)
                    ? attachments.filter(a => a).slice(0, 5) : null;

                if ((!text || !text.trim()) && (!validAttachments || validAttachments.length === 0)) return;

                const id = this.chatStore.saveMessage(
                    user.roomId, user.username, user.color, text.trim(),
                    replyTo ? parseInt(replyTo) : null, validAttachments
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
                }
                if (cb) cb({ success });
            });

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

            socket.on('delete-message', ({ messageId }, cb) => {
                const user = this.activeUsers.get(socket.id);
                if (!user || !messageId) return;

                const msg = this.chatStore.getMessage(parseInt(messageId));
                if (!msg) return cb && cb({ success: false, error: 'Message not found' });
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

            // Voice Room Events
            socket.on('voice-start', (data, cb) => {
                const user = this.activeUsers.get(socket.id);
                if (!user) return cb?.({ success: false, error: 'Not authenticated' });

                const room = user.roomId;
                const existingRoom = this.voiceRooms.get(room);

                if (existingRoom && existingRoom.hostUsername === user.username) {
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
                    this.broadcastVoiceState(room);
                    return;
                }

                if (existingRoom) {
                    return cb?.({ success: false, error: 'Voice room already active' });
                }

                this.voiceRooms.set(room, {
                    hostSocketId: socket.id,
                    hostUsername: user.username,
                    participants: new Set([socket.id]),
                    locked: false,
                    mutedAll: false,
                    startTime: Date.now()
                });

                this.io.to(room).emit('voice-started', {
                    roomId: room,
                    hostSocketId: socket.id,
                    hostUsername: user.username
                });
                this.broadcastVoiceState(room);
                cb?.({ success: true, hostSocketId: socket.id });
            });

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

                this.io.to(room).emit('voice-stopped', { roomId: room });
                this.voiceRooms.delete(room);
                this.io.to(room).emit('voice-state', { active: false, roomId: room, participantCount: 0 });
                cb?.({ success: true });
            });

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

                if (voiceRoom.hostUsername === user.username) {
                    if (voiceRoom.disconnectTimeout) {
                        clearTimeout(voiceRoom.disconnectTimeout);
                        voiceRoom.disconnectTimeout = null;
                    }
                    voiceRoom.hostSocketId = socket.id;
                    this.io.to(room).emit('voice-started', {
                        roomId: room,
                        hostUsername: user.username,
                        participantCount: voiceRoom.participants.size + 1
                    });
                }

                voiceRoom.participants.add(socket.id);
                const existingParticipants = Array.from(voiceRoom.participants)
                    .filter(id => id !== socket.id)
                    .map(id => {
                        const u = this.activeUsers.get(id);
                        return { socketId: id, username: u?.username || 'Unknown' };
                    });

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

            socket.on('voice-leave', (data, cb) => {
                const user = this.activeUsers.get(socket.id);
                if (!user) return cb?.({ success: false, error: 'Not authenticated' });

                const room = user.roomId;
                const voiceRoom = this.voiceRooms.get(room);

                if (!voiceRoom || !voiceRoom.participants.has(socket.id)) {
                    return cb?.({ success: false, error: 'Not in voice room' });
                }

                if (voiceRoom.hostSocketId === socket.id) {
                    this.io.to(room).emit('voice-stopped', { roomId: room });
                    this.voiceRooms.delete(room);
                    this.io.to(room).emit('voice-state', { active: false, roomId: room, participantCount: 0 });
                } else {
                    voiceRoom.participants.delete(socket.id);
                    socket.to(room).emit('voice-left', {
                        socketId: socket.id,
                        username: user.username
                    });
                    this.broadcastVoiceState(room);
                }
                cb?.({ success: true });
            });

            socket.on('voice-end', (data, cb) => {
                const user = this.activeUsers.get(socket.id);
                if (!user) return cb?.({ success: false });
                const room = user.roomId;
                const voiceRoom = this.voiceRooms.get(room);

                if (voiceRoom && voiceRoom.hostSocketId === socket.id) {
                    this.io.to(room).emit('voice-ended', { roomId: room });
                    this.voiceRooms.delete(room);
                    this.io.to(room).emit('voice-state', { active: false, roomId: room, participantCount: 0 });
                    cb?.({ success: true });
                } else {
                    cb?.({ success: false, error: 'Not authorized' });
                }
            });

            socket.on('voice-offer', ({ toSocketId, sdp }) => {
                const user = this.activeUsers.get(socket.id);
                if (!user) return;
                this.io.to(toSocketId).emit('voice-offer', {
                    fromSocketId: socket.id,
                    fromUsername: user.username,
                    sdp
                });
            });

            socket.on('voice-answer', ({ toSocketId, sdp }) => {
                const user = this.activeUsers.get(socket.id);
                if (!user) return;
                this.io.to(toSocketId).emit('voice-answer', {
                    fromSocketId: socket.id,
                    fromUsername: user.username,
                    sdp
                });
            });

            socket.on('voice-ice-candidate', ({ toSocketId, candidate }) => {
                this.io.to(toSocketId).emit('voice-ice-candidate', {
                    fromSocketId: socket.id,
                    candidate
                });
            });

            socket.on('voice-restart', ({ toSocketId, sdp }) => {
                const user = this.activeUsers.get(socket.id);
                if (!user) return;
                this.io.to(toSocketId).emit('voice-restart', {
                    fromSocketId: socket.id,
                    fromUsername: user.username,
                    sdp
                });
            });

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

            // Album Events
            socket.on('album:get-sync', () => {
                const user = this.activeUsers.get(socket.id);
                if (!user || !this.albumStore) return;
                socket.emit('album:sync', this.getAlbumsSyncData());
            });

            socket.on('album:create', ({ name, type, isOwner }, cb) => {
                const user = this.activeUsers.get(socket.id);
                if (!user || !this.albumStore) return cb?.({ success: false, error: 'Unavailable' });
                if (!isOwner) {
                    return cb?.({ success: false, error: 'Only owner can create albums' });
                }
                const album = this.albumStore.createAlbum(this.roomId, name, type, user.username, 'approved', this.folderPath);
                this.io.to(this.roomId).emit('album:sync', this.getAlbumsSyncData());
                this.emit('albums-updated');
                cb?.({ success: true, album });
            });

            socket.on('album:suggest', ({ name, type }, cb) => {
                const user = this.activeUsers.get(socket.id);
                if (!user || !this.albumStore) return cb?.({ success: false, error: 'Unavailable' });
                const album = this.albumStore.createAlbum(this.roomId, name, type, user.username, 'suggested', this.folderPath);
                this.io.to(this.roomId).emit('album:sync', this.getAlbumsSyncData());
                this.emit('albums-updated');
                cb?.({ success: true, album });
            });

            socket.on('album:approve', ({ albumId }, cb) => {
                const user = this.activeUsers.get(socket.id);
                if (!user || !this.albumStore) return cb?.({ success: false, error: 'Unavailable' });
                const album = this.albumStore.updateAlbum(albumId, {
                    status: 'approved',
                    approvedBy: user.username
                });
                this.io.to(this.roomId).emit('album:sync', this.getAlbumsSyncData());
                this.emit('albums-updated');
                cb?.({ success: true, album });
            });

            socket.on('album:lock', ({ albumId, locked }, cb) => {
                const user = this.activeUsers.get(socket.id);
                if (!user || !this.albumStore) return cb?.({ success: false, error: 'Unavailable' });
                const album = this.albumStore.updateAlbum(albumId, { locked });
                this.io.to(this.roomId).emit('album:sync', this.getAlbumsSyncData());
                this.emit('albums-updated');
                cb?.({ success: true, album });
            });

            socket.on('album:delete', ({ albumId }, cb) => {
                const user = this.activeUsers.get(socket.id);
                if (!user || !this.albumStore) return cb?.({ success: false, error: 'Unavailable' });
                const album = this.albumStore.getAlbum(albumId);
                if (!album) return cb?.({ success: false, error: 'Album not found' });
                const success = this.albumStore.deleteAlbum(albumId);
                this.io.to(this.roomId).emit('album:sync', this.getAlbumsSyncData());
                this.emit('albums-updated');
                cb?.({ success });
            });

            socket.on('album:item-add', ({ albumId, filePath, metadata }, cb) => {
                const user = this.activeUsers.get(socket.id);
                if (!user || !this.albumStore) return cb?.({ success: false, error: 'Unavailable' });
                const album = this.albumStore.getAlbum(albumId);
                if (!album) return cb?.({ success: false, error: 'Album not found' });
                if (album.locked) {
                    return cb?.({ success: false, error: 'Album is locked' });
                }
                if (album.status === 'suggested' && album.created_by !== user.username) {
                    return cb?.({ success: false, error: 'Cannot add to unapproved album' });
                }
                const item = this.albumStore.addItem(albumId, filePath, user.username, metadata);
                this.io.to(this.roomId).emit('album:sync', this.getAlbumsSyncData());
                this.emit('albums-updated');
                cb?.({ success: true, item });
            });

            socket.on('album:item-remove', ({ itemId }, cb) => {
                const user = this.activeUsers.get(socket.id);
                if (!user || !this.albumStore) return cb?.({ success: false, error: 'Unavailable' });
                const item = this.albumStore.getItem(itemId);
                if (!item) return cb?.({ success: false, error: 'Item not found' });
                const album = this.albumStore.getAlbum(item.album_id);
                if (album.locked) {
                    return cb?.({ success: false, error: 'Album is locked' });
                }
                if (album.created_by !== user.username && item.added_by !== user.username) {
                    return cb?.({ success: false, error: 'Cannot remove this item' });
                }
                const success = this.albumStore.removeItem(itemId);
                this.io.to(this.roomId).emit('album:sync', this.getAlbumsSyncData());
                this.emit('albums-updated');
                cb?.({ success });
            });

            socket.on('album:item-update', ({ itemId, updates }, cb) => {
                const user = this.activeUsers.get(socket.id);
                if (!user || !this.albumStore) return cb?.({ success: false, error: 'Unavailable' });
                const item = this.albumStore.getItem(itemId);
                if (!item) return cb?.({ success: false, error: 'Item not found' });
                const album = this.albumStore.getAlbum(item.album_id);
                if (album.locked) {
                    return cb?.({ success: false, error: 'Album is locked' });
                }
                if (album.status === 'suggested' && album.created_by !== user.username) {
                    return cb?.({ success: false, error: 'Cannot edit unapproved album' });
                }
                const updatedItem = this.albumStore.updateItem(itemId, updates);
                this.io.to(this.roomId).emit('album:sync', this.getAlbumsSyncData());
                this.emit('albums-updated');
                cb?.({ success: true, item: updatedItem });
            });

            socket.on('disconnect', () => {
                const user = this.activeUsers.get(socket.id);
                if (user) {
                    const voiceRoom = this.voiceRooms.get(user.roomId);
                    if (voiceRoom && voiceRoom.participants.has(socket.id)) {
                        if (voiceRoom.hostSocketId === socket.id) {
                            voiceRoom.participants.delete(socket.id);
                            if (voiceRoom.disconnectTimeout) {
                                clearTimeout(voiceRoom.disconnectTimeout);
                            }
                            voiceRoom.disconnectTimeout = setTimeout(() => {
                                const room = this.voiceRooms.get(user.roomId);
                                if (room && room.hostUsername === user.username && !room.participants.has(room.hostSocketId)) {
                                    this.io.to(user.roomId).emit('voice-stopped', { roomId: user.roomId });
                                    this.voiceRooms.delete(user.roomId);
                                    this.io.to(user.roomId).emit('voice-state', { active: false, roomId: user.roomId, participantCount: 0 });
                                }
                            }, 15000);

                            this.io.to(user.roomId).emit('voice-state', {
                                active: true,
                                roomId: user.roomId,
                                hostSocketId: null,
                                participantCount: voiceRoom.participants.size,
                                hostReconnecting: true
                            });
                        } else {
                            voiceRoom.participants.delete(socket.id);
                            this.io.to(user.roomId).emit('voice-left', {
                                socketId: socket.id,
                                username: user.username
                            });
                            this.broadcastVoiceState(user.roomId);
                        }
                    }

                    this.activeUsers.delete(socket.id);
                    const room = user.roomId;
                    const getPresenceList = (roomId) => Array.from(this.activeUsers.values())
                        .filter(u => u.roomId === roomId)
                        .map(u => u.username);
                    this.io.to(room).emit('presence-update', getPresenceList(room));
                    this.emitMembersUpdate(room);
                }
            });
        });
    }

    emitVideoState(roomId) {
        const videoRoom = this.videoRooms.get(roomId);
        if (videoRoom) {
            const participants = Array.from(videoRoom.participants).map(sid => {
                const u = this.activeUsers.get(sid);
                return {
                    socketId: sid,
                    username: u ? u.username : 'Unknown',
                    isPresenter: sid === videoRoom.hostSocketId
                };
            });

            this.io.to(roomId).emit('video-state', {
                roomId,
                active: true,
                hostSocketId: videoRoom.hostSocketId,
                participants
            });
        } else {
            this.io.to(roomId).emit('video-state', { roomId, active: false, participants: [] });
        }
    }

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

    // Helper to get album sync data
    getAlbumsSyncData() {
        if (!this.albumStore) return null;
        const albums = this.albumStore.getSessionAlbums(this.roomId);
        return albums.map(album => ({
            ...album,
            items: this.albumStore.getAlbumItems(album.id)
        }));
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

