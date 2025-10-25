package main

import (
	"bytes"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"html/template"
	"image"
	"image/jpeg"
	_ "image/gif"
	_ "image/png"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"github.com/nfnt/resize"
)

type Share struct {
	ID          string     `json:"id"`
	SessionName string     `json:"session_name"`
	FolderPath  string     `json:"folder_path"`
	Password    string     `json:"password"`
	CreatedAt   time.Time  `json:"created_at"`
	ExpiresAt   *time.Time `json:"expires_at,omitempty"`
	AccessCount int        `json:"access_count"`
}

type DownloadLog struct {
	ShareID    string    `json:"share_id"`
	FileName   string    `json:"file_name"`
	ClientIP   string    `json:"client_ip"`
	DownloadAt time.Time `json:"download_at"`
}

type Comment struct {
	ID        string    `json:"id"`
	ShareID   string    `json:"share_id"`
	FileName  string    `json:"file_name"`
	Author    string    `json:"author"`
	Text      string    `json:"text"`
	CreatedAt time.Time `json:"created_at"`
	ParentID  string    `json:"parent_id,omitempty"`
}

type ThumbnailCache struct {
	cache map[string][]byte
	mu    sync.RWMutex
}

type PhotoSelection struct {
	ID         string    `json:"id"`
	SessionID  string    `json:"session_id"`
	ShareID    string    `json:"share_id"`
	FileName   string    `json:"file_name"`
	UserName   string    `json:"user_name"`
	IsFavorite bool      `json:"is_favorite"`
	Tags       []string  `json:"tags"`
	Timestamp  time.Time `json:"timestamp"`
}

type ShareSession struct {
	ShareID        string    `json:"share_id"`
	SessionName    string    `json:"session_name"`
	AllowMultiUser bool      `json:"allow_multi_user"`
	ActiveUsers    []string  `json:"active_users"`
	CreatedAt      time.Time `json:"created_at"`
}

type App struct {
	shares         map[string]*Share
	downloadLogs   []DownloadLog
	comments       []Comment
	thumbnailCache *ThumbnailCache
	sessions       map[string]*ShareSession
	selections     []PhotoSelection
	db             *sql.DB
	mu             sync.RWMutex
}

func NewApp() *App {
	app := &App{
		shares:         make(map[string]*Share),
		downloadLogs:   make([]DownloadLog, 0),
		comments:       make([]Comment, 0),
		thumbnailCache: &ThumbnailCache{cache: make(map[string][]byte)},
		sessions:       make(map[string]*ShareSession),
		selections:     make([]PhotoSelection, 0),
	}
	
	// Initialize database
	if err := app.InitDB(); err != nil {
		log.Printf("Warning: Failed to initialize database: %v", err)
	}
	
	// Load existing data
	if err := app.LoadFromDB(); err != nil {
		log.Printf("Warning: Failed to load from database: %v", err)
	}
	
	return app
}

func (app *App) InitDB() error {
	db, err := sql.Open("sqlite3", "./sharedrop.db")
	if err != nil {
		return err
	}
	app.db = db
	
	// Create tables
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS shares (
			id TEXT PRIMARY KEY,
			session_name TEXT,
			folder_path TEXT,
			password TEXT,
			created_at DATETIME,
			expires_at DATETIME,
			access_count INTEGER
		)
	`)
	if err != nil {
		return err
	}
	
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS photo_selections (
			id TEXT PRIMARY KEY,
			session_id TEXT,
			share_id TEXT,
			file_name TEXT,
			user_name TEXT,
			is_favorite BOOLEAN,
			tags TEXT,
			timestamp DATETIME
		)
	`)
	if err != nil {
		return err
	}
	
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS comments (
			id TEXT PRIMARY KEY,
			share_id TEXT,
			file_name TEXT,
			author TEXT,
			text TEXT,
			created_at DATETIME,
			parent_id TEXT
		)
	`)
	if err != nil {
		return err
	}
	
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS sessions (
			share_id TEXT PRIMARY KEY,
			session_name TEXT,
			allow_multi_user BOOLEAN,
			active_users TEXT,
			created_at DATETIME
		)
	`)
	return err
}

func (app *App) LoadFromDB() error {
	if app.db == nil {
		return fmt.Errorf("database not initialized")
	}
	
	// Load shares
	rows, err := app.db.Query("SELECT id, session_name, folder_path, password, created_at, expires_at, access_count FROM shares")
	if err != nil {
		return err
	}
	defer rows.Close()
	
	for rows.Next() {
		var share Share
		var expiresAt sql.NullTime
		err := rows.Scan(&share.ID, &share.SessionName, &share.FolderPath, &share.Password, &share.CreatedAt, &expiresAt, &share.AccessCount)
		if err != nil {
			log.Printf("Error loading share: %v", err)
			continue
		}
		if expiresAt.Valid {
			share.ExpiresAt = &expiresAt.Time
		}
		app.shares[share.ID] = &share
	}
	
	// Load selections
	rows, err = app.db.Query("SELECT id, session_id, share_id, file_name, user_name, is_favorite, tags, timestamp FROM photo_selections")
	if err != nil {
		return err
	}
	defer rows.Close()
	
	for rows.Next() {
		var sel PhotoSelection
		var tagsJSON string
		err := rows.Scan(&sel.ID, &sel.SessionID, &sel.ShareID, &sel.FileName, &sel.UserName, &sel.IsFavorite, &tagsJSON, &sel.Timestamp)
		if err != nil {
			log.Printf("Error loading selection: %v", err)
			continue
		}
		json.Unmarshal([]byte(tagsJSON), &sel.Tags)
		app.selections = append(app.selections, sel)
	}
	
	// Load comments
	rows, err = app.db.Query("SELECT id, share_id, file_name, author, text, created_at, parent_id FROM comments")
	if err != nil {
		return err
	}
	defer rows.Close()
	
	for rows.Next() {
		var comment Comment
		err := rows.Scan(&comment.ID, &comment.ShareID, &comment.FileName, &comment.Author, &comment.Text, &comment.CreatedAt, &comment.ParentID)
		if err != nil {
			log.Printf("Error loading comment: %v", err)
			continue
		}
		app.comments = append(app.comments, comment)
	}
	
	// Load sessions
	rows, err = app.db.Query("SELECT share_id, session_name, allow_multi_user, active_users, created_at FROM sessions")
	if err != nil {
		return err
	}
	defer rows.Close()
	
	for rows.Next() {
		var session ShareSession
		var usersJSON string
		err := rows.Scan(&session.ShareID, &session.SessionName, &session.AllowMultiUser, &usersJSON, &session.CreatedAt)
		if err != nil {
			log.Printf("Error loading session: %v", err)
			continue
		}
		json.Unmarshal([]byte(usersJSON), &session.ActiveUsers)
		app.sessions[session.ShareID] = &session
	}
	
	log.Printf("Loaded %d shares, %d selections, %d comments from database", len(app.shares), len(app.selections), len(app.comments))
	return nil
}

// SaveShare saves or updates a share in the database
func (app *App) SaveShare(share *Share) error {
	if app.db == nil {
		return fmt.Errorf("database not initialized")
	}

	var expiresAt interface{}
	if share.ExpiresAt != nil {
		expiresAt = share.ExpiresAt
	}

	_, err := app.db.Exec(`
		INSERT OR REPLACE INTO shares (id, session_name, folder_path, password, created_at, expires_at, access_count)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, share.ID, share.SessionName, share.FolderPath, share.Password, share.CreatedAt, expiresAt, share.AccessCount)
	return err
}

// SaveSelection saves or updates a photo selection
func (app *App) SaveSelection(selection *PhotoSelection) error {
	if app.db == nil {
		return fmt.Errorf("database not initialized")
	}

	tagsJSON, _ := json.Marshal(selection.Tags)
	_, err := app.db.Exec(`
		INSERT OR REPLACE INTO photo_selections (id, session_id, share_id, file_name, user_name, is_favorite, tags, timestamp)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, selection.ID, selection.SessionID, selection.ShareID, selection.FileName, selection.UserName, selection.IsFavorite, string(tagsJSON), selection.Timestamp)
	return err
}

