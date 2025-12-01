package models

import "sync"

// FileInfo represents file metadata for display
type FileInfo struct {
	Name    string
	Size    int64
	IsDir   bool
	IsImage bool
	IsVideo bool
}

// ThumbnailCache stores generated thumbnails
type ThumbnailCache struct {
	Cache map[string][]byte
	Mu    sync.RWMutex
}
