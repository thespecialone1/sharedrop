import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AlbumStore {
    constructor(dbPath) {
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        this.db = new Database(dbPath);
        this.init();
    }

    init() {
        this.migrateSchema();

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS albums (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                name TEXT NOT NULL,
                type TEXT,
                status TEXT DEFAULT 'suggested',
                locked INTEGER DEFAULT 0,
                created_by TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                approved_by TEXT
            )
        `);

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS album_items (
                id TEXT PRIMARY KEY,
                album_id TEXT NOT NULL,
                file_path TEXT NOT NULL,
                favorite INTEGER DEFAULT 0,
                note TEXT,
                cover_role TEXT DEFAULT 'none',
                added_by TEXT NOT NULL,
                added_at INTEGER DEFAULT (unixepoch())
            )
        `);

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS session_collaboration (
                session_id TEXT PRIMARY KEY,
                folder_path TEXT,
                created_at INTEGER,
                last_updated INTEGER
            )
        `);
    }

    migrateSchema() {
        try {
            // Check if session_collaboration needs migration (folder_path should be nullable)
            const tableInfo = this.db.pragma('table_info(session_collaboration)');
            const folderPathCol = tableInfo.find(c => c.name === 'folder_path');

            if (folderPathCol && folderPathCol.notnull === 1) {
                console.log('Migrating session_collaboration table to remove NOT NULL constraint...');
                this.db.transaction(() => {
                    this.db.exec('ALTER TABLE session_collaboration RENAME TO session_collaboration_old');
                    this.db.exec(`
                        CREATE TABLE session_collaboration (
                            session_id TEXT PRIMARY KEY,
                            folder_path TEXT,
                            created_at INTEGER,
                            last_updated INTEGER
                        )
                    `);
                    this.db.exec(`
                        INSERT INTO session_collaboration (session_id, folder_path, created_at, last_updated)
                        SELECT session_id, folder_path, created_at, last_updated FROM session_collaboration_old
                    `);
                    this.db.exec('DROP TABLE session_collaboration_old');
                })();
                console.log('Schema migration successful.');
            }
        } catch (error) {
            console.error('Schema migration failed:', error);
        }
    }

    generateId() {
        return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    }

    createAlbum(sessionId, name, type, createdBy, status = 'suggested', folderPath = null) {
        console.log('[AlbumStore] createAlbum called:', { sessionId, name, type, createdBy, status, folderPath });
        try {
            const id = this.generateId();
            const now = Date.now();

            const stmt = this.db.prepare(`
                INSERT INTO albums (id, session_id, name, type, status, created_by, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            stmt.run(id, sessionId, name, type, status, createdBy, now);

            console.log('[AlbumStore] Album inserted, updating collaboration...');
            this.updateSessionCollaboration(sessionId, folderPath);

            console.log('[AlbumStore] Album created successfully:', id);
            return this.getAlbum(id);
        } catch (error) {
            console.error('[AlbumStore] createAlbum failed:', error);
            throw error;
        }
    }

    getAlbum(id) {
        const stmt = this.db.prepare('SELECT * FROM albums WHERE id = ?');
        return stmt.get(id);
    }

    getSessionAlbums(sessionId) {
        const stmt = this.db.prepare('SELECT * FROM albums WHERE session_id = ? ORDER BY created_at DESC');
        return stmt.all(sessionId);
    }

    updateAlbum(id, updates) {
        const allowed = ['name', 'type', 'status', 'locked', 'approved_by'];
        const sets = [];
        const values = [];

        for (const key of allowed) {
            if (updates[key] !== undefined) {
                sets.push(`${key} = ?`);
                // Fix: SQLite requires numbers for booleans
                if (typeof updates[key] === 'boolean') {
                    values.push(updates[key] ? 1 : 0);
                } else {
                    values.push(updates[key]);
                }
            }
        }

        if (sets.length === 0) return this.getAlbum(id);

        values.push(id);
        const stmt = this.db.prepare(`UPDATE albums SET ${sets.join(', ')} WHERE id = ?`);
        stmt.run(...values);

        const album = this.getAlbum(id);
        if (album) {
            this.updateSessionCollaboration(album.session_id);
        }

        return album;
    }

    deleteAlbum(id) {
        const album = this.getAlbum(id);
        if (!album) return false;

        const itemsStmt = this.db.prepare('DELETE FROM album_items WHERE album_id = ?');
        itemsStmt.run(id);

        const stmt = this.db.prepare('DELETE FROM albums WHERE id = ?');
        const result = stmt.run(id);

        if (result.changes > 0) {
            this.updateSessionCollaboration(album.session_id);
        }

        return result.changes > 0;
    }

    addItem(albumId, filePath, addedBy, metadata = {}) {
        const album = this.getAlbum(albumId);
        if (!album) throw new Error('Album not found');
        if (album.locked) throw new Error('Album is locked');

        // Prevent duplicates
        const existing = this.db.prepare('SELECT id FROM album_items WHERE album_id = ? AND file_path = ?').get(albumId, filePath);
        if (existing) {
            // Already exists, just return the existing item or update it? 
            // For now, let's treat it as success but do nothing, or throw?
            // User said "client can add duplicate images... that should not be the case".
            // We'll return the existing item.
            return this.getItem(existing.id);
        }

        const id = this.generateId();
        const now = Date.now();
        const favorite = metadata.favorite ? 1 : 0;
        const note = metadata.note || '';
        const coverRole = metadata.coverRole || 'none';

        const stmt = this.db.prepare(`
            INSERT INTO album_items (id, album_id, file_path, favorite, note, cover_role, added_by, added_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(id, albumId, filePath, favorite, note, coverRole, addedBy, now);

        if (album) {
            this.updateSessionCollaboration(album.session_id);
        }

        return this.getItem(id);
    }

    getItem(id) {
        const stmt = this.db.prepare('SELECT * FROM album_items WHERE id = ?');
        return stmt.get(id);
    }

    getAlbumItems(albumId) {
        const stmt = this.db.prepare('SELECT * FROM album_items WHERE album_id = ? ORDER BY added_at DESC');
        return stmt.all(albumId);
    }

    updateItem(id, updates) {
        const item = this.getItem(id);
        if (!item) return null;

        const album = this.getAlbum(item.album_id);
        if (album && album.locked) throw new Error('Album is locked');

        const allowed = ['favorite', 'note', 'cover_role', 'file_path'];
        const sets = [];
        const values = [];

        for (const key of updates) {
            const dbKey = key === 'coverRole' ? 'cover_role' : key;
            if (allowed.includes(dbKey)) {
                if (dbKey === 'favorite') {
                    sets.push(`${dbKey} = ?`);
                    values.push(updates[key] ? 1 : 0);
                } else {
                    sets.push(`${dbKey} = ?`);
                    values.push(updates[key]);
                }
            }
        }

        if (sets.length === 0) return this.getItem(id);

        values.push(id);
        const stmt = this.db.prepare(`UPDATE album_items SET ${sets.join(', ')} WHERE id = ?`);
        stmt.run(...values);

        // Fetch updated item
        const updatedItem = this.getItem(id);
        if (updatedItem) {
            // album is already defined at top of function
            this.updateSessionCollaboration(album.session_id);
        }

        return updatedItem;
    }

    removeItem(id) {
        const item = this.getItem(id);
        if (!item) return false;

        const album = this.getAlbum(item.album_id);
        if (album && album.locked) throw new Error('Album is locked');

        const stmt = this.db.prepare('DELETE FROM album_items WHERE id = ?');
        const result = stmt.run(id);

        if (result.changes > 0 && item) {
            // album is already declared at top
            this.updateSessionCollaboration(album.session_id);
        }

        return result.changes > 0;
    }

    removeItemByPath(albumId, filePath) {
        const stmt = this.db.prepare('DELETE FROM album_items WHERE album_id = ? AND file_path = ?');
        const result = stmt.run(albumId, filePath);

        if (result.changes > 0) {
            this.updateSessionCollaboration(albumId);
        }

        return result.changes > 0;
    }

    updateSessionCollaboration(sessionId, folderPath = null) {
        const safeFolderPath = folderPath === undefined ? null : folderPath;
        const existing = this.getSessionCollaboration(sessionId);
        const existingFolderPath = existing?.folder_path || safeFolderPath || null;

        console.log('[AlbumStore] updateSessionCollaboration:', { sessionId, folderPath: safeFolderPath, existing: !!existing, finalPath: existingFolderPath });

        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO session_collaboration (session_id, folder_path, created_at, last_updated)
            VALUES (?, ?, ?, ?)
        `);
        stmt.run(sessionId, existingFolderPath, existing?.created_at || Date.now(), Date.now());
    }

    getSessionCollaboration(sessionId) {
        const stmt = this.db.prepare('SELECT * FROM session_collaboration WHERE session_id = ?');
        return stmt.get(sessionId);
    }

    migrateToNewSession(oldSessionId, newSessionId) {
        const albums = this.getSessionAlbums(oldSessionId);
        let migratedCount = 0;

        for (const album of albums) {
            const items = this.getAlbumItems(album.id);
            const newAlbumId = this.generateId();
            const now = Date.now();

            const insertAlbum = this.db.prepare(`
                INSERT INTO albums (id, session_id, name, type, status, locked, created_by, created_at, approved_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            insertAlbum.run(newAlbumId, newSessionId, album.name, album.type, album.status, album.locked, album.created_by, album.created_at, album.approved_by);

            for (const item of items) {
                const newItemId = this.generateId();
                const insertItem = this.db.prepare(`
                    INSERT INTO album_items (id, album_id, file_path, favorite, note, cover_role, added_by, added_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `);
                insertItem.run(newItemId, newAlbumId, item.file_path, item.favorite, item.note, item.cover_role, item.added_by, item.added_at);
                migratedCount++;
            }
        }

        const collab = this.getSessionCollaboration(oldSessionId);
        if (collab) {
            const updateCollab = this.db.prepare(`
                INSERT OR REPLACE INTO session_collaboration (session_id, folder_path, created_at, last_updated)
                VALUES (?, ?, ?, ?)
            `);
            updateCollab.run(newSessionId, collab.folder_path, collab.created_at, Date.now());
        }

        return { albums: albums.length, items: migratedCount };
    }

    clearSessionData(sessionId) {
        const albums = this.getSessionAlbums(sessionId);

        for (const album of albums) {
            this.db.prepare('DELETE FROM album_items WHERE album_id = ?').run(album.id);
        }

        this.db.prepare('DELETE FROM albums WHERE session_id = ?').run(sessionId);
        this.db.prepare('DELETE FROM session_collaboration WHERE session_id = ?').run(sessionId);
    }

    findByFolderPath(folderPath) {
        const stmt = this.db.prepare(`
            SELECT sc.*, COUNT(a.id) as album_count
            FROM session_collaboration sc
            LEFT JOIN albums a ON a.session_id = sc.session_id
            WHERE sc.folder_path = ?
            GROUP BY sc.session_id
            ORDER BY sc.last_updated DESC
        `);
        return stmt.get(folderPath);
    }

    exportSession(sessionId) {
        const albums = this.getSessionAlbums(sessionId);
        const collab = this.getSessionCollaboration(sessionId);

        const exportedAlbums = albums.map(album => ({
            id: album.id,
            name: album.name,
            type: album.type,
            status: album.status,
            locked: !!album.locked,
            createdBy: album.created_by,
            createdAt: album.created_at,
            approvedBy: album.approved_by,
            items: this.getAlbumItems(album.id).map(item => ({
                path: item.file_path,
                favorite: !!item.favorite,
                note: item.note || '',
                coverRole: item.cover_role,
                addedBy: item.added_by,
                addedAt: item.added_at
            }))
        }));

        return {
            sessionId,
            folderPath: collab?.folder_path || '',
            exportedAt: Date.now(),
            albums: exportedAlbums
        };
    }
}

export default AlbumStore;