// SaveComment saves a comment to the database
func (app *App) SaveComment(comment *Comment) error {
	if app.db == nil {
		return fmt.Errorf("database not initialized")
	}

	_, err := app.db.Exec(`
		INSERT OR REPLACE INTO comments (id, share_id, file_name, author, text, created_at, parent_id)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, comment.ID, comment.ShareID, comment.FileName, comment.Author, comment.Text, comment.CreatedAt, comment.ParentID)
	return err
}

// SaveSession saves or updates a session
func (app *App) SaveSession(session *ShareSession) error {
	if app.db == nil {
		return fmt.Errorf("database not initialized")
	}

	usersJSON, _ := json.Marshal(session.ActiveUsers)
	_, err := app.db.Exec(`
		INSERT OR REPLACE INTO sessions (share_id, session_name, allow_multi_user, active_users, created_at)
		VALUES (?, ?, ?, ?, ?)
	`, session.ShareID, session.SessionName, session.AllowMultiUser, string(usersJSON), session.CreatedAt)
	return err
}

func generateRandomString(length int) string {
	bytes := make([]byte, length)
	rand.Read(bytes)
	return base64.URLEncoding.EncodeToString(bytes)[:length]
}

func (app *App) createShare(folderPath, sessionName string) (*Share, error) {
	info, err := os.Stat(folderPath)
	if err != nil {
		return nil, fmt.Errorf("folder not found: %v", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("path is not a directory")
	}

	share := &Share{
		ID:          generateRandomString(8),
		SessionName: sessionName,
		FolderPath:  folderPath,
		Password:    generateRandomString(12),
		CreatedAt:   time.Now(),
	}

	app.mu.Lock()
	app.shares[share.ID] = share
	// Create session
	session := &ShareSession{
		ShareID:        share.ID,
		SessionName:    sessionName,
		AllowMultiUser: true,
		ActiveUsers:    make([]string, 0),
		CreatedAt:      time.Now(),
	}
	app.sessions[share.ID] = session
	app.mu.Unlock()

	// Save to database
	if err := app.SaveShare(share); err != nil {
		log.Printf("Failed to save share to database: %v", err)
	}
	if err := app.SaveSession(session); err != nil {
		log.Printf("Failed to save session to database: %v", err)
	}

	return share, nil
}

func (app *App) logDownload(shareID, fileName, clientIP string) {
	app.mu.Lock()
	defer app.mu.Unlock()

	app.downloadLogs = append(app.downloadLogs, DownloadLog{
		ShareID:    shareID,
		FileName:   fileName,
		ClientIP:   clientIP,
		DownloadAt: time.Now(),
	})
}

func (app *App) handleCreateShare(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		FolderPath    string `json:"folder_path"`
		SessionName   string `json:"session_name"`
		ExpiresInMins int    `json:"expires_in_mins"` // 0 = never expires
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Default session name if not provided
	sessionName := req.SessionName
	if sessionName == "" {
		sessionName = filepath.Base(req.FolderPath)
	}

	share, err := app.createShare(req.FolderPath, sessionName)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Set expiration if requested
	if req.ExpiresInMins > 0 {
		expiresAt := time.Now().Add(time.Duration(req.ExpiresInMins) * time.Minute)
		share.ExpiresAt = &expiresAt
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(share)
}

func (app *App) handleSharePage(w http.ResponseWriter, r *http.Request) {
	shareID := strings.TrimPrefix(r.URL.Path, "/share/")

	app.mu.RLock()
	share, exists := app.shares[shareID]
	app.mu.RUnlock()

	if !exists {
		http.Error(w, "Share not found", http.StatusNotFound)
		return
	}

	// Check if share has expired
	if share.ExpiresAt != nil && time.Now().After(*share.ExpiresAt) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, "<h1>Share Expired</h1><p>This share link has expired and is no longer available.</p>")
		return
	}

	if r.Method == http.MethodPost {
		r.ParseForm()
		password := r.FormValue("password")
		if password == share.Password {
			files, err := os.ReadDir(share.FolderPath)
			if err != nil {
				http.Error(w, "Failed to read folder", http.StatusInternalServerError)
				return
			}

			type FileInfo struct {
				Name    string
				Size    int64
				IsDir   bool
				IsImage bool
				IsVideo bool
			}

			var fileList []FileInfo
			for _, file := range files {
				if !file.IsDir() {
					info, _ := file.Info()
					fileName := file.Name()
					fileExt := strings.ToLower(filepath.Ext(fileName))
					isImage := isImageFile(fileExt)
					isVideo := isVideoFile(fileExt)
					fileList = append(fileList, FileInfo{
						Name:    fileName,
						Size:    info.Size(),
						IsDir:   false,
						IsImage: isImage,
						IsVideo: isVideo,
					})
				}
			}

			app.mu.Lock()
			share.AccessCount++
			app.mu.Unlock()

			// Save updated access count to database
			if err := app.SaveShare(share); err != nil {
				log.Printf("Failed to save share access count: %v", err)
			}

			tmpl := template.Must(template.New("browse").Funcs(template.FuncMap{
				"formatSize": func(size int64) string {
					const unit = 1024
					if size < unit {
						return fmt.Sprintf("%d B", size)
					}
					div, exp := int64(unit), 0
					for n := size / unit; n >= unit; n /= unit {
						div *= unit
						exp++
					}
					return fmt.Sprintf("%.1f %cB", float64(size)/float64(div), "KMGTPE"[exp])
				},
				"urlEncode": func(s string) string {
					return strings.ReplaceAll(strings.ReplaceAll(strings.ReplaceAll(s, "\\", "\\\\"), "'", "\\'"), "\"", "\\\"")
				},
			}).Parse(browseTemplate))
			tmpl.Execute(w, map[string]interface{}{
				"ShareID": shareID,
				"Files":   fileList,
			})
			return
		}
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, "<script>alert('Invalid password'); window.location.reload();</script>")
		return
	}

	tmpl := template.Must(template.New("password").Parse(passwordTemplate))
	tmpl.Execute(w, shareID)
}

func (app *App) handleDownload(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/download/"), "/")
	if len(parts) < 2 {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	shareID := parts[0]
	fileName := strings.Join(parts[1:], "/")

	app.mu.RLock()
	share, exists := app.shares[shareID]
	app.mu.RUnlock()

	if !exists {
		http.Error(w, "Share not found", http.StatusNotFound)
		return
	}

	filePath := filepath.Join(share.FolderPath, fileName)
	if !strings.HasPrefix(filepath.Clean(filePath), filepath.Clean(share.FolderPath)) {
		http.Error(w, "Invalid file path", http.StatusBadRequest)
		return
	}

	app.logDownload(shareID, fileName, r.RemoteAddr)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filepath.Base(fileName)))
	http.ServeFile(w, r, filePath)
}

func isImageFile(ext string) bool {
	imageExts := []string{".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".heic", ".heif", ".dng", ".cr2", ".nef", ".arw"}
	for _, e := range imageExts {
		if ext == e {
			return true
		}
	}
	return false
}

func isVideoFile(ext string) bool {
	videoExts := []string{".mp4", ".webm", ".ogg", ".mov", ".avi", ".mkv"}
	for _, e := range videoExts {
		if ext == e {
			return true
		}
	}
	return false
}

func (app *App) handleThumbnail(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/thumbnail/"), "/")
	if len(parts) < 2 {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	shareID := parts[0]
	fileName := strings.Join(parts[1:], "/")

	app.mu.RLock()
	share, exists := app.shares[shareID]
	app.mu.RUnlock()

	if !exists {
		http.Error(w, "Share not found", http.StatusNotFound)
		return
	}

	filePath := filepath.Join(share.FolderPath, fileName)
	if !strings.HasPrefix(filepath.Clean(filePath), filepath.Clean(share.FolderPath)) {
		http.Error(w, "Invalid file path", http.StatusBadRequest)
		return
	}

	ext := strings.ToLower(filepath.Ext(fileName))
	if isImageFile(ext) {
		app.generateImageThumbnail(w, filePath)
	} else if isVideoFile(ext) {
		app.generateVideoThumbnail(w, filePath)
	} else {
		http.Error(w, "Not a media file", http.StatusBadRequest)
	}
}

func (app *App) generateImageThumbnail(w http.ResponseWriter, filePath string) {
	// Check cache first
	cacheKey := filePath
	app.thumbnailCache.mu.RLock()
	if cached, ok := app.thumbnailCache.cache[cacheKey]; ok {
		app.thumbnailCache.mu.RUnlock()
		w.Header().Set("Content-Type", "image/jpeg")
		w.Header().Set("Cache-Control", "public, max-age=3600")
		w.Write(cached)
		return
	}
	app.thumbnailCache.mu.RUnlock()

	ext := strings.ToLower(filepath.Ext(filePath))
	
	// HEIC/HEIF and RAW files need special handling
	if ext == ".heic" || ext == ".heif" || ext == ".dng" || ext == ".cr2" || ext == ".nef" || ext == ".arw" {
		if runtime.GOOS == "darwin" {
			// macOS: use sips command
			cmd := exec.Command("sips", "-s", "format", "jpeg", "-Z", "300", filePath, "--out", "/dev/stdout")
			output, err := cmd.Output()
			if err != nil {
				log.Printf("Failed to convert %s image: %v", ext, err)
				http.Error(w, fmt.Sprintf("Failed to convert %s image", ext), http.StatusInternalServerError)
				return
			}
			// Cache the thumbnail
			app.thumbnailCache.mu.Lock()
			app.thumbnailCache.cache[cacheKey] = output
			app.thumbnailCache.mu.Unlock()
			w.Header().Set("Content-Type", "image/jpeg")
			w.Header().Set("Cache-Control", "public, max-age=3600")
			w.Write(output)
			return
		} else if runtime.GOOS == "windows" {
			// Windows: try ImageMagick/magick command
			cmd := exec.Command("magick", "convert", filePath, "-resize", "300x300", "jpeg:-")
			output, err := cmd.Output()
			if err != nil {
				log.Printf("Failed to convert %s image (ImageMagick not installed?): %v", ext, err)
				http.Error(w, fmt.Sprintf("%s format not supported on Windows without ImageMagick", ext), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "image/jpeg")
			w.Header().Set("Cache-Control", "public, max-age=3600")
			w.Write(output)
			return
		} else {
			// Linux: try ImageMagick
			cmd := exec.Command("convert", filePath, "-resize", "300x300", "jpeg:-")
			output, err := cmd.Output()
			if err != nil {
				log.Printf("Failed to convert %s image (ImageMagick not installed?): %v", ext, err)
				http.Error(w, fmt.Sprintf("%s format not supported without ImageMagick", ext), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "image/jpeg")
			w.Header().Set("Cache-Control", "public, max-age=3600")
			w.Write(output)
			return
		}
	}

	file, err := os.Open(filePath)
	if err != nil {
		http.Error(w, "Failed to open image", http.StatusInternalServerError)
		return
	}
	defer file.Close()

	img, _, err := image.Decode(file)
	if err != nil {
		http.Error(w, "Failed to decode image", http.StatusInternalServerError)
		return
	}

	thumbnail := resize.Thumbnail(300, 300, img, resize.Lanczos3)

	// Encode to buffer for caching
	var buf []byte
	writer := &bytes.Buffer{}
	jpeg.Encode(writer, thumbnail, &jpeg.Options{Quality: 85})
	buf = writer.Bytes()

	// Cache the thumbnail
	app.thumbnailCache.mu.Lock()
	app.thumbnailCache.cache[cacheKey] = buf
	app.thumbnailCache.mu.Unlock()

	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.Write(buf)
}

func (app *App) generateVideoThumbnail(w http.ResponseWriter, filePath string) {
	// Use ffmpeg to extract first frame
	cmd := exec.Command("ffmpeg", "-i", filePath, "-vframes", "1", "-vf", "scale=300:-1", "-f", "image2pipe", "-vcodec", "png", "-")
	output, err := cmd.Output()
	if err != nil {
		// Fallback: send a placeholder or error
		http.Error(w, "Failed to generate video thumbnail", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.Write(output)
}

func (app *App) handlePreview(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/preview/"), "/")
	if len(parts) < 2 {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	shareID := parts[0]
	fileName := strings.Join(parts[1:], "/")

	app.mu.RLock()
	share, exists := app.shares[shareID]
	app.mu.RUnlock()

	if !exists {
		http.Error(w, "Share not found", http.StatusNotFound)
		return
	}

	filePath := filepath.Join(share.FolderPath, fileName)
	if !strings.HasPrefix(filepath.Clean(filePath), filepath.Clean(share.FolderPath)) {
		http.Error(w, "Invalid file path", http.StatusBadRequest)
		return
	}

	ext := strings.ToLower(filepath.Ext(fileName))
	
	// Convert HEIC/HEIF and RAW to JPEG for preview
	if ext == ".heic" || ext == ".heif" || ext == ".dng" || ext == ".cr2" || ext == ".nef" || ext == ".arw" {
		var cmd *exec.Cmd
		if runtime.GOOS == "darwin" {
			cmd = exec.Command("sips", "-s", "format", "jpeg", filePath, "--out", "/dev/stdout")
		} else if runtime.GOOS == "windows" {
			cmd = exec.Command("magick", "convert", filePath, "jpeg:-")
		} else {
			cmd = exec.Command("convert", filePath, "jpeg:-")
		}
		
		output, err := cmd.Output()
		if err != nil {
			log.Printf("Failed to convert %s image for preview: %v", ext, err)
			http.Error(w, fmt.Sprintf("Failed to convert %s image", ext), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "image/jpeg")
		w.Write(output)
		return
	}
	
	if isImageFile(ext) {
		w.Header().Set("Content-Type", "image/"+strings.TrimPrefix(ext, "."))
	} else if isVideoFile(ext) {
		w.Header().Set("Content-Type", "video/"+strings.TrimPrefix(ext, "."))
		w.Header().Set("Accept-Ranges", "bytes")
	} else {
		http.Error(w, "Not a media file", http.StatusBadRequest)
		return
	}

	http.ServeFile(w, r, filePath)
}

func (app *App) handleValidateName(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ShareID  string `json:"share_id"`
		UserName string `json:"user_name"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Check if share exists
	app.mu.RLock()
	_, exists := app.shares[req.ShareID]
	session, sessionExists := app.sessions[req.ShareID]
	app.mu.RUnlock()

	if !exists {
		http.Error(w, "Share not found", http.StatusNotFound)
		return
	}

	// Check if username already taken
	if sessionExists {
		app.mu.RLock()
		for _, activeUser := range session.ActiveUsers {
			if activeUser == req.UserName {
				app.mu.RUnlock()
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusConflict)
				json.NewEncoder(w).Encode(map[string]interface{}{
					"success": false,
					"error":   fmt.Sprintf("Name '%s' is already taken. Try: %s2, %s_B, or a different name.", req.UserName, req.UserName, req.UserName),
				})
				return
			}
		}
		app.mu.RUnlock()
	}

	// Name is available - add to active users
	app.mu.Lock()
	if sessionExists {
		session.ActiveUsers = append(session.ActiveUsers, req.UserName)
	}
	app.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Name claimed successfully",
	})
}

