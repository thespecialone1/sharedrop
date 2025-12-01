package models

import "time"

// PhotoSelection represents a user's selection/tagging of a photo
type PhotoSelection struct {
	ID           int
	ShareID      string
	FileName     string
	UserName     string
	IsFavorite   bool
	Tags         []string
	Timestamp    time.Time
}

// ShareSession represents metadata about a share session
type ShareSession struct {
	ShareID     string
	SessionName string
	CreatedAt   time.Time
}

// Vote represents a user's vote on a photo
type Vote struct {
	ID        int
	ShareID   string
	FileName  string
	UserName  string
	Vote      int
	Timestamp time.Time
}
