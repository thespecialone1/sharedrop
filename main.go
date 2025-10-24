package main

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type Share struct {
	ID          string    `json:"id"`
	FolderPath  string    `json:"folder_path"`
	Password    string    `json:"password"`
	CreatedAt   time.Time `json:"created_at"`
	AccessCount int       `json:"access_count"`
}

type DownloadLog struct {
	ShareID    string    `json:"share_id"`
	FileName   string    `json:"file_name"`
	ClientIP   string    `json:"client_ip"`
	DownloadAt time.Time `json:"download_at"`
}

type App struct {
	shares       map[string]*Share
	downloadLogs []DownloadLog
	mu           sync.RWMutex
}

func NewApp() *App {
	return &App{
		shares:       make(map[string]*Share),
		downloadLogs: make([]DownloadLog, 0),
	}
}

func generateRandomString(length int) string {
	bytes := make([]byte, length)
	rand.Read(bytes)
	return base64.URLEncoding.EncodeToString(bytes)[:length]
}

func (app *App) createShare(folderPath string) (*Share, error) {
	info, err := os.Stat(folderPath)
	if err != nil {
		return nil, fmt.Errorf("folder not found: %v", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("path is not a directory")
	}

	share := &Share{
		ID:         generateRandomString(8),
		FolderPath: folderPath,
		Password:   generateRandomString(12),
		CreatedAt:  time.Now(),
	}

	app.mu.Lock()
	app.shares[share.ID] = share
	app.mu.Unlock()

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