func (app *App) handleCreateComment(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ShareID  string `json:"share_id"`
		FileName string `json:"file_name"`
		Author   string `json:"author"`
		Text     string `json:"text"`
		ParentID string `json:"parent_id,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Validate share exists
	app.mu.RLock()
	_, exists := app.shares[req.ShareID]
	app.mu.RUnlock()

	if !exists {
		http.Error(w, "Share not found", http.StatusNotFound)
		return
	}

	comment := Comment{
		ID:        generateRandomString(8),
		ShareID:   req.ShareID,
		FileName:  req.FileName,
		Author:    req.Author,
		Text:      req.Text,
		CreatedAt: time.Now(),
		ParentID:  req.ParentID,
	}

	app.mu.Lock()
	app.comments = append(app.comments, comment)
	app.mu.Unlock()

	// Save to database
	if err := app.SaveComment(&comment); err != nil {
		log.Printf("Failed to save comment to database: %v", err)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(comment)
}

func (app *App) handleGetCommentCount(w http.ResponseWriter, r *http.Request) {
	shareID := r.URL.Query().Get("share_id")
	fileName := r.URL.Query().Get("file_name")

	if shareID == "" || fileName == "" {
		http.Error(w, "share_id and file_name required", http.StatusBadRequest)
		return
	}

	app.mu.RLock()
	count := 0
	for _, comment := range app.comments {
		if comment.ShareID == shareID && comment.FileName == fileName {
			count++
		}
	}
	app.mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]int{"count": count})
}

func (app *App) handleGetComments(w http.ResponseWriter, r *http.Request) {
	shareID := r.URL.Query().Get("share_id")
	fileName := r.URL.Query().Get("file_name")

	if shareID == "" {
		http.Error(w, "share_id required", http.StatusBadRequest)
		return
	}

	app.mu.RLock()
	var filtered []Comment
	for _, comment := range app.comments {
		if comment.ShareID == shareID {
			if fileName == "" || comment.FileName == fileName {
				filtered = append(filtered, comment)
			}
		}
	}
	app.mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(filtered)
}

func (app *App) handleCreateSelection(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ShareID    string   `json:"share_id"`
		FileName   string   `json:"file_name"`
		UserName   string   `json:"user_name"`
		IsFavorite bool     `json:"is_favorite"`
		Tags       []string `json:"tags"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Validate share exists
	app.mu.RLock()
	_, exists := app.shares[req.ShareID]
	app.mu.RUnlock()

	if !exists {
		http.Error(w, "Share not found", http.StatusNotFound)
		return
	}

	// Check if selection already exists for this user+file
	app.mu.Lock()
	var existingSelection *PhotoSelection
	for i := range app.selections {
		if app.selections[i].ShareID == req.ShareID &&
			app.selections[i].FileName == req.FileName &&
			app.selections[i].UserName == req.UserName {
			existingSelection = &app.selections[i]
			break
		}
	}

	if existingSelection != nil {
		// Update existing
		existingSelection.IsFavorite = req.IsFavorite
		existingSelection.Tags = req.Tags
		existingSelection.Timestamp = time.Now()
		app.mu.Unlock()
		
		// Save to database
		if err := app.SaveSelection(existingSelection); err != nil {
			log.Printf("Failed to save selection to database: %v", err)
		}
		
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(existingSelection)
	} else {
		// Create new
		selection := PhotoSelection{
			ID:         generateRandomString(8),
			SessionID:  req.ShareID, // Use shareID as sessionID for MVP
			ShareID:    req.ShareID,
			FileName:   req.FileName,
			UserName:   req.UserName,
			IsFavorite: req.IsFavorite,
			Tags:       req.Tags,
			Timestamp:  time.Now(),
		}
		app.selections = append(app.selections, selection)
		app.mu.Unlock()
		
		// Save to database
		if err := app.SaveSelection(&selection); err != nil {
			log.Printf("Failed to save selection to database: %v", err)
		}
		
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(selection)
	}
}

func (app *App) handleGetSelectionCounts(w http.ResponseWriter, r *http.Request) {
	shareID := r.URL.Query().Get("share_id")

	if shareID == "" {
		http.Error(w, "share_id required", http.StatusBadRequest)
		return
	}

	app.mu.RLock()
	// Count favorites per file
	fileCounts := make(map[string]struct {
		Favorites int      `json:"favorites"`
		Users     []string `json:"users"`
	})

	for _, sel := range app.selections {
		if sel.ShareID == shareID && sel.IsFavorite {
			entry := fileCounts[sel.FileName]
			entry.Favorites++
			entry.Users = append(entry.Users, sel.UserName)
			fileCounts[sel.FileName] = entry
		}
	}
	app.mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(fileCounts)
}

func (app *App) handleGetSelections(w http.ResponseWriter, r *http.Request) {
	shareID := r.URL.Query().Get("share_id")

	if shareID == "" {
		http.Error(w, "share_id required", http.StatusBadRequest)
		return
	}

	app.mu.RLock()
	var filtered []PhotoSelection
	for _, selection := range app.selections {
		if selection.ShareID == shareID {
			filtered = append(filtered, selection)
		}
	}
	app.mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(filtered)
}

func (app *App) handleExportSelections(w http.ResponseWriter, r *http.Request) {
	shareID := r.URL.Query().Get("share_id")
	format := r.URL.Query().Get("format") // "csv" or "json"

	if shareID == "" {
		http.Error(w, "share_id required", http.StatusBadRequest)
		return
	}

	app.mu.RLock()
	var filtered []PhotoSelection
	for _, selection := range app.selections {
		if selection.ShareID == shareID {
			filtered = append(filtered, selection)
		}
	}
	app.mu.RUnlock()

	if format == "csv" {
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="selections-%s.csv"`, shareID))
		
		// Write CSV header
		fmt.Fprintln(w, "Filename,User,Favorite,Tags,Timestamp")
		
		// Write rows
		for _, sel := range filtered {
			favoriteStr := "No"
			if sel.IsFavorite {
				favoriteStr = "Yes"
			}
			tagsStr := strings.Join(sel.Tags, ";")
			fmt.Fprintf(w, "%s,%s,%s,\"%s\",%s\n",
				sel.FileName,
				sel.UserName,
				favoriteStr,
				tagsStr,
				sel.Timestamp.Format(time.RFC3339))
		}
	} else {
		// Default to JSON
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="selections-%s.json"`, shareID))
		json.NewEncoder(w).Encode(map[string]interface{}{
			"share_id":   shareID,
			"exported_at": time.Now().Format(time.RFC3339),
			"selections": filtered,
		})
	}
}

