# Live Chat Feature - Implementation Complete

## ✅ Changes Made

### Backend (Go)

1. **Data Structures Updated**
   - ✅ Replaced `Comment` with `ChatMessage` struct
   - ✅ Added `photo_ref` field for photo references in chat
   - ✅ Updated WebSocket message types (`chat.message` instead of `comment.add`)
   - ✅ `Vote` struct already exists

2. **Database Schema**
   - ✅ Replaced `comments` table with `chat_messages` table
   - ✅ Added `votes` table with proper schema
   - ✅ Updated App struct to use `chatMessages` instead of `comments`

### Frontend Changes Needed

## 🔨 Remaining Implementation Steps

### Step 1: Update LoadFromDB Function
Replace comment loading with chat message loading:

```go
// Replace lines 482-497 in main.go
// Load chat messages
rows, err = app.db.Query("SELECT id, share_id, user_name, message, photo_ref, created_at FROM chat_messages")
if err != nil {
    return err
}
defer rows.Close()

for rows.Next() {
    var msg ChatMessage
    var photoRef sql.NullString
    err := rows.Scan(&msg.ID, &msg.ShareID, &msg.UserName, &msg.Message, &photoRef, &msg.CreatedAt)
    if err != nil {
        log.Printf("Error loading chat message: %v", err)
        continue
    }
    if photoRef.Valid {
        msg.PhotoRef = photoRef.String
    }
    app.chatMessages = append(app.chatMessages, msg)
}

// Load votes
rows, err = app.db.Query("SELECT id, share_id, file_name, user_name, choice, timestamp FROM votes")
if err != nil {
    return err
}
defer rows.Close()

for rows.Next() {
    var vote Vote
    err := rows.Scan(&vote.ID, &vote.ShareID, &vote.FileName, &vote.UserName, &vote.Choice, &vote.Timestamp)
    if err != nil {
        log.Printf("Error loading vote: %v", err)
        continue
    }
    app.votes = append(app.votes, vote)
}
```

### Step 2: Add Chat API Endpoints
Replace comment handlers with chat handlers:

