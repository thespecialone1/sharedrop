package main

import (
	"archive/zip"
	"bytes"
	"crypto/rand"
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

	"github.com/nfnt/resize"
	"github.com/gorilla/websocket"
	
	"file-share-app/internal/models"
	"file-share-app/internal/storage"
	ws "file-share-app/internal/websocket"
)

// WebSocket message type constants
const (
	MSG_CHAT_MESSAGE   = ws.MSG_CHAT_MESSAGE
	MSG_CHAT_DELETE    = ws.MSG_CHAT_DELETE
	MSG_FAVORITE       = ws.MSG_FAVORITE
	MSG_TAG_ADD        = ws.MSG_TAG_ADD
	MSG_TAG_REMOVE     = ws.MSG_TAG_REMOVE
	MSG_SELECTION      = ws.MSG_SELECTION
	MSG_USER_JOINED    = ws.MSG_USER_JOINED
	MSG_USER_LEFT      = ws.MSG_USER_LEFT
	MSG_USER_VIEWING   = ws.MSG_USER_VIEWING
	MSG_TYPING_START   = ws.MSG_TYPING_START
	MSG_TYPING_STOP    = ws.MSG_TYPING_STOP
	MSG_VOTE           = ws.MSG_VOTE
	MSG_SYNC_REQUEST   = ws.MSG_SYNC_REQUEST
	MSG_SYNC_RESPONSE  = ws.MSG_SYNC_RESPONSE
)

// WebSocket upgrader
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins
	},
}

// Type aliases for backward compatibility
type Share = models.Share
type ChatMessage = models.ChatMessage
type PhotoSelection = models.PhotoSelection
type ShareSession = models.ShareSession
type Client = ws.Client
type Hub = ws.Hub
type Message = ws.Message

// DownloadLog tracks file downloads (kept here for now)
type DownloadLog struct {
	ShareID    string    `json:"share_id"`
	FileName   string    `json:"file_name"`
	ClientIP   string    `json:"client_ip"`
	DownloadAt time.Time `json:"download_at"`
}

// Vote represents voting (kept here for now)
type Vote struct {
	ID        string    `json:"id"`
	ShareID   string    `json:"share_id"`
	FileName  string    `json:"file_name"`
	UserName  string    `json:"user_name"`
	Choice    string    `json:"choice"`
	Timestamp time.Time `json:"timestamp"`
}

// ThumbnailCache stores generated thumbnails (will move to services later)
type ThumbnailCache struct {
	cache map[string][]byte
	mu    sync.RWMutex
}

// App is the main application struct
type App struct {
	shares         map[string]*Share
	downloadLogs   []DownloadLog
	thumbnailCache *ThumbnailCache
	hub            *Hub
	db             *storage.DB  // Using new storage layer with connection pooling
	mu             sync.RWMutex
}

// NewApp creates and initializes the application
func NewApp() *App {
	// Create WebSocket hub using new package
	hub := ws.NewHub()
	
	app := &App{
		shares:         make(map[string]*Share),
		downloadLogs:   make([]DownloadLog, 0),
		thumbnailCache: &ThumbnailCache{cache: make(map[string][]byte)},
		hub:            hub,
	}
	
	// Start WebSocket hub in background
	go hub.Run()
	
	// Initialize database with performance optimizations
	db, err := storage.InitDB("sharedrop.db")
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	app.db = db
	
	// Load existing data
	app.loadFromDB()
	
	log.Println("App initialized with modular architecture and performance optimizations")
	return app
}

// loadFromDB loads shares and other data from database
func (app *App) loadFromDB() {
	shares, err := app.db.GetAllShares()
	if err != nil {
		log.Printf("Error loading shares: %v", err)
		return
	}
	
	app.mu.Lock()
	for _, share := range shares {
		app.shares[share.ID] = share
	}
	app.mu.Unlock()
	
	log.Printf("Loaded %d shares from database", len(shares))
}

func main() {
	app := NewApp()
	defer app.db.Close()
	
	// Serve static files and handle routes
	setupRoutes(app)
	
	log.Println("File Share Server starting on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}

func setupRoutes(app *App) {
	// Share management
	http.HandleFunc("/", app.handleHome)
	http.HandleFunc("/create", app.handleCreateShare)
	http.HandleFunc("/share/", app.handleShareView)
	http.HandleFunc("/delete/", app.handleDeleteShare)
	
	// File operations
	http.HandleFunc("/download/", app.handleDownload)
	http.HandleFunc("/download-selected/", app.handleDownloadSelected)
	http.HandleFunc("/preview/", app.handlePreview)
	http.HandleFunc("/thumbnail/", app.handleThumbnail)
	
	// API endpoints
	http.HandleFunc("/api/selections", app.handleSelections)
	http.HandleFunc("/api/selections/get", app.handleGetSelections)
	http.HandleFunc("/api/chat/messages", app.handleChatMessage)
	http.HandleFunc("/api/chat/messages/get", app.handleGetChatMessages)
	http.HandleFunc("/api/active-users", app.handleActiveUsers)
	http.HandleFunc("/ws", app.handleWebSocket)
	
	// Admin/dashboard
	http.HandleFunc("/api/dashboard/", app.handleDashboard)
	http.HandleFunc("/api/sessions/export/", app.handleSessionExport)
}