func (app *App) handleDashboard(w http.ResponseWriter, r *http.Request) {
	shareID := strings.TrimPrefix(r.URL.Path, "/dashboard/")

	app.mu.RLock()
	share, exists := app.shares[shareID]
	app.mu.RUnlock()

	if !exists {
		http.Error(w, "Share not found", http.StatusNotFound)
		return
	}

	// Get all selections for this share
	app.mu.RLock()
	var selections []PhotoSelection
	for _, sel := range app.selections {
		if sel.ShareID == shareID {
			selections = append(selections, sel)
		}
	}
	app.mu.RUnlock()

	// Group by user and get unique users
	userStats := make(map[string]struct {
		Favorites int
		Tagged    int
	})
	activeUsers := make(map[string]bool)

	for _, sel := range selections {
		stats := userStats[sel.UserName]
		if sel.IsFavorite {
			stats.Favorites++
		}
		if len(sel.Tags) > 0 {
			stats.Tagged++
		}
		userStats[sel.UserName] = stats
		activeUsers[sel.UserName] = true
	}
	
	// Convert to slice
	var activeUsersList []string
	for user := range activeUsers {
		activeUsersList = append(activeUsersList, user)
	}

	// Count files
	files, _ := os.ReadDir(share.FolderPath)
	totalFiles := 0
	for _, file := range files {
		if !file.IsDir() {
			totalFiles++
		}
	}

	tmpl := template.Must(template.New("dashboard").Funcs(template.FuncMap{
		"lower": strings.ToLower,
	}).Parse(dashboardTemplate))
	tmpl.Execute(w, map[string]interface{}{
		"ShareID":     shareID,
		"SessionName":  share.SessionName,
		"FolderPath":  share.FolderPath,
		"TotalFiles":  totalFiles,
		"Selections":  selections,
		"UserStats":   userStats,
		"ActiveUsers": activeUsersList,
		"AccessCount": share.AccessCount,
		"CreatedAt":   share.CreatedAt.Format("2006-01-02 15:04"),
	})
}

func (app *App) handleCheckCloudflared(w http.ResponseWriter, r *http.Request) {
	var paths []string
	var installCommand string
	
	if runtime.GOOS == "windows" {
		paths = []string{
			`C:\Program Files\cloudflared\cloudflared.exe`,
			`C:\Program Files (x86)\cloudflared\cloudflared.exe`,
		}
		installCommand = "Download from https://github.com/cloudflare/cloudflared/releases and run: cloudflared.exe service install"
	} else if runtime.GOOS == "darwin" {
		paths = []string{
			"/opt/homebrew/bin/cloudflared",
			"/usr/local/bin/cloudflared",
		}
		installCommand = "brew install cloudflare/cloudflare/cloudflared"
	} else {
		// Linux
		paths = []string{
			"/usr/local/bin/cloudflared",
			"/usr/bin/cloudflared",
		}
		installCommand = "wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared"
	}

	installed := false
	for _, path := range paths {
		if _, err := os.Stat(path); err == nil {
			installed = true
			break
		}
	}

	if !installed {
		// Check if it's in PATH
		if _, err := exec.LookPath("cloudflared"); err == nil {
			installed = true
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"installed":       installed,
		"install_command": installCommand,
		"platform":        runtime.GOOS,
	})
}

const dashboardTemplate = `<!DOCTYPE html>
<html>
<head>
    <title>Photographer Dashboard - ShareDrop</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; 
            background: #000; 
            min-height: 100vh;
            color: #fafafa;
            padding: 20px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { 
            background: #0a0a0a; 
            border: 1px solid #1a1a1a; 
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 24px;
        }
        h1 { font-size: 28px; font-weight: 600; margin-bottom: 8px; }
        .subtitle { color: #888; font-size: 14px; margin-bottom: 16px; }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
        }
        .stat-card {
            background: #0a0a0a;
            border: 1px solid #1a1a1a;
            border-radius: 12px;
            padding: 20px;
        }
        .stat-value { font-size: 32px; font-weight: 700; color: #fafafa; }
        .stat-label { font-size: 14px; color: #888; margin-top: 4px; }
        .section {
            background: #0a0a0a;
            border: 1px solid #1a1a1a;
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 24px;
        }
        h2 { font-size: 20px; margin-bottom: 16px; }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #1a1a1a;
        }
        th { color: #888; font-weight: 600; font-size: 12px; text-transform: uppercase; }
        td { color: #fafafa; }
        .tag { 
            display: inline-block;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11px;
            margin-right: 4px;
        }
        .tag-album { background: #1e3a8a; color: #fff; }
        .tag-print { background: #166534; color: #fff; }
        .tag-social { background: #7e22ce; color: #fff; }
        .tag-skip { background: #991b1b; color: #fff; }
        .btn {
            padding: 10px 20px;
            background: #fafafa;
            color: #000;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            margin-right: 8px;
        }
        .btn:hover { background: #e0e0e0; }
        .user-section {
            margin-bottom: 16px;
            padding-bottom: 16px;
            border-bottom: 1px solid #1a1a1a;
        }
        .user-section:last-child { border-bottom: none; }
        .user-name { font-weight: 600; color: #ffa500; margin-bottom: 8px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Photographer Dashboard</h1>
            <h2 style="color: #ffa500; margin-bottom: 8px;">{{.SessionName}}</h2>
            <div class="subtitle">{{.FolderPath}}</div>
            <div class="subtitle">Created: {{.CreatedAt}} | Access Count: {{.AccessCount}}</div>
            <a href="/share/{{.ShareID}}" class="btn">View Gallery</a>
            <a href="/api/selections/export?share_id={{.ShareID}}&format=csv" class="btn">Export CSV</a>
            <a href="/api/selections/export?share_id={{.ShareID}}&format=json" class="btn">Export JSON</a>
            <a href="/api/sessions/export/{{.ShareID}}" class="btn">Full Session Export</a>
        </div>
        
        <div class="section">
            <h2>Active Users ({{len .ActiveUsers}})</h2>
            {{if .ActiveUsers}}
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                {{range .ActiveUsers}}
                <span class="tag" style="background: #10b981; color: #fff; padding: 6px 12px; font-size: 13px;">{{.}}</span>
                {{end}}
            </div>
            {{else}}
            <p style="color: #888;">No users have reviewed photos yet.</p>
            {{end}}
        </div>
        
        <div class="section">
            <h2>Import Selections</h2>
            <p style="color: #888; margin-bottom: 16px;">Upload a CSV or JSON file to import selections</p>
            <form id="importForm" enctype="multipart/form-data">
                <input type="file" id="importFile" accept=".csv,.json" style="margin-bottom: 16px; color: #fafafa;" />
                <button type="submit" class="btn">Import File</button>
                <span id="importStatus" style="margin-left: 16px; color: #888;"></span>
            </form>
        </div>
        
        <script>
        document.getElementById('importForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const fileInput = document.getElementById('importFile');
            const status = document.getElementById('importStatus');
            
            if (!fileInput.files[0]) {
                status.textContent = 'Please select a file';
                status.style.color = '#ef4444';
                return;
            }
            
            const formData = new FormData();
            formData.append('file', fileInput.files[0]);
            
            status.textContent = 'Importing...';
            status.style.color = '#ffa500';
            
            try {
                const response = await fetch('/api/sessions/import/{{.ShareID}}', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    status.textContent = `✓ Imported ${result.imported || result.selections} items successfully!`;
                    status.style.color = '#10b981';
                    setTimeout(() => window.location.reload(), 2000);
                } else {
                    status.textContent = '✗ Import failed';
                    status.style.color = '#ef4444';
                }
            } catch (error) {
                status.textContent = '✗ Error: ' + error.message;
                status.style.color = '#ef4444';
            }
        });
        </script>

        <div class="stats">
            <div class="stat-card">
                <div class="stat-value">{{.TotalFiles}}</div>
                <div class="stat-label">Total Photos</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{{len .UserStats}}</div>
                <div class="stat-label">Reviewers</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{{len .Selections}}</div>
                <div class="stat-label">Total Selections</div>
            </div>
        </div>

        <div class="section">
            <h2>Reviewers Summary</h2>
            {{range $user, $stats := .UserStats}}
            <div class="user-section">
                <div class="user-name">{{$user}}</div>
                <div>Favorites: {{$stats.Favorites}} | Tagged: {{$stats.Tagged}}</div>
            </div>
            {{end}}
        </div>

        <div class="section">
            <h2>All Selections</h2>
            <table>
                <thead>
                    <tr>
                        <th>User</th>
                        <th>File</th>
                        <th>Favorite</th>
                        <th>Tags</th>
                        <th>Timestamp</th>
                    </tr>
                </thead>
                <tbody>
                    {{range .Selections}}
                    <tr>
                        <td>{{.UserName}}</td>
                        <td>{{.FileName}}</td>
                        <td>{{if .IsFavorite}}&#9733;{{else}}&#9734;{{end}}</td>
                        <td>
                            {{range .Tags}}
                            <span class="tag tag-{{. | lower}}">{{.}}</span>
                            {{end}}
                        </td>
                        <td>{{.Timestamp.Format "2006-01-02 15:04"}}</td>
                    </tr>
                    {{end}}
                </tbody>
            </table>
        </div>
    </div>
</body>
</html>`

const passwordTemplate = `<!DOCTYPE html>
<html>
<head>
    <title>ShareDrop</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; 
            background: #000; 
            min-height: 100vh; 
            display: flex; 
            align-items: center; 
            justify-content: center;
            color: #fafafa;
        }
        .container { max-width: 400px; width: 100%; padding: 20px; }
        .card { background: #0a0a0a; border: 1px solid #1a1a1a; border-radius: 12px; padding: 32px; }
        h1 { font-size: 28px; font-weight: 600; color: #fafafa; margin-bottom: 8px; text-align: center; }
        .subtitle { text-align: center; color: #888; font-size: 14px; margin-bottom: 24px; }
        input[type="password"] { 
            width: 100%; 
            padding: 12px; 
            background: #000; 
            border: 1px solid #333; 
            border-radius: 8px; 
            font-size: 14px; 
            margin-bottom: 16px;
            color: #fafafa;
        }
        input[type="password"]:focus { outline: none; border-color: #555; }
        button { 
            width: 100%; 
            padding: 12px 24px; 
            background: #fafafa; 
            color: #000; 
            border: none; 
            border-radius: 8px; 
            font-size: 14px; 
            font-weight: 600; 
            cursor: pointer;
            transition: all 0.2s;
        }
        button:hover { background: #e0e0e0; }
        .error { color: #ff4444; margin-top: 12px; font-size: 14px; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <h1>ShareDrop</h1>
            <div class="subtitle">Enter password to access files</div>
            <form method="POST">
                <input type="password" name="password" placeholder="Password" required autofocus>
                <button type="submit">Access Files</button>
            </form>
        </div>
    </div>
</body>
</html>`

