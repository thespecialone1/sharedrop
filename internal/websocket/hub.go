package websocket

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// Client represents a WebSocket connection
type Client struct {
	Hub      *Hub
	Conn     *websocket.Conn
	Send     chan []byte
	ShareID  string
	UserName string
	Viewing  string // Current photo being viewed
}

// Hub maintains active clients and broadcasts messages
type Hub struct {
	Clients    map[string]map[*Client]bool // shareID -> clients
	Broadcast  chan *Message
	Register   chan *Client
	Unregister chan *Client
	Mu         sync.RWMutex
}

// Message represents a WebSocket message
type Message struct {
	Type      string          `json:"type"`
	ShareID   string          `json:"shareId"`
	User      string          `json:"user"`
	PhotoID   string          `json:"photoId,omitempty"`
	Action    string          `json:"action,omitempty"`
	Data      json.RawMessage `json:"data,omitempty"`
	Timestamp time.Time       `json:"timestamp"`
}

// Message types
const (
	MSG_CHAT_MESSAGE  = "chat.message"
	MSG_CHAT_DELETE   = "chat.delete"
	MSG_FAVORITE      = "favorite.toggle"
	MSG_TAG_ADD       = "tag.add"
	MSG_TAG_REMOVE    = "tag.remove"
	MSG_SELECTION     = "selection.change"
	MSG_USER_JOINED   = "user.joined"
	MSG_USER_LEFT     = "user.left"
	MSG_USER_VIEWING  = "user.viewing"
	MSG_TYPING_START  = "typing.start"
	MSG_TYPING_STOP   = "typing.stop"
	MSG_VOTE          = "vote.cast"
	MSG_SYNC_REQUEST  = "sync.request"
	MSG_SYNC_RESPONSE = "sync.response"
)

// NewHub creates a new WebSocket hub
func NewHub() *Hub {
	return &Hub{
		Clients:    make(map[string]map[*Client]bool),
		Broadcast:  make(chan *Message, 256),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
	}
}