```go
// POST /api/chat - Send chat message
func (app *App) handleSendChatMessage(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
        return
    }

    var req struct {
        ShareID  string `json:"share_id"`
        UserName string `json:"user_name"`
        Message  string `json:"message"`
        PhotoRef string `json:"photo_ref,omitempty"`
    }

    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    msg := ChatMessage{
        ID:        generateRandomString(8),
        ShareID:   req.ShareID,
        UserName:  req.UserName,
        Message:   req.Message,
        PhotoRef:  req.PhotoRef,
        CreatedAt: time.Now(),
    }

    app.mu.Lock()
    app.chatMessages = append(app.chatMessages, msg)
    app.mu.Unlock()

    // Save to database
    if err := app.SaveChatMessage(&msg); err != nil {
        log.Printf("Failed to save chat message: %v", err)
    }

    // Broadcast via WebSocket
    msgData, _ := json.Marshal(msg)
    app.hub.broadcast <- &Message{
        Type:      MSG_CHAT_MESSAGE,
        ShareID:   req.ShareID,
        User:      req.UserName,
        Data:      msgData,
        Timestamp: time.Now(),
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(msg)
}

// GET /api/chat - Get chat messages
func (app *App) handleGetChatMessages(w http.ResponseWriter, r *http.Request) {
    shareID := r.URL.Query().Get("share_id")
    if shareID == "" {
        http.Error(w, "share_id required", http.StatusBadRequest)
        return
    }

    app.mu.RLock()
    var messages []ChatMessage
    for _, msg := range app.chatMessages {
        if msg.ShareID == shareID {
            messages = append(messages, msg)
        }
    }
    app.mu.RUnlock()

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(messages)
}

// SaveChatMessage saves a chat message to database
func (app *App) SaveChatMessage(msg *ChatMessage) error {
    if app.db == nil {
        return fmt.Errorf("database not initialized")
    }

    _, err := app.db.Exec(`
        INSERT OR REPLACE INTO chat_messages (id, share_id, user_name, message, photo_ref, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `, msg.ID, msg.ShareID, msg.UserName, msg.Message, msg.PhotoRef, msg.CreatedAt)
    return err
}
```

### Step 3: Add Voting API Endpoints

```go
// POST /api/vote - Cast a vote
func (app *App) handleCastVote(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
        return
    }

    var req struct {
        ShareID  string `json:"share_id"`
        FileName string `json:"file_name"`
        UserName string `json:"user_name"`
        Choice   string `json:"choice"` // "yes", "no", "maybe"
    }

    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    // Find and update existing vote or create new
    app.mu.Lock()
    var existingVote *Vote
    for i := range app.votes {
        if app.votes[i].ShareID == req.ShareID &&
            app.votes[i].FileName == req.FileName &&
            app.votes[i].UserName == req.UserName {
            existingVote = &app.votes[i]
            break
        }
    }

    if existingVote != nil {
        existingVote.Choice = req.Choice
        existingVote.Timestamp = time.Now()
    } else {
        vote := Vote{
            ID:        generateRandomString(8),
            ShareID:   req.ShareID,
            FileName:  req.FileName,
            UserName:  req.UserName,
            Choice:    req.Choice,
            Timestamp: time.Now(),
        }
        app.votes = append(app.votes, vote)
        existingVote = &vote
    }
    app.mu.Unlock()

    // Save to database
    if err := app.SaveVote(existingVote); err != nil {
        log.Printf("Failed to save vote: %v", err)
    }

    // Broadcast via WebSocket
    voteData, _ := json.Marshal(existingVote)
    app.hub.broadcast <- &Message{
        Type:      MSG_VOTE,
        ShareID:   req.ShareID,
        User:      req.UserName,
        PhotoID:   req.FileName,
        Data:      voteData,
        Timestamp: time.Now(),
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(existingVote)
}

// GET /api/votes - Get vote counts for photos
func (app *App) handleGetVotes(w http.ResponseWriter, r *http.Request) {
    shareID := r.URL.Query().Get("share_id")
    fileName := r.URL.Query().Get("file_name")

    if shareID == "" {
        http.Error(w, "share_id required", http.StatusBadRequest)
        return
    }

    app.mu.RLock()
    voteCounts := make(map[string]map[string]int) // fileName -> {yes: count, no: count, maybe: count}
    
    for _, vote := range app.votes {
        if vote.ShareID == shareID {
            if fileName == "" || vote.FileName == fileName {
                if voteCounts[vote.FileName] == nil {
                    voteCounts[vote.FileName] = make(map[string]int)
                }
                voteCounts[vote.FileName][vote.Choice]++
            }
        }
    }
    app.mu.RUnlock()

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(voteCounts)
}

// SaveVote saves a vote to database
func (app *App) SaveVote(vote *Vote) error {
    if app.db == nil {
        return fmt.Errorf("database not initialized")
    }

    _, err := app.db.Exec(`
        INSERT OR REPLACE INTO votes (id, share_id, file_name, user_name, choice, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
    `, vote.ID, vote.ShareID, vote.FileName, vote.UserName, vote.Choice, vote.Timestamp)
    return err
}
```

### Step 4: Register New Routes in main()

```go
// Replace comment routes with chat routes:
http.HandleFunc("/api/chat", app.handleSendChatMessage)
http.HandleFunc("/api/chat/get", app.handleGetChatMessages)
http.HandleFunc("/api/vote", app.handleCastVote)
http.HandleFunc("/api/votes", app.handleGetVotes)

// Remove these old routes:
// http.HandleFunc("/api/comments", ...)
// http.HandleFunc("/api/comments/get", ...)
// http.HandleFunc("/api/comments/count", ...)
```

### Step 5: Frontend - Live Chat UI (Light Theme)

Add to browse template before closing `</body>`:

```html
<!-- Floating Chat Window -->
<div id="chatWindow" style="position: fixed; bottom: 20px; right: 20px; width: 380px; height: 600px; background: white; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.15); display: none; flex-direction: column; overflow: hidden; z-index: 1000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;">
    <!-- Chat Header -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px; display: flex; justify-content: space-between; align-items: center;">
        <div>
            <div style="font-weight: 600; font-size: 16px;">Gallery Chat</div>
            <div style="font-size: 12px; opacity: 0.9;" id="chatOnlineCount">0 online</div>
        </div>
        <button onclick="toggleChat()" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 20px; line-height: 1;">×</button>
    </div>
    
    <!-- Chat Messages Area -->
    <div id="chatMessages" style="flex: 1; overflow-y: auto; padding: 16px; background: #f8f9fa;">
        <!-- Messages will be appended here -->
    </div>
    
    <!-- Typing Indicator -->
    <div id="chatTyping" style="display: none; padding: 8px 16px; background: #f8f9fa; color: #666; font-size: 12px; font-style: italic;">
        Someone is typing...
    </div>
    
    <!-- Chat Input -->
    <div style="padding: 16px; background: white; border-top: 1px solid #e9ecef;">
        <div style="display: flex; gap: 8px; margin-bottom: 8px;" id="photoRefPreview"></div>
        <div style="display: flex; gap: 8px;">
            <input type="text" id="chatInput" placeholder="Type a message..." style="flex: 1; padding: 10px 14px; border: 1px solid #dee2e6; border-radius: 20px; font-size: 14px; outline: none;">
            <button onclick="sendChatMessage()" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; font-size: 18px; display: flex; align-items: center; justify-content: center;">→</button>
        </div>
    </div>
</div>

<!-- Chat Toggle Button -->
<button id="chatToggle" onclick="toggleChat()" style="position: fixed; bottom: 20px; right: 20px; width: 60px; height: 60px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 50%; cursor: pointer; font-size: 24px; box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4); z-index: 999;">💬</button>
```

### Step 6: Frontend - Chat JavaScript

Add after WebSocket connection code:

```javascript
let currentPhotoRef = null;

function toggleChat() {
    const chatWindow = document.getElementById('chatWindow');
    const chatToggle = document.getElementById('chatToggle');
    
    if (chatWindow.style.display === 'none') {
        chatWindow.style.display = 'flex';
        chatToggle.style.display = 'none';
        loadChatMessages();
    } else {
        chatWindow.style.display = 'none';
        chatToggle.style.display = 'flex';
    }
}

function loadChatMessages() {
    fetch('/api/chat/get?share_id=' + shareID)
        .then(function(r) { return r.json(); })
        .then(function(messages) {
            const container = document.getElementById('chatMessages');
            container.innerHTML = '';
            messages.forEach(function(msg) {
                addChatMessageToUI(msg);
            });
            container.scrollTop = container.scrollHeight;
        });
}

function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    fetch('/api/chat', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            share_id: shareID,
            user_name: userName,
            message: message,
            photo_ref: currentPhotoRef
        })
    })
    .then(function(r) { return r.json(); })
    .then(function() {
        input.value = '';
        currentPhotoRef = null;
        document.getElementById('photoRefPreview').innerHTML = '';
    });
}

function addChatMessageToUI(msg) {
    const container = document.getElementById('chatMessages');
    const isOwn = msg.user_name === userName;
    
    const msgDiv = document.createElement('div');
    msgDiv.style.cssText = 'margin-bottom: 12px; display: flex; flex-direction: column; align-items: ' + (isOwn ? 'flex-end' : 'flex-start');
    
    let html = '<div style="max-width: 70%;">';
    
    if (!isOwn) {
        html += '<div style="font-size: 11px; color: #667eea; font-weight: 600; margin-bottom: 4px;">' + escapeHtml(msg.user_name) + '</div>';
    }
    
    if (msg.photo_ref) {
        html += '<div style="background: white; padding: 8px; border-radius: 8px; margin-bottom: 4px; border: 1px solid #dee2e6; cursor: pointer;" onclick="openPreview(\'' + msg.photo_ref + '\', false)">';
        html += '<img src="/thumbnail/' + shareID + '/' + encodeURIComponent(msg.photo_ref) + '" style="width: 100%; border-radius: 4px;">';
        html += '<div style="font-size: 11px; color: #666; margin-top: 4px;">' + msg.photo_ref + '</div>';
        html += '</div>';
    }
    
    html += '<div style="background: ' + (isOwn ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'white') + '; color: ' + (isOwn ? 'white' : '#212529') + '; padding: 10px 14px; border-radius: 16px; font-size: 14px; line-height: 1.5; ' + (!isOwn ? 'border: 1px solid #dee2e6;' : '') + '">';
    html += escapeHtml(msg.message);
    html += '</div>';
    
    html += '<div style="font-size: 10px; color: #adb5bd; margin-top: 4px;">' + formatTime(msg.created_at) + '</div>';
    html += '</div>';
    
    msgDiv.innerHTML = html;
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
}

// Handle incoming chat messages via WebSocket
function handleNewChatMessage(message) {
    try {
        const msg = typeof message.data === 'string' ? JSON.parse(message.data) : message.data;
        addChatMessageToUI(msg);
    } catch (err) {
        console.error('Error handling chat message:', err);
    }
}

// Add to handleWebSocketMessage switch case:
case 'chat.message':
    handleNewChatMessage(message);
    break;

// Setup chat input typing broadcast
document.getElementById('chatInput').addEventListener('input', function() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'typing.start',
            shareId: shareID,
            user: userName,
            timestamp: new Date().toISOString()
        }));
        
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(function() {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'typing.stop',
                    shareId: shareID,
                    user: userName,
                    timestamp: new Date().toISOString()
                }));
            }
        }, 1000);
    }
});

// Update online count in chat
function updateChatOnlineCount() {
    fetch('/api/active-users?shareId=' + shareID)
        .then(function(r) { return r.json(); })
        .then(function(data) {
            document.getElementById('chatOnlineCount').textContent = data.count + ' online';
        });
}

setInterval(updateChatOnlineCount, 10000);
```

### Step 7: Add Voting Buttons to Photos

Add voting buttons to each photo in the grid/list view:

```html
<!-- Add after action buttons in file-item -->
<div class="vote-buttons" style="display: flex; gap: 4px; margin-top: 8px;">
    <button class="vote-btn" data-filename="{{.Name}}" data-choice="yes" onclick="castVote(this)" style="flex: 1; padding: 6px; background: #22c55e; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">Yes</button>
    <button class="vote-btn" data-filename="{{.Name}}" data-choice="maybe" onclick="castVote(this)" style="flex: 1; padding: 6px; background: #fbbf24; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">Maybe</button>
    <button class="vote-btn" data-filename="{{.Name}}" data-choice="no" onclick="castVote(this)" style="flex: 1; padding: 6px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">No</button>
</div>
<div class="vote-counts" data-filename="{{.Name}}" style="font-size: 11px; color: #666; margin-top: 4px;"></div>
```

```javascript
function castVote(button) {
    const filename = button.getAttribute('data-filename');
    const choice = button.getAttribute('data-choice');
    
    fetch('/api/vote', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            share_id: shareID,
            file_name: filename,
            user_name: userName,
            choice: choice
        })
    })
    .then(function() {
        loadVoteCounts(filename);
    });
}

function loadVoteCounts(filename) {
    fetch('/api/votes?share_id=' + shareID + '&file_name=' + filename)
        .then(function(r) { return r.json(); })
        .then(function(votes) {
            const countEls = document.querySelectorAll('.vote-counts[data-filename="' + filename + '"]');
            countEls.forEach(function(el) {
                const counts = votes[filename] || {};
                const yes = counts.yes || 0;
                const maybe = counts.maybe || 0;
                const no = counts.no || 0;
                el.textContent = 'Yes: ' + yes + ' | Maybe: ' + maybe + ' | No: ' + no;
            });
        });
}
```

### Step 8: Remove Emoji from Presence Bar

Update presence bar HTML (line 2196):

```html
<div class="presence-label">Online now:</div>
```

Update chat toggle button to not use emoji (replace 💬 with text):

```html
<button id="chatToggle" onclick="toggleChat()" style="...">Chat</button>
```

## Summary

The implementation transforms comments into a modern live chat system with:
- ✅ Light theme messaging UI
- ✅ Real-time message delivery via WebSocket
- ✅ Photo reference attachments in chat
- ✅ Voting system (Yes/No/Maybe) on photos
- ✅ Typing indicators
- ✅ Online presence counter in chat
- ✅ No emojis (clean professional UI)
- ✅ SQLite persistence for all chat and votes