const browseTemplate = `<!DOCTYPE html>
<html>
<head>
    <title>ShareDrop</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; 
            background: #000; 
            min-height: 100vh;
            color: #fafafa;
            padding: 20px;
        }
        .header { 
            max-width: 1200px; 
            margin: 0 auto 24px; 
            padding: 24px;
            background: #0a0a0a; 
            border: 1px solid #1a1a1a; 
            border-radius: 12px;
        }
        h1 { font-size: 28px; font-weight: 600; margin-bottom: 8px; }
        .subtitle { color: #888; font-size: 14px; }
        .controls { 
            max-width: 1200px; 
            margin: 0 auto 16px; 
            display: flex; 
            gap: 12px;
            align-items: center;
            flex-wrap: wrap;
        }
        .search-box {
            flex: 1;
            min-width: 200px;
            padding: 10px 16px;
            background: #0a0a0a;
            border: 1px solid #333;
            border-radius: 8px;
            color: #fafafa;
            font-size: 14px;
        }
        .search-box:focus { outline: none; border-color: #555; }
        .filter-select {
            padding: 10px 16px;
            background: #0a0a0a;
            border: 1px solid #333;
            border-radius: 8px;
            color: #fafafa;
            font-size: 14px;
            cursor: pointer;
        }
        .filter-select:focus { outline: none; border-color: #555; }
        .btn { 
            padding: 10px 20px; 
            background: #fafafa; 
            color: #000; 
            border: none; 
            border-radius: 8px; 
            font-size: 14px; 
            font-weight: 600; 
            cursor: pointer;
            transition: all 0.2s;
        }
        .btn:hover { background: #e0e0e0; }
        .btn:disabled { background: #333; color: #666; cursor: not-allowed; }
        .select-all { margin-left: auto; }
        .view-toggle { display: flex; gap: 8px; }
        .view-toggle button { padding: 8px 16px; font-size: 13px; }
        .view-toggle button.active { background: #e0e0e0; }
        
        .file-list { 
            max-width: 1200px; 
            margin: 0 auto; 
            background: #0a0a0a; 
            border: 1px solid #1a1a1a; 
            border-radius: 12px;
            overflow: hidden;
        }
        .file-item { 
            display: flex; 
            align-items: center; 
            padding: 16px 20px; 
            border-bottom: 1px solid #1a1a1a; 
            transition: background 0.2s;
        }
        .file-item:hover { background: #111; }
        .file-item:last-child { border-bottom: none; }
        .checkbox { 
            width: 20px; 
            height: 20px; 
            cursor: pointer;
            margin-right: 16px;
        }
        .file-info { flex: 1; display: flex; align-items: center; gap: 16px; }
        .file-name { font-size: 14px; font-weight: 500; }
        .file-size { font-size: 12px; color: #888; }
        .file-details { flex: 1; }
        .thumbnail { 
            width: 60px; 
            height: 60px; 
            object-fit: cover; 
            border-radius: 6px; 
            background: #1a1a1a;
            cursor: pointer;
        }
        .action-btns { display: flex; gap: 8px; }
        .action-btn { 
            padding: 8px 16px; 
            background: #fafafa; 
            color: #000; 
            border: none; 
            border-radius: 6px; 
            font-size: 13px; 
            font-weight: 600; 
            cursor: pointer;
            transition: all 0.2s;
            text-decoration: none;
        }
        .action-btn:hover { background: #e0e0e0; }
        .action-btn.secondary { background: #333; color: #fafafa; }
        .action-btn.secondary:hover { background: #444; }

        /* Grid view */
        .grid-view { 
            max-width: 1200px; 
            margin: 0 auto;
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 16px;
        }
        .grid-item { 
            background: #0a0a0a; 
            border: 1px solid #1a1a1a; 
            border-radius: 12px;
            overflow: hidden;
            transition: all 0.2s;
            position: relative;
        }
        .grid-item:hover { border-color: #333; transform: translateY(-2px); }
        .grid-thumbnail { 
            width: 100%; 
            height: 200px; 
            object-fit: contain; 
            background: #1a1a1a;
            cursor: pointer;
        }
        .grid-info { padding: 12px; }
        .grid-name { font-size: 13px; font-weight: 500; margin-bottom: 4px; word-break: break-word; }
        .grid-size { font-size: 11px; color: #888; }
        .grid-checkbox { position: absolute; top: 10px; left: 10px; width: 24px; height: 24px; }
        .grid-actions { padding: 0 12px 12px; display: flex; gap: 8px; }
        .grid-actions button { flex: 1; padding: 6px; font-size: 12px; }

        /* Modal */
        .modal { 
            display: none; 
            position: fixed; 
            top: 0; 
            left: 0; 
            width: 100%; 
            height: 100%; 
            background: rgba(0,0,0,0.95);
            z-index: 1000;
            align-items: center;
            justify-content: center;
        }
        .modal.show { display: flex; }
        .modal-content { 
            max-width: 90%; 
            max-height: 90%; 
            position: relative;
        }
        .modal-content img { 
            max-width: 100%; 
            max-height: 90vh; 
            object-fit: contain;
        }
        .modal-content video { 
            max-width: 100%; 
            max-height: 90vh;
        }
        .modal-close { 
            position: absolute; 
            top: -40px; 
            right: 0; 
            background: none; 
            border: none; 
            color: #fafafa; 
            font-size: 32px; 
            cursor: pointer;
            padding: 0 10px;
        }
        .modal-nav { 
            position: absolute; 
            top: 50%; 
            transform: translateY(-50%);
            background: rgba(0,0,0,0.7);
            border: none; 
            color: #fafafa; 
            font-size: 48px; 
            cursor: pointer;
            padding: 20px 15px;
            transition: all 0.2s;
            user-select: none;
            border-radius: 4px;
        }
        .modal-nav:hover { background: rgba(0,0,0,0.9); }
        .modal-nav:disabled { opacity: 0.3; cursor: not-allowed; }
        .modal-nav.prev { left: 20px; }
        .modal-nav.next { right: 20px; }
        .modal-filename { 
            color: #fafafa; 
            text-align: center; 
            margin-top: 20px; 
            font-size: 16px;
        }
        .modal-counter {
            position: absolute;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.7);
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            color: #fafafa;
        }
        .hidden { display: none !important; }
        
        /* Phase 3 Styles */
        .selection-bar {
            max-width: 1200px;
            margin: 0 auto 16px;
            padding: 12px 20px;
            background: #0a0a0a;
            border: 1px solid #1a1a1a;
            border-radius: 8px;
            display: flex;
            align-items: center;
            gap: 16px;
        }
        .selection-count {
            font-size: 14px;
            color: #fafafa;
        }
        .save-indicator {
            font-size: 12px;
            color: #888;
            margin-left: auto;
        }
        .save-indicator.saving { color: #ffa500; }
        .save-indicator.saved { color: #22c55e; }
        .fav-count {
            font-size: 12px;
            color: #ffa500;
            margin-top: 4px;
            cursor: help;
        }
        .star-btn {
            background: none;
            border: none;
            color: #888;
            font-size: 18px;
            cursor: pointer;
            padding: 4px 8px;
            transition: all 0.2s;
        }
        .star-btn:hover { color: #ffa500; }
        .star-btn.active { color: #ffa500; }
        .tag-pills {
            display: flex;
            gap: 4px;
            flex-wrap: wrap;
            margin-top: 4px;
        }
        .tag-pill {
            padding: 2px 8px;
            background: #333;
            border: 1px solid #444;
            border-radius: 12px;
            font-size: 11px;
            color: #ccc;
            cursor: pointer;
            transition: all 0.2s;
        }
        .tag-pill:hover { background: #444; }
        .tag-pill.active { background: #555; border-color: #777; color: #fff; font-weight: 600; }
        .tag-pill[data-tag="Album"].active { background: #1e3a8a; border-color: #3b82f6; color: #fff; }
        .tag-pill[data-tag="Print"].active { background: #166534; border-color: #22c55e; color: #fff; }
        .tag-pill[data-tag="Social"].active { background: #7e22ce; border-color: #a855f7; color: #fff; }
        .tag-pill[data-tag="Skip"].active { background: #991b1b; border-color: #ef4444; color: #fff; }
    </style>
</head>
<body>
    <div class="header">
        <h1>ShareDrop</h1>
        <div class="subtitle">Select files to download</div>
    </div>
    
    <!-- User Modal -->
    <div class="modal" id="userModal" style="display: flex;">
        <div class="modal-content" style="background: #0a0a0a; padding: 32px; border-radius: 12px; max-width: 400px;">
            <h2 style="margin-bottom: 16px; font-size: 24px; text-align: center;">Welcome</h2>
            <p style="color: #888; margin-bottom: 24px; text-align: center; font-size: 14px;">Enter your name to get started</p>
            <input type="text" id="userName" placeholder="Your name" style="width: 100%; padding: 12px; background: #000; border: 1px solid #333; border-radius: 8px; color: #fafafa; font-size: 14px; margin-bottom: 16px;">
            <button onclick="saveUserName()" style="width: 100%; padding: 12px 24px; background: #fafafa; color: #000; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">Continue</button>
        </div>
    </div>
    
    <!-- Selection Summary Bar -->
    <div class="selection-bar" id="selectionBar" style="display: none;">
        <div class="selection-count" id="selectionCount">0 favorites</div>
        <div class="save-indicator" id="saveIndicator">All changes saved</div>
        <button class="btn" onclick="exportSelections('csv')">Export CSV</button>
        <button class="btn" onclick="exportSelections('json')">Export JSON</button>
    </div>
    <div class="controls"> 
        <input type="text" id="searchBox" class="search-box" placeholder="Search files..." oninput="filterFiles()">
        <select id="fileTypeFilter" class="filter-select" onchange="filterFiles()">
            <option value="all">All Files</option>
            <option value="images">Images</option>
            <option value="videos">Videos</option>
            <option value="documents">Documents</option>
        </select>
        <select id="sortSelect" class="filter-select" onchange="sortFiles()">
            <option value="name-asc">Name (A-Z)</option>
            <option value="name-desc">Name (Z-A)</option>
            <option value="size-asc">Size (Smallest)</option>
            <option value="size-desc">Size (Largest)</option>
        </select>
        <button class="btn" onclick="downloadSelected()" id="downloadBtn" disabled>Download Selected</button>
        <div class="view-toggle">
            <button class="btn active" id="listViewBtn" onclick="switchView('list')">List</button>
            <button class="btn" id="gridViewBtn" onclick="switchView('grid')">Grid</button>
        </div>
        <button class="btn select-all" onclick="toggleSelectAll()">Select All</button>
    </div>
    </div>

    <div class="file-list" id="listView">
        {{range .Files}}
        <div class="file-item" data-filename="{{.Name}}" data-size="{{.Size}}" data-is-image="{{.IsImage}}" data-is-video="{{.IsVideo}}">
            <input type="checkbox" class="checkbox" data-filename="{{.Name}}" onchange="updateDownloadBtn()">
            <div class="file-info">
                {{if or .IsImage .IsVideo}}
                <img class="thumbnail" data-filename="{{.Name}}" data-is-video="{{.IsVideo}}" alt="{{.Name}}" loading="lazy" onerror="this.style.display='none'">
                {{end}}
                <div class="file-details">
                    <div class="file-name">{{.Name}}</div>
                    <div class="file-size">{{formatSize .Size}}</div>
                    <div class="tag-pills">
                        <span class="tag-pill" data-filename="{{.Name}}" data-tag="Album" onclick="toggleTag(this)">Album</span>
                        <span class="tag-pill" data-filename="{{.Name}}" data-tag="Print" onclick="toggleTag(this)">Print</span>
                        <span class="tag-pill" data-filename="{{.Name}}" data-tag="Social" onclick="toggleTag(this)">Social</span>
                        <span class="tag-pill" data-filename="{{.Name}}" data-tag="Skip" onclick="toggleTag(this)">Skip</span>
                    </div>
                </div>
            </div>
            <div class="action-btns">
                <button class="star-btn" data-filename="{{.Name}}" onclick="toggleFavorite(this)" title="Favorite">&#9734;</button>
                {{if or .IsImage .IsVideo}}
                <button class="action-btn secondary" data-filename="{{.Name}}" data-is-video="{{.IsVideo}}" onclick="openPreviewFromButton(this)">Preview</button>
                {{end}}
                <button class="action-btn secondary" data-filename="{{.Name}}" onclick="openComments(this)">Comments</button>
                <button class="action-btn" data-filename="{{.Name}}" onclick="downloadFileFromButton(this)">Download</button>
            </div>
        </div>
        {{end}}
    </div>

    <div class="grid-view hidden" id="gridView">
        {{range .Files}}
        <div class="grid-item" data-filename="{{.Name}}" data-size="{{.Size}}" data-is-image="{{.IsImage}}" data-is-video="{{.IsVideo}}">
            <input type="checkbox" class="grid-checkbox checkbox" data-filename="{{.Name}}" onchange="updateDownloadBtn()">
            {{if or .IsImage .IsVideo}}
            <img class="grid-thumbnail" data-filename="{{.Name}}" data-is-video="{{.IsVideo}}" alt="{{.Name}}" loading="lazy" onerror="this.style.display='none'">
            {{else}}
            <div class="grid-thumbnail" style="display: flex; align-items: center; justify-content: center; font-size: 48px; color: #666;">&#128196;</div>
            {{end}}
            <div class="grid-info">
                <div class="grid-name">{{.Name}}</div>
                <div class="grid-size">{{formatSize .Size}}</div>
                <div class="tag-pills">
                    <span class="tag-pill" data-filename="{{.Name}}" data-tag="Album" onclick="toggleTag(this)">Album</span>
                    <span class="tag-pill" data-filename="{{.Name}}" data-tag="Print" onclick="toggleTag(this)">Print</span>
                    <span class="tag-pill" data-filename="{{.Name}}" data-tag="Social" onclick="toggleTag(this)">Social</span>
                    <span class="tag-pill" data-filename="{{.Name}}" data-tag="Skip" onclick="toggleTag(this)">Skip</span>
                </div>
            </div>
            <div class="grid-actions">
                <button class="star-btn" data-filename="{{.Name}}" onclick="toggleFavorite(this)" title="Favorite" style="flex: none;">&#9734;</button>
                {{if or .IsImage .IsVideo}}
                <button class="action-btn secondary" data-filename="{{.Name}}" data-is-video="{{.IsVideo}}" onclick="openPreviewFromButton(this)">Preview</button>
                {{end}}
                <button class="action-btn secondary" data-filename="{{.Name}}" onclick="openComments(this)">Comments</button>
                <button class="action-btn" data-filename="{{.Name}}" onclick="downloadFileFromButton(this)">Download</button>
            </div>
        </div>
        {{end}}
    </div>

    <div class="modal" id="previewModal" onclick="closeModalOnBackdrop(event)">
        <div class="modal-content">
            <button class="modal-close" onclick="closeModal(event)">×</button>
            <div class="modal-counter" id="modalCounter"></div>
            <button class="modal-nav prev" id="prevBtn" onclick="navigatePreview(-1)">‹</button>
            <button class="modal-nav next" id="nextBtn" onclick="navigatePreview(1)">›</button>
            <img id="previewImage" class="hidden" />
            <video id="previewVideo" class="hidden" controls></video>
            <div class="modal-filename" id="modalFilename"></div>
        </div>
    </div>

    <div class="modal" id="commentsModal" onclick="closeCommentsModalOnBackdrop(event)">
        <div class="modal-content" style="background: #0a0a0a; padding: 24px; border-radius: 12px; max-width: 600px; max-height: 80vh; overflow-y: auto;">
            <button class="modal-close" onclick="closeCommentsModal(event)">×</button>
            <h2 style="margin-bottom: 16px; font-size: 20px;">Comments</h2>
            <div id="commentsFilename" style="color: #888; margin-bottom: 20px; font-size: 14px;"></div>
            <div id="commentsList" style="margin-bottom: 20px;"></div>
            <div style="border-top: 1px solid #333; padding-top: 16px;">
                <input type="text" id="commentAuthor" placeholder="Your name" style="width: 100%; padding: 10px; background: #000; border: 1px solid #333; border-radius: 6px; color: #fafafa; font-size: 14px; margin-bottom: 8px;">
                <textarea id="commentText" placeholder="Add a comment..." style="width: 100%; padding: 10px; background: #000; border: 1px solid #333; border-radius: 6px; color: #fafafa; font-size: 14px; margin-bottom: 8px; resize: vertical; min-height: 80px;"></textarea>
                <button onclick="postComment()" style="padding: 10px 20px; background: #fafafa; color: #000; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer;">Post Comment</button>
            </div>
        </div>
    </div>

    <script>
        const shareID = '{{.ShareID}}';
        let currentView = 'list';
        let mediaFiles = []; // Array of all media files
        let currentMediaIndex = 0; // Current file being viewed
        let currentCommentFile = ''; // Current file for comments
        let allFiles = []; // Store all file elements for filtering/sorting
        
        function updateDownloadBtn() {
            const checked = document.querySelectorAll('.checkbox:checked').length;
            const btn = document.getElementById('downloadBtn');
            btn.disabled = checked === 0;
            btn.textContent = checked > 0 ? 'Download Selected (' + checked + ')' : 'Download Selected';
        }
        
        function toggleSelectAll() {
            const checkboxes = document.querySelectorAll('.checkbox:checked');
            const allCheckboxes = document.querySelectorAll('.checkbox');
            const allChecked = checkboxes.length === allCheckboxes.length;
            allCheckboxes.forEach(cb => cb.checked = !allChecked);
            updateDownloadBtn();
        }
        
        function downloadFile(filename) {
            window.location.href = '/download/' + shareID + '/' + encodeURIComponent(filename);
        }
        
        function downloadSelected() {
            const selected = Array.from(document.querySelectorAll('.checkbox:checked'))
                .map(cb => cb.getAttribute('data-filename'));
            selected.forEach((filename, index) => {
                setTimeout(() => downloadFile(filename), index * 100);
            });
        }

        function switchView(view) {
            currentView = view;
            const listView = document.getElementById('listView');
            const gridView = document.getElementById('gridView');
            const listBtn = document.getElementById('listViewBtn');
            const gridBtn = document.getElementById('gridViewBtn');

            if (view === 'list') {
                listView.classList.remove('hidden');
                gridView.classList.add('hidden');
                listBtn.classList.add('active');
                gridBtn.classList.remove('active');
            } else {
                listView.classList.add('hidden');
                gridView.classList.remove('hidden');
                listBtn.classList.remove('active');
                gridBtn.classList.add('active');
            }
        }

        function openPreview(filename, isVideo) {
            // Find the index of this file in mediaFiles array
            currentMediaIndex = mediaFiles.findIndex(f => f.name === filename);
            if (currentMediaIndex === -1) currentMediaIndex = 0;
            
            showPreviewAtIndex(currentMediaIndex);
        }
        
        function showPreviewAtIndex(index) {
            if (index < 0 || index >= mediaFiles.length) return;
            
            currentMediaIndex = index;
            const file = mediaFiles[index];
            
            const modal = document.getElementById('previewModal');
            const img = document.getElementById('previewImage');
            const video = document.getElementById('previewVideo');
            const filenameEl = document.getElementById('modalFilename');
            const counter = document.getElementById('modalCounter');
            const prevBtn = document.getElementById('prevBtn');
            const nextBtn = document.getElementById('nextBtn');

            filenameEl.textContent = file.name;
            counter.textContent = (index + 1) + ' / ' + mediaFiles.length;
            
            // Update navigation buttons
            prevBtn.disabled = index === 0;
            nextBtn.disabled = index === mediaFiles.length - 1;

            if (file.isVideo) {
                img.classList.add('hidden');
                video.classList.remove('hidden');
                video.src = '/preview/' + shareID + '/' + encodeURIComponent(file.name);
                video.load();
            } else {
                video.classList.add('hidden');
                img.classList.remove('hidden');
                img.src = '/preview/' + shareID + '/' + encodeURIComponent(file.name);
            }

            modal.classList.add('show');
        }
        
        function navigatePreview(direction) {
            const newIndex = currentMediaIndex + direction;
            if (newIndex >= 0 && newIndex < mediaFiles.length) {
                showPreviewAtIndex(newIndex);
            }
        }

        function closeModalOnBackdrop(event) {
            if (event.target.id === 'previewModal') {
                closeModal(event);
            }
        }
        
        function closeModal(event) {
            const modal = document.getElementById('previewModal');
            const video = document.getElementById('previewVideo');
            video.pause();
            video.src = '';
            modal.classList.remove('show');
        }

        document.addEventListener('keydown', (e) => {
            const modal = document.getElementById('previewModal');
            if (modal.classList.contains('show')) {
                if (e.key === 'Escape') {
                    closeModal({target: modal});
                } else if (e.key === 'ArrowLeft') {
                    navigatePreview(-1);
                } else if (e.key === 'ArrowRight') {
                    navigatePreview(1);
                }
            }
        });
        
        // Helper functions for buttons with data attributes
        function openPreviewFromButton(button) {
            const filename = button.getAttribute('data-filename');
            const isVideo = button.getAttribute('data-is-video') === 'true';
            openPreview(filename, isVideo);
        }
        
        function downloadFileFromButton(button) {
            const filename = button.getAttribute('data-filename');
            downloadFile(filename);
        }
        
        // Search and filter files
        function filterFiles() {
            const searchTerm = document.getElementById('searchBox').value.toLowerCase();
            const fileType = document.getElementById('fileTypeFilter').value;
            
            const items = document.querySelectorAll('.file-item, .grid-item');
            items.forEach(item => {
                const filename = item.getAttribute('data-filename').toLowerCase();
                const isImage = item.getAttribute('data-is-image') === 'true';
                const isVideo = item.getAttribute('data-is-video') === 'true';
                
                let matchesSearch = filename.includes(searchTerm);
                let matchesType = true;
                
                if (fileType === 'images') {
                    matchesType = isImage;
                } else if (fileType === 'videos') {
                    matchesType = isVideo;
                } else if (fileType === 'documents') {
                    matchesType = !isImage && !isVideo;
                }
                
                if (matchesSearch && matchesType) {
                    item.style.display = '';
                } else {
                    item.style.display = 'none';
                }
            });
        }

        // Sort files
        function sortFiles() {
            const sortBy = document.getElementById('sortSelect').value;
            const listView = document.getElementById('listView');
            const gridView = document.getElementById('gridView');
            
            const sortItems = (container) => {
                const items = Array.from(container.children);
                items.sort((a, b) => {
                    const nameA = a.getAttribute('data-filename').toLowerCase();
                    const nameB = b.getAttribute('data-filename').toLowerCase();
                    const sizeA = parseInt(a.getAttribute('data-size')) || 0;
                    const sizeB = parseInt(b.getAttribute('data-size')) || 0;
                    
                    switch(sortBy) {
                        case 'name-asc':
                            return nameA.localeCompare(nameB);
                        case 'name-desc':
                            return nameB.localeCompare(nameA);
                        case 'size-asc':
                            return sizeA - sizeB;
                        case 'size-desc':
                            return sizeB - sizeA;
                        default:
                            return 0;
                    }
                });
                
                items.forEach(item => container.appendChild(item));
            };
            
            sortItems(listView);
            sortItems(gridView);
        }

        // Comments functionality
        function openComments(button) {
            const filename = button.getAttribute('data-filename');
            currentCommentFile = filename;
            document.getElementById('commentsFilename').textContent = 'File: ' + filename;
            loadComments(filename);
            document.getElementById('commentsModal').classList.add('show');
        }

        function closeCommentsModalOnBackdrop(event) {
            if (event.target.id === 'commentsModal') {
                closeCommentsModal(event);
            }
        }

        function closeCommentsModal(event) {
            document.getElementById('commentsModal').classList.remove('show');
        }

        function loadComments(filename) {
            fetch('/api/comments/get?share_id=' + shareID + '&file_name=' + encodeURIComponent(filename))
                .then(res => res.json())
                .then(comments => {
                    const list = document.getElementById('commentsList');
                    if (comments && comments.length > 0) {
                        list.innerHTML = comments.map(c => '<div style="background: #111; padding: 12px; border-radius: 8px; margin-bottom: 12px;">' +
                            '<div style="font-weight: 600; margin-bottom: 4px;">' + escapeHtml(c.author) + '</div>' +
                            '<div style="color: #ccc; font-size: 14px; margin-bottom: 4px;">' + escapeHtml(c.text) + '</div>' +
                            '<div style="color: #666; font-size: 12px;">' + new Date(c.created_at).toLocaleString() + '</div>' +
                            '</div>').join('');
                    } else {
                        list.innerHTML = '<div style="color: #666; text-align: center; padding: 20px;">No comments yet</div>';
                    }
                })
                .catch(err => console.error('Failed to load comments:', err));
        }

        function postComment() {
            const author = document.getElementById('commentAuthor').value.trim();
            const text = document.getElementById('commentText').value.trim();
            
            if (!author || !text) {
                alert('Please enter your name and comment');
                return;
            }
            
            fetch('/api/comments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    share_id: shareID,
                    file_name: currentCommentFile,
                    author: author,
                    text: text
                })
            })
            .then(res => res.json())
            .then(() => {
                document.getElementById('commentText').value = '';
                loadComments(currentCommentFile);
                loadCommentCount(currentCommentFile); // Update count
            })
            .catch(err => alert('Failed to post comment: ' + err));
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Phase 3.1 - User and Selection Functions
        let userName = sessionStorage.getItem('userName');
        let userSelections = JSON.parse(localStorage.getItem('selections_' + shareID) || '{}');
        
        function saveUserName() {
            const input = document.getElementById('userName').value.trim();
            if (!input) {
                alert('Please enter your name');
                return;
            }
            
            // Validate name with server
            fetch('/api/sessions/validate-name', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    share_id: shareID,
                    user_name: input
                })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    userName = input;
                    sessionStorage.setItem('userName', userName);
                    document.getElementById('userModal').style.display = 'none';
                    loadUserSelections();
                    loadCounts(); // Load comment/favorite counts
                } else {
                    alert(data.error);
                }
            })
            .catch(err => {
                console.error('Name validation failed:', err);
                alert('Failed to validate name. Please try again.');
            });
        }
        
        function loadUserSelections() {
            fetch('/api/selections/get?share_id=' + shareID)
                .then(res => res.json())
                .then(selections => {
                    selections.forEach(sel => {
                        if (sel.user_name === userName) {
                            // Apply favorites
                            if (sel.is_favorite) {
                                const starBtns = document.querySelectorAll('.star-btn[data-filename="' + sel.file_name + '"]');
                                starBtns.forEach(btn => {
                                    btn.innerHTML = '&#9733;';
                                    btn.classList.add('active');
                                });
                            }
                            // Apply tags
                            if (sel.tags && sel.tags.length > 0) {
                                sel.tags.forEach(tag => {
                                    const tagPills = document.querySelectorAll('.tag-pill[data-filename="' + sel.file_name + '"][data-tag="' + tag + '"]');
                                    tagPills.forEach(pill => pill.classList.add('active'));
                                });
                            }
                            // Store in local object
                            userSelections[sel.file_name] = sel;
                        }
                    });
                    updateSelectionCount();
                })
                .catch(err => console.error('Failed to load selections:', err));
        }
        
        function toggleFavorite(button) {
            if (!userName) {
                alert('Please enter your name first');
                return;
            }
            const filename = button.getAttribute('data-filename');
            const isFavorite = !button.classList.contains('active');
            
            // Update UI
            const allStars = document.querySelectorAll('.star-btn[data-filename="' + filename + '"]');
            allStars.forEach(btn => {
                if (isFavorite) {
                    btn.innerHTML = '&#9733;';
                    btn.classList.add('active');
                } else {
                    btn.innerHTML = '&#9734;';
                    btn.classList.remove('active');
                }
            });
            
            // Get current tags
            const activeTags = Array.from(document.querySelectorAll('.tag-pill.active[data-filename="' + filename + '"]'))
                .map(pill => pill.getAttribute('data-tag'));
            
            // Save to server
            saveSelection(filename, isFavorite, activeTags);
        }
        
        function toggleTag(pill) {
            if (!userName) {
                alert('Please enter your name first');
                return;
            }
            const filename = pill.getAttribute('data-filename');
            const tag = pill.getAttribute('data-tag');
            
            // Update UI
            const allPills = document.querySelectorAll('.tag-pill[data-filename="' + filename + '"][data-tag="' + tag + '"]');
            allPills.forEach(p => p.classList.toggle('active'));
            
            // Get current state
            const isFavorite = document.querySelector('.star-btn[data-filename="' + filename + '"]').classList.contains('active');
            const activeTags = Array.from(document.querySelectorAll('.tag-pill.active[data-filename="' + filename + '"]'))
                .map(p => p.getAttribute('data-tag'));
            
            // Save to server
            saveSelection(filename, isFavorite, activeTags);
        }
        
        function saveSelection(filename, isFavorite, tags) {
            const indicator = document.getElementById('saveIndicator');
            if (indicator) {
                indicator.textContent = 'Saving...';
                indicator.className = 'save-indicator saving';
            }
            
            fetch('/api/selections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    share_id: shareID,
                    file_name: filename,
                    user_name: userName,
                    is_favorite: isFavorite,
                    tags: tags
                })
            })
            .then(res => res.json())
            .then(selection => {
                userSelections[filename] = selection;
                localStorage.setItem('selections_' + shareID, JSON.stringify(userSelections));
                updateSelectionCount();
                loadCounts(); // Refresh counts after save
                
                if (indicator) {
                    indicator.textContent = 'All changes saved';
                    indicator.className = 'save-indicator saved';
                    setTimeout(() => {
                        indicator.className = 'save-indicator';
                    }, 2000);
                }
            })
            .catch(err => {
                console.error('Failed to save selection:', err);
                if (indicator) {
                    indicator.textContent = 'Save failed';
                    indicator.className = 'save-indicator';
                }
            });
        }
        
        function updateSelectionCount() {
            const favoriteCount = Object.values(userSelections).filter(s => s.is_favorite).length;
            const selectionBar = document.getElementById('selectionBar');
            const selectionCount = document.getElementById('selectionCount');
            
            if (favoriteCount > 0) {
                selectionBar.style.display = 'flex';
                selectionCount.textContent = favoriteCount + ' favorite' + (favoriteCount !== 1 ? 's' : '');
            } else {
                selectionBar.style.display = 'none';
            }
        }
        
        function exportSelections(format) {
            window.location.href = '/api/selections/export?share_id=' + shareID + '&format=' + format;
        }
        
        // Load comment and favorite counts
        let fileCounts = {};
        
        function loadCounts() {
            // Load favorite counts
            fetch('/api/selections/counts?share_id=' + shareID)
                .then(res => res.json())
                .then(counts => {
                    fileCounts = counts;
                    updateCountDisplays();
                })
                .catch(err => console.error('Failed to load counts:', err));
        }
        
        function updateCountDisplays() {
            // Update favorite counts
            document.querySelectorAll('.file-item, .grid-item').forEach(item => {
                const filename = item.getAttribute('data-filename');
                const counts = fileCounts[filename];
                
                // Update favorite count
                let favCountEl = item.querySelector('.fav-count');
                if (counts && counts.favorites > 0) {
                    if (!favCountEl) {
                        favCountEl = document.createElement('div');
                        favCountEl.className = 'fav-count';
                        const detailsEl = item.querySelector('.file-details, .grid-info');
                        if (detailsEl) {
                            detailsEl.appendChild(favCountEl);
                        }
                    }
                    favCountEl.textContent = '★ ' + counts.favorites + ' favorite' + (counts.favorites !== 1 ? 's' : '');
                    favCountEl.title = 'Favorited by: ' + counts.users.join(', ');
                } else if (favCountEl) {
                    favCountEl.remove();
                }
                
                // Update comment count on button
                loadCommentCount(filename);
            });
        }
        
        function loadCommentCount(filename) {
            fetch('/api/comments/count?share_id=' + shareID + '&file_name=' + encodeURIComponent(filename))
                .then(res => res.json())
                .then(data => {
                    const commentBtns = document.querySelectorAll('.action-btn.secondary[data-filename="' + filename + '"]');
                    commentBtns.forEach(btn => {
                        if (btn.textContent.includes('Comments')) {
                            if (data.count > 0) {
                                btn.textContent = 'Comments (' + data.count + ')';
                            } else {
                                btn.textContent = 'Comments';
                            }
                        }
                    });
                })
                .catch(err => console.error('Failed to load comment count:', err));
        }

        // Real-time polling for count updates
        setInterval(() => {
            if (userName && document.visibilityState === 'visible') {
                loadCounts();
            }
        }, 5000); // Poll every 5 seconds

        // Load thumbnails dynamically with proper URL encoding
        document.addEventListener('DOMContentLoaded', () => {
            // Check for username
            if (userName) {
                document.getElementById('userModal').style.display = 'none';
                loadUserSelections();
                loadCounts();
            }
            
            // Build array of all media files for navigation
            document.querySelectorAll('.file-item, .grid-item').forEach(item => {
                const filename = item.getAttribute('data-filename');
                const hasMedia = item.querySelector('img.thumbnail, img.grid-thumbnail');
                if (hasMedia) {
                    const isVideo = hasMedia.getAttribute('data-is-video') === 'true';
                    mediaFiles.push({ name: filename, isVideo: isVideo });
                }
            });
            
            // Load thumbnails for all images
            document.querySelectorAll('img.thumbnail, img.grid-thumbnail').forEach(img => {
                const filename = img.getAttribute('data-filename');
                const isVideo = img.getAttribute('data-is-video') === 'true';
                if (filename) {
                    img.src = '/thumbnail/' + shareID + '/' + encodeURIComponent(filename);
                    // Make thumbnail clickable
                    img.onclick = function() {
                        openPreview(filename, isVideo);
                    };
                }
            });
        });
    </script>
</body>
</html>`

