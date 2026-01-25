import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SessionStore {
    constructor(dbPath) {
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        this.db = new Database(dbPath);
        this.init();
    }

    init() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                folder_path TEXT NOT NULL,
                folder_name TEXT NOT NULL,
                password TEXT NOT NULL,
                status TEXT DEFAULT 'inactive',
                created_at INTEGER NOT NULL,
                last_deployed_at INTEGER,
                total_duration_ms INTEGER DEFAULT 0,
                users_involved TEXT DEFAULT '[]'
            )
        `);
    }

    generateId() {
        return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    }

    generatePassword() {
        return crypto.randomBytes(4).toString('hex');
    }

    createSession(folderPath, password = null) {
        const id = this.generateId();
        const folderName = path.basename(folderPath);
        const pwd = password || this.generatePassword();
        const now = Date.now();

        const stmt = this.db.prepare(`
            INSERT INTO sessions (id, folder_path, folder_name, password, status, created_at)
            VALUES (?, ?, ?, ?, 'inactive', ?)
        `);
        stmt.run(id, folderPath, folderName, pwd, now);

        return this.getSession(id);
    }

    getSession(id) {
        const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
        const row = stmt.get(id);
        if (!row) return null;
        return {
            ...row,
            usersInvolved: JSON.parse(row.users_involved || '[]')
        };
    }

    getAllSessions() {
        const stmt = this.db.prepare('SELECT * FROM sessions ORDER BY created_at DESC');
        return stmt.all().map(row => ({
            ...row,
            usersInvolved: JSON.parse(row.users_involved || '[]')
        }));
    }

    updateSession(id, updates) {
        const allowed = ['status', 'last_deployed_at', 'total_duration_ms', 'users_involved', 'password'];
        const sets = [];
        const values = [];

        for (const key of allowed) {
            if (updates[key] !== undefined) {
                const dbKey = key === 'usersInvolved' ? 'users_involved' : key;
                sets.push(`${dbKey} = ?`);
                values.push(key === 'users_involved' || key === 'usersInvolved'
                    ? JSON.stringify(updates[key])
                    : updates[key]);
            }
        }

        if (sets.length === 0) return this.getSession(id);

        values.push(id);
        const stmt = this.db.prepare(`UPDATE sessions SET ${sets.join(', ')} WHERE id = ?`);
        stmt.run(...values);

        return this.getSession(id);
    }

    deleteSession(id) {
        const stmt = this.db.prepare('DELETE FROM sessions WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    }

    // Mark session as deployed
    deploySession(id) {
        return this.updateSession(id, {
            status: 'active',
            last_deployed_at: Date.now()
        });
    }

    // Mark session as stopped and update duration
    stopSession(id, durationMs = 0) {
        const session = this.getSession(id);
        if (!session) return null;

        return this.updateSession(id, {
            status: 'inactive',
            total_duration_ms: (session.total_duration_ms || 0) + durationMs
        });
    }

    // Add a user to the involved users list
    addUserToSession(id, username) {
        const session = this.getSession(id);
        if (!session) return null;

        const users = session.usersInvolved || [];
        if (!users.includes(username)) {
            users.push(username);
            return this.updateSession(id, { users_involved: users });
        }
        return session;
    }

    // Rotate password
    rotatePassword(id) {
        const newPassword = this.generatePassword();
        return this.updateSession(id, { password: newPassword });
    }

    // Find session by folder path
    findByFolderPath(folderPath) {
        const stmt = this.db.prepare('SELECT * FROM sessions WHERE folder_path = ?');
        const row = stmt.get(folderPath);
        if (!row) return null;
        return {
            ...row,
            usersInvolved: JSON.parse(row.users_involved || '[]')
        };
    }

    // --- Global Ban Management ---

    ensureGlobalBansTable() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS global_bans (
                canonical_username TEXT PRIMARY KEY,
                reason TEXT,
                banned_at INTEGER,
                banned_by TEXT
            )
        `);
    }

    addGlobalBan(canonicalUsername, reason = 'Banned by owner', bannedBy = 'owner') {
        this.ensureGlobalBansTable();
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO global_bans (canonical_username, reason, banned_at, banned_by)
            VALUES (?, ?, ?, ?)
        `);
        stmt.run(canonicalUsername, reason, Date.now(), bannedBy);
    }

    removeGlobalBan(canonicalUsername) {
        this.ensureGlobalBansTable();
        const stmt = this.db.prepare('DELETE FROM global_bans WHERE canonical_username = ?');
        stmt.run(canonicalUsername);
    }

    isGloballyBanned(canonicalUsername) {
        this.ensureGlobalBansTable();
        const stmt = this.db.prepare('SELECT * FROM global_bans WHERE canonical_username = ?');
        return !!stmt.get(canonicalUsername);
    }

    getGlobalBannedUser(canonicalUsername) {
        this.ensureGlobalBansTable();
        const stmt = this.db.prepare('SELECT * FROM global_bans WHERE canonical_username = ?');
        return stmt.get(canonicalUsername);
    }

    getAllGlobalBans() {
        this.ensureGlobalBansTable();
        const stmt = this.db.prepare('SELECT * FROM global_bans');
        return stmt.all().map(row => ({
            username: row.canonical_username,
            reason: row.reason,
            bannedAt: row.banned_at,
            bannedBy: row.banned_by
        }));
    }
}

export default SessionStore;
