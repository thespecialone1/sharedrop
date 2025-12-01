package storage

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"file-share-app/internal/models"
)

// DB wraps the database connection with performance optimizations
type DB struct {
	*sql.DB
}

// InitDB initializes the database with connection pooling
func InitDB(dbPath string) (*DB, error) {
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Performance optimizations
	db.SetMaxOpenConns(25)           // Limit concurrent connections
	db.SetMaxIdleConns(10)            // Keep idle connections ready
	db.SetConnMaxLifetime(time.Hour)  // Recycle connections

	// Enable WAL mode for better concurrency
	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		return nil, fmt.Errorf("failed to enable WAL mode: %w", err)
	}

	// Create tables
	if err := createTables(db); err != nil {
		return nil, err
	}

	return &DB{db}, nil
}

func createTables(db *sql.DB) error {
	schema := `
	CREATE TABLE IF NOT EXISTS shares (
		id TEXT PRIMARY KEY,
		folder_path TEXT NOT NULL,
		password TEXT NOT NULL,
		expires_at DATETIME,
		created_at DATETIME NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_shares_id ON shares(id);

	CREATE TABLE IF NOT EXISTS download_logs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		share_id TEXT NOT NULL,
		file_name TEXT NOT NULL,
		downloaded_at DATETIME NOT NULL,
		FOREIGN KEY (share_id) REFERENCES shares(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS chat_messages (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		share_id TEXT NOT NULL,
		user_name TEXT NOT NULL,
		message TEXT NOT NULL,
		photo_ref TEXT,
		timestamp DATETIME NOT NULL,
		FOREIGN KEY (share_id) REFERENCES shares(id) ON DELETE CASCADE
	);
	CREATE INDEX IF NOT EXISTS idx_chat_share ON chat_messages(share_id);

	CREATE TABLE IF NOT EXISTS selections (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		share_id TEXT NOT NULL,
		file_name TEXT NOT NULL,
		user_name TEXT NOT NULL,
		is_favorite BOOLEAN DEFAULT 0,
		tags TEXT,
		timestamp DATETIME NOT NULL,
		FOREIGN KEY (share_id) REFERENCES shares(id) ON DELETE CASCADE
	);
	CREATE INDEX IF NOT EXISTS idx_selections_share ON selections(share_id);
	CREATE INDEX IF NOT EXISTS idx_selections_user ON selections(user_name);

	CREATE TABLE IF NOT EXISTS votes (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		share_id TEXT NOT NULL,
		file_name TEXT NOT NULL,
		user_name TEXT NOT NULL,
		vote INTEGER NOT NULL,
		timestamp DATETIME NOT NULL,
		FOREIGN KEY (share_id) REFERENCES shares(id) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS sessions (
		share_id TEXT PRIMARY KEY,
		session_name TEXT NOT NULL,
		created_at DATETIME NOT NULL,
		FOREIGN KEY (share_id) REFERENCES shares(id) ON DELETE CASCADE
	);
	`

	_, err := db.Exec(schema)
	return err
}

// SaveShare saves a share to the database
func (db *DB) SaveShare(share *models.Share) error {
	query := `INSERT INTO shares (id, folder_path, password, expires_at, created_at) 
	          VALUES (?, ?, ?, ?, ?)`
	_, err := db.Exec(query, share.ID, share.FolderPath, share.Password, share.ExpiresAt, share.CreatedAt)
	return err
}

// GetShare retrieves a share by ID
func (db *DB) GetShare(id string) (*models.Share, error) {
	share := &models.Share{}
	var expiresAt sql.NullTime

	query := `SELECT id, folder_path, password, expires_at, created_at FROM shares WHERE id = ?`
	err := db.QueryRow(query, id).Scan(&share.ID, &share.FolderPath, &share.Password, &expiresAt, &share.CreatedAt)
	if err != nil {
		return nil, err
	}

	if expiresAt.Valid {
		share.ExpiresAt = &expiresAt.Time
	}

	return share, nil
}

// DeleteShare removes a share and its related data
func (db *DB) DeleteShare(id string) error {
	_, err := db.Exec("DELETE FROM shares WHERE id = ?", id)
	return err
}

// GetAllShares retrieves all shares
func (db *DB) GetAllShares() ([]*models.Share, error) {
	rows, err := db.Query(`SELECT id, folder_path, password, expires_at, created_at FROM shares`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var shares []*models.Share
	for rows.Next() {
		share := &models.Share{}
		var expiresAt sql.NullTime
		if err := rows.Scan(&share.ID, &share.FolderPath, &share.Password, &expiresAt, &share.CreatedAt); err != nil {
			log.Printf("Error scanning share: %v", err)
			continue
		}
		if expiresAt.Valid {
			share.ExpiresAt = &expiresAt.Time
		}
		shares = append(shares, share)
	}

	return shares, nil
}

// SaveChatMessage saves a chat message
func (db *DB) SaveChatMessage(msg *models.ChatMessage) error {
	query := `INSERT INTO chat_messages (share_id, user_name, message, photo_ref, timestamp) 
	          VALUES (?, ?, ?, ?, ?)`
	result, err := db.Exec(query, msg.ShareID, msg.UserName, msg.Message, msg.PhotoRef, msg.Timestamp)
	if err != nil {
		return err
	}
	id, _ := result.LastInsertId()
	msg.ID = int(id)
	return nil
}

// GetChatMessages retrieves chat messages for a share
func (db *DB) GetChatMessages(shareID string) ([]*models.ChatMessage, error) {
	rows, err := db.Query(`SELECT id, share_id, user_name, message, photo_ref, timestamp 
	                        FROM chat_messages WHERE share_id = ? ORDER BY timestamp ASC`, shareID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []*models.ChatMessage
	for rows.Next() {
		msg := &models.ChatMessage{}
		if err := rows.Scan(&msg.ID, &msg.ShareID, &msg.UserName, &msg.Message, &msg.PhotoRef, &msg.Timestamp); err != nil {
			continue
		}
		messages = append(messages, msg)
	}

	return messages, nil
}

// SaveSelection saves a photo selection
func (db *DB) SaveSelection(sel *models.PhotoSelection) error {
	tagsJSON, _ := json.Marshal(sel.Tags)
	query := `INSERT OR REPLACE INTO selections (share_id, file_name, user_name, is_favorite, tags, timestamp)
	          VALUES (?, ?, ?, ?, ?, ?)`
	_, err := db.Exec(query, sel.ShareID, sel.FileName, sel.UserName, sel.IsFavorite, tagsJSON, sel.Timestamp)
	return err
}

// GetSelections retrieves selections for a share
func (db *DB) GetSelections(shareID string) ([]*models.PhotoSelection, error) {
	rows, err := db.Query(`SELECT id, share_id, file_name, user_name, is_favorite, tags, timestamp 
	                        FROM selections WHERE share_id = ?`, shareID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var selections []*models.PhotoSelection
	for rows.Next() {
		sel := &models.PhotoSelection{}
		var tagsJSON string
		if err := rows.Scan(&sel.ID, &sel.ShareID, &sel.FileName, &sel.UserName, &sel.IsFavorite, &tagsJSON, &sel.Timestamp); err != nil {
			continue
		}
		json.Unmarshal([]byte(tagsJSON), &sel.Tags)
		selections = append(selections, sel)
	}

	return selections, nil
}
