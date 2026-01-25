import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

class ChatStore {
    constructor(dbPath) {
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        this.db = new Database(dbPath);
        this.init();
    }

    init() {
        // Create messages table if needed
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS messages (
                message_id INTEGER PRIMARY KEY AUTOINCREMENT,
                room_id TEXT,
                username TEXT,
                color TEXT,
                message TEXT,
                reply_to INTEGER,
                attachments TEXT,
                ts INTEGER
            )
        `);

        // Create reactions table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS reactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id INTEGER NOT NULL,
                username TEXT NOT NULL,
                emoji TEXT NOT NULL,
                UNIQUE(message_id, username)
            )
        `);

        // Migrate: add reply_to and attachments if missing
        const columns = this.db.prepare("PRAGMA table_info(messages)").all();
        const columnNames = columns.map(c => c.name);

        if (!columnNames.includes('reply_to')) {
            try {
                this.db.exec('ALTER TABLE messages ADD COLUMN reply_to INTEGER');
            } catch (e) { /* column may already exist */ }
        }
        if (!columnNames.includes('attachments')) {
            try {
                this.db.exec('ALTER TABLE messages ADD COLUMN attachments TEXT');
            } catch (e) { /* column may already exist */ }
        }
    }

    saveMessage(roomId, username, color, message, replyTo = null, attachments = null) {
        if (!message || !message.trim()) return null;
        const attachmentsJson = attachments ? JSON.stringify(attachments) : null;
        const stmt = this.db.prepare(
            'INSERT INTO messages (room_id, username, color, message, reply_to, attachments, ts) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        const result = stmt.run(roomId, username, color, message, replyTo, attachmentsJson, Date.now());
        return result.lastInsertRowid;
    }

    getRoomMessages(roomId, limit = 100) {
        const stmt = this.db.prepare(`
            SELECT 
                m.message_id as id, 
                m.username, 
                m.color, 
                m.message as text, 
                m.reply_to as replyTo,
                m.attachments,
                m.ts as timestamp
            FROM messages m 
            WHERE m.room_id = ? 
            ORDER BY m.ts ASC 
            LIMIT ?
        `);
        const messages = stmt.all(roomId, limit);

        // Get reactions for all messages
        const messageIds = messages.map(m => m.id);
        if (messageIds.length > 0) {
            const placeholders = messageIds.map(() => '?').join(',');
            const reactionsStmt = this.db.prepare(
                `SELECT message_id, emoji, GROUP_CONCAT(username) as users 
                 FROM reactions 
                 WHERE message_id IN (${placeholders}) 
                 GROUP BY message_id, emoji`
            );
            const reactions = reactionsStmt.all(...messageIds);

            // Attach reactions to messages
            const reactionMap = {};
            for (const r of reactions) {
                if (!reactionMap[r.message_id]) reactionMap[r.message_id] = {};
                reactionMap[r.message_id][r.emoji] = r.users.split(',');
            }

            for (const msg of messages) {
                msg.attachments = msg.attachments ? JSON.parse(msg.attachments) : null;
                msg.reactions = reactionMap[msg.id] || {};
            }
        }

        return messages;
    }

    getMessage(messageId) {
        const stmt = this.db.prepare('SELECT message_id as id, username, color, message as text, ts as timestamp FROM messages WHERE message_id = ?');
        return stmt.get(messageId);
    }

    addReaction(messageId, username, emoji) {
        try {
            const stmt = this.db.prepare(
                'INSERT OR REPLACE INTO reactions (message_id, username, emoji) VALUES (?, ?, ?)'
            );
            stmt.run(messageId, username, emoji);
            return true;
        } catch (e) {
            console.error('Error adding reaction:', e.message);
            return false;
        }
    }

    removeReaction(messageId, username) {
        const stmt = this.db.prepare('DELETE FROM reactions WHERE message_id = ? AND username = ?');
        const result = stmt.run(messageId, username);
        return result.changes > 0;
    }

    deleteMessage(messageId) {
        // Delete reactions first
        this.db.prepare('DELETE FROM reactions WHERE message_id = ?').run(messageId);
        const stmt = this.db.prepare('DELETE FROM messages WHERE message_id = ?');
        const result = stmt.run(messageId);
        return result.changes > 0;
    }

    getReactions(messageId) {
        const stmt = this.db.prepare(
            'SELECT emoji, GROUP_CONCAT(username) as users FROM reactions WHERE message_id = ? GROUP BY emoji'
        );
        const result = stmt.all(messageId);
        const reactions = {};
        for (const r of result) {
            reactions[r.emoji] = r.users.split(',');
        }
        return reactions;
    }

    clearRoom(roomId) {
        // Delete reactions for messages in room first
        this.db.exec(`DELETE FROM reactions WHERE message_id IN (SELECT message_id FROM messages WHERE room_id = '${roomId}')`);
        const stmt = this.db.prepare('DELETE FROM messages WHERE room_id = ?');
        const info = stmt.run(roomId);
        return { deleted: info.changes };
    }

    getMessageCount(roomId) {
        const stmt = this.db.prepare('SELECT COUNT(*) as count FROM messages WHERE room_id = ?');
        const result = stmt.get(roomId);
        return result?.count || 0;
    }
}

export default ChatStore;
