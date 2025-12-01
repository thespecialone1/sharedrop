package models

import "time"

// ChatMessage represents a chat message in a share session
type ChatMessage struct {
	ID        int
	ShareID   string
	UserName  string
	Message   string
	PhotoRef  string
	Timestamp time.Time
}