// handleSessionExport exports full session data as JSON
func (app *App) handleSessionExport(w http.ResponseWriter, r *http.Request) {
	shareID := strings.TrimPrefix(r.URL.Path, "/api/sessions/export/")
	
	if shareID == "" {
		http.Error(w, "share_id required", http.StatusBadRequest)
		return
	}
	
	app.mu.RLock()
	share, exists := app.shares[shareID]
	if !exists {
		app.mu.RUnlock()
		http.Error(w, "Share not found", http.StatusNotFound)
		return
	}
	
	// Gather all data for this share
	var selections []PhotoSelection
	for _, sel := range app.selections {
		if sel.ShareID == shareID {
			selections = append(selections, sel)
		}
	}
	
	var comments []Comment
	for _, comment := range app.comments {
		if comment.ShareID == shareID {
			comments = append(comments, comment)
		}
	}
	
	session := app.sessions[shareID]
	app.mu.RUnlock()
	
	data := map[string]interface{}{
		"share":      share,
		"selections": selections,
		"comments":   comments,
		"session":    session,
		"exported_at": time.Now(),
	}
	
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="session-%s.json"`, shareID))
	json.NewEncoder(w).Encode(data)
}

// handleSessionImport imports session data from CSV or JSON
func (app *App) handleSessionImport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	
	shareID := strings.TrimPrefix(r.URL.Path, "/api/sessions/import/")
	if shareID == "" {
		http.Error(w, "share_id required", http.StatusBadRequest)
		return
	}
	
	// Check if share exists
	app.mu.RLock()
	_, exists := app.shares[shareID]
	app.mu.RUnlock()
	if !exists {
		http.Error(w, "Share not found", http.StatusNotFound)
		return
	}
	
	err := r.ParseMultipartForm(10 << 20) // 10 MB max
	if err != nil {
		http.Error(w, "Failed to parse form", http.StatusBadRequest)
		return
	}
	
	file, _, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "No file uploaded", http.StatusBadRequest)
		return
	}
	defer file.Close()
	
	// Read file content
	var data []byte
	data, err = io.ReadAll(file)
	if err != nil {
		http.Error(w, "Failed to read file", http.StatusInternalServerError)
		return
	}
	
	// Try to parse as JSON first
	var sessionData struct {
		Selections []PhotoSelection `json:"selections"`
		Comments   []Comment        `json:"comments"`
	}
	
	if err := json.Unmarshal(data, &sessionData); err == nil {
		// Import JSON data
		app.mu.Lock()
		for _, sel := range sessionData.Selections {
			sel.ID = generateRandomString(8)
			sel.ShareID = shareID
			sel.Timestamp = time.Now()
			app.selections = append(app.selections, sel)
			app.SaveSelection(&sel)
		}
		for _, comment := range sessionData.Comments {
			comment.ID = generateRandomString(8)
			comment.ShareID = shareID
			comment.CreatedAt = time.Now()
			app.comments = append(app.comments, comment)
			app.SaveComment(&comment)
		}
		app.mu.Unlock()
		
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":    true,
			"selections": len(sessionData.Selections),
			"comments":   len(sessionData.Comments),
		})
		return
	}
	
	// Try CSV format
	// CSV format: Filename,User,Favorite,Tags,Timestamp
	lines := strings.Split(string(data), "\n")
	if len(lines) < 2 {
		http.Error(w, "Invalid CSV format", http.StatusBadRequest)
		return
	}
	
	app.mu.Lock()
	imported := 0
	for i, line := range lines[1:] { // Skip header
		if strings.TrimSpace(line) == "" {
			continue
		}
		
		parts := strings.Split(line, ",")
		if len(parts) < 4 {
			continue
		}
		
		sel := PhotoSelection{
			ID:         generateRandomString(8),
			SessionID:  shareID,
			ShareID:    shareID,
			FileName:   parts[0],
			UserName:   parts[1],
			IsFavorite: parts[2] == "Yes" || parts[2] == "true",
			Tags:       []string{},
			Timestamp:  time.Now(),
		}
		
		if len(parts) > 3 && parts[3] != "" {
			tagsStr := strings.Trim(parts[3], "\"")
			sel.Tags = strings.Split(tagsStr, ";")
		}
		
		app.selections = append(app.selections, sel)
		app.SaveSelection(&sel)
		imported++
		
		if i >= 1000 { // Safety limit
			break
		}
	}
	app.mu.Unlock()
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"imported": imported,
	})
}

func main() {
	app := NewApp()

	http.HandleFunc("/api/shares", app.handleCreateShare)
	http.HandleFunc("/api/check-cloudflared", app.handleCheckCloudflared)
	http.HandleFunc("/api/sessions/validate-name", app.handleValidateName)
	http.HandleFunc("/api/comments", app.handleCreateComment)
	http.HandleFunc("/api/comments/get", app.handleGetComments)
	http.HandleFunc("/api/comments/count", app.handleGetCommentCount)
	http.HandleFunc("/api/selections", app.handleCreateSelection)
	http.HandleFunc("/api/selections/get", app.handleGetSelections)
	http.HandleFunc("/api/selections/counts", app.handleGetSelectionCounts)
	http.HandleFunc("/api/selections/export", app.handleExportSelections)
	http.HandleFunc("/api/sessions/export/", app.handleSessionExport)
	http.HandleFunc("/api/sessions/import/", app.handleSessionImport)
	http.HandleFunc("/dashboard/", app.handleDashboard)
	http.HandleFunc("/share/", app.handleSharePage)
	http.HandleFunc("/download/", app.handleDownload)
	http.HandleFunc("/thumbnail/", app.handleThumbnail)
	http.HandleFunc("/preview/", app.handlePreview)

	log.Println("File Share Server starting on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
