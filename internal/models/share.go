package models

import "time"

// Share represents a shared folder
type Share struct {
	ID           string
	FolderPath   string
	Password     string
	ExpiresAt    *time.Time
	DownloadLogs []DownloadLog
	CreatedAt    time.Time
}

// DownloadLog represents a file download event
type DownloadLog struct {
	FileName     string
	DownloadedAt time.Time
}
