# Real-Time Collaboration Features - Implementation Guide

ShareDrop now includes WebSocket support for real-time collaboration. This document explains the implementation and how to extend it.

## Backend Implementation ✅

The backend WebSocket infrastructure is fully implemented:

- **WebSocket Hub**: Manages all active connections per share
- **Message Types**: Comment add/delete, favorites, tags, selections, user presence, typing indicators
- **Broadcasting**: Automatic broadcasting of all state changes to connected clients
- **Connection Management**: Auto-cleanup of disconnected clients

### WebSocket Endpoint

```
ws://localhost:8080/ws?shareId={shareID}&userName={userName}
```

### Message Format

```json
{
  "type": "comment.add",
  "shareId": "abc123",
  "user": "John",
  "photoId": "photo.jpg",
  "data": {...},
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### Supported Message Types

- `comment.add` - New comment posted
- `comment.delete` - Comment removed
- `favorite.toggle` - Photo favorited/unfavorited
- `tag.add` - Tag added to photo
- `tag.remove` - Tag removed from photo
- `selection.change` - User selection updated
- `user.joined` - User connected
- `user.left` - User disconnected
- `user.viewing` - User viewing specific photo
- `typing.start` - User typing comment
- `typing.stop` - User stopped typing
- `vote.cast` - User voted on photo
- `sync.request` - Request full state sync
- `sync.response` - Full state sync response

## Frontend Implementation - Required Steps

### 1. WebSocket Connection Manager

Add to the `<script>` section of `browseTemplate`:

```javascript
// WebSocket connection
let ws = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?shareId=${shareID}&userName=${userName}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
        reconnectAttempts = 0;
        showNotification('Connected - Real-time updates enabled', 'success');
    };
    
    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
    };
    
    ws.onclose = () => {
        console.log('WebSocket disconnected');
        if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            setTimeout(() => connectWebSocket(), 1000 * reconnectAttempts);
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

function handleWebSocketMessage(message) {
    switch(message.type) {
        case 'comment.add':
            handleNewComment(message);
            break;
        case 'favorite.toggle':
        case 'selection.change':
            handleSelectionUpdate(message);
            break;
        case 'user.joined':
            handleUserJoined(message);
            break;
        case 'user.left':
            handleUserLeft(message);
            break;
        case 'typing.start':
            showTypingIndicator(message.user, message.photoId);
            break;
        case 'typing.stop':
            hideTypingIndicator(message.user, message.photoId);
            break;
    }
}

// Send message via WebSocket
function sendWebSocketMessage(type, data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: type,
            shareId: shareID,
            user: userName,
            photoId: data.photoId || '',
            data: data.data || {},
            timestamp: new Date().toISOString()
        }));
    }
}
```

### 2. Live Presence Tracking

Add HTML for presence indicator (after header):

```html
<div class="presence-bar">
    <div class="presence-label">👤 Online now:</div>
    <div id="activeUsers" class="active-users"></div>
</div>
```

Add CSS:

```css
.presence-bar {
    max-width: 1200px;
    margin: 0 auto 16px;
    padding: 12px 20px;
    background: #0a0a0a;
    border: 1px solid #1a1a1a;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 12px;
}
.presence-label {
    font-size: 14px;
    color: #888;
}
.active-users {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}
.user-badge {
    padding: 4px 12px;
    background: #1e40af;
    border-radius: 12px;
    font-size: 12px;
    color: #fff;
    display: flex;
    align-items: center;
    gap: 4px;
}
.user-viewing {
    color: #94a3b8;
    font-size: 11px;
}
```

Add JavaScript:

```javascript
function updatePresence() {
    fetch(`/api/active-users?shareId=${shareID}`)
        .then(r => r.json())
        .then(data => {
            const container = document.getElementById('activeUsers');
            container.innerHTML = data.users.map(user => `
                <div class="user-badge">
                    ${user.name}
                    ${user.viewing ? `<span class="user-viewing">(viewing ${user.viewing})</span>` : ''}
                </div>
            `).join('');
        });
}

function handleUserJoined(message) {
    showNotification(`${message.user} joined`, 'info');
    updatePresence();
}

function handleUserLeft(message) {
    showNotification(`${message.user} left`, 'info');
    updatePresence();
}

// Update presence every 10 seconds
setInterval(updatePresence, 10000);
```

### 3. Typing Indicators for Comments

Modify comment input to broadcast typing status:

```javascript
let typingTimeout = null;

document.getElementById('commentText').addEventListener('input', function() {
    // Broadcast typing start
    sendWebSocketMessage('typing.start', {
        photoId: currentCommentFile
    });
    
    // Clear existing timeout
    clearTimeout(typingTimeout);
    
    // Set timeout to broadcast typing stop
    typingTimeout = setTimeout(() => {
        sendWebSocketMessage('typing.stop', {
            photoId: currentCommentFile
        });
    }, 2000);
});

function showTypingIndicator(user, photoId) {
    if (photoId === currentCommentFile && user !== userName) {
        const indicator = document.getElementById('typingIndicator');
        if (!indicator) {
            const div = document.createElement('div');
            div.id = 'typingIndicator';
            div.style.cssText = 'color: #888; font-size: 12px; margin-bottom: 8px; font-style: italic;';
            div.textContent = `${user} is typing...`;
            document.getElementById('commentsList').after(div);
        } else {
            indicator.textContent = `${user} is typing...`;
        }
    }
}

function hideTypingIndicator(user, photoId) {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        indicator.remove();
    }
}
```

### 4. Live Comment Updates

```javascript
function handleNewComment(message) {
    const comment = JSON.parse(message.data);
    
    // Update comment count badge
    const countBadge = document.querySelector(`[data-filename="${comment.fileName}"] .comment-count`);
    if (countBadge) {
        const currentCount = parseInt(countBadge.textContent) || 0;
        countBadge.textContent = currentCount + 1;
    }
    
    // If comments modal is open for this file, add comment to list
    if (currentCommentFile === comment.fileName) {
        addCommentToList(comment);
        showNotification(`${comment.author} commented`, 'info');
    }
}

function addCommentToList(comment) {
    const commentsList = document.getElementById('commentsList');
    const commentDiv = document.createElement('div');
    commentDiv.style.cssText = 'padding: 12px; background: #111; border-radius: 8px; margin-bottom: 12px;';
    commentDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <strong style="color: #fafafa;">${comment.author}</strong>
            <span style="color: #888; font-size: 12px;">${formatTimestamp(comment.created_at)}</span>
        </div>
        <p style="color: #ccc; font-size: 14px;">${comment.text}</p>
    `;
    commentsList.appendChild(commentDiv);
    commentsList.scrollTop = commentsList.scrollHeight;
}
```

### 5. Live Selection Updates

```javascript
function handleSelectionUpdate(message) {
    const selection = JSON.parse(message.data);
    
    // Skip if it's our own update
    if (selection.user_name === userName) return;
    
    // Update favorite count
    updateFavoriteCount(selection.file_name);
    
    // Show notification
    if (selection.is_favorite) {
        showNotification(`${selection.user_name} favorited ${selection.file_name}`, 'info');
    }
}

function updateFavoriteCount(fileName) {
    fetch(`/api/selections/counts?share_id=${shareID}`)
        .then(r => r.json())
        .then(data => {
            const count = (data[fileName] && data[fileName].favorites) || 0;
            const users = (data[fileName] && data[fileName].users) || [];
            
            // Update UI
            const favElements = document.querySelectorAll(`[data-filename="${fileName}"] .fav-count`);
            favElements.forEach(el => {
                el.textContent = count > 0 ? `${count} favorites` : '';
                el.title = users.join(', ');
            });
        });
}
```

### 6. Toast Notifications

Add HTML (at end of body):

```html
<div id="toastContainer" style="position: fixed; top: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 8px;"></div>
```

Add JavaScript:

```javascript
function showNotification(message, type = 'info') {
    const toast = document.createElement('div');
    toast.style.cssText = `
        padding: 12px 20px;
        background: ${type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: slideIn 0.3s ease;
        max-width: 300px;
        font-size: 14px;
    `;
    toast.textContent = message;
    
    document.getElementById('toastContainer').appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Add animations to CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
    }
`;
document.head.appendChild(style);
```

### 7. Initialize on Page Load

Add to initialization code:

```javascript
// After userName is set
function saveUserName() {
    userName = document.getElementById('userName').value.trim();
    if (userName) {
        // Validate username via API first
        fetch('/api/sessions/validate-name', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({share_id: shareID, user_name: userName})
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                localStorage.setItem(`userName_${shareID}`, userName);
                sessionStorage.setItem(`userName_${shareID}`, userName);
                document.getElementById('userModal').style.display = 'none';
                
                // Connect WebSocket
                connectWebSocket();
                
                // Start presence updates
                updatePresence();
                
                // Load saved selections
                loadUserSelections();
            } else {
                alert(data.error);
            }
        });
    }
}
```

## Advanced Features (Optional)

### Collaborative Voting

Add voting buttons to each photo:

```html
<div class="vote-buttons">
    <button onclick="castVote('yes', '{{.Name}}')">👍 Yes</button>
    <button onclick="castVote('maybe', '{{.Name}}')">🤔 Maybe</button>
    <button onclick="castVote('no', '{{.Name}}')">👎 No</button>
</div>
<div class="vote-results" data-filename="{{.Name}}"></div>
```

```javascript
function castVote(choice, fileName) {
    fetch('/api/votes', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            share_id: shareID,
            file_name: fileName,
            user_name: userName,
            choice: choice
        })
    })
    .then(() => {
        sendWebSocketMessage('vote.cast', {
            photoId: fileName,
            data: {choice: choice}
        });
    });
}
```

### Live Activity Feed (Photographer Dashboard)

Add to dashboard template:

```html
<div id="liveActivityFeed" style="max-height: 400px; overflow-y: auto;">
    <!-- Real-time activity will appear here -->
</div>

<script>
let ws = new WebSocket(`ws://${window.location.host}/ws?shareId={{.ShareID}}&userName=photographer`);

ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    addActivityItem(message);
};

function addActivityItem(message) {
    const feed = document.getElementById('liveActivityFeed');
    const item = document.createElement('div');
    item.style.cssText = 'padding: 12px; border-bottom: 1px solid #333; animation: fadeIn 0.3s;';
    
    let icon = '•';
    let action = '';
    
    switch(message.type) {
        case 'comment.add':
            icon = '💬';
            action = 'commented on';
            break;
        case 'favorite.toggle':
            icon = '⭐';
            action = 'favorited';
            break;
        case 'tag.add':
            icon = '🏷️';
            action = 'tagged';
            break;
    }
    
    item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
            <span>${icon}</span>
            <strong>${message.user}</strong>
            <span>${action}</span>
            <a href="/share/{{.ShareID}}#${message.photoId}">${message.photoId}</a>
            <span style="margin-left: auto; color: #888; font-size: 12px;">${formatTimestamp(message.timestamp)}</span>
        </div>
    `;
    
    feed.insertBefore(item, feed.firstChild);
    
    // Keep only last 50 items
    while (feed.children.length > 50) {
        feed.removeChild(feed.lastChild);
    }
}
</script>
```

## Testing

1. Open multiple browser windows to the same share link
2. Use different usernames in each window
3. Try:
   - Favoriting photos (should update in all windows)
   - Adding comments (should appear in real-time)
   - Typing comments (should show "X is typing...")
   - Viewing photos (should update presence)

## Performance Considerations

- WebSocket connections are lightweight (< 1KB/message)
- Hub uses goroutines for concurrent handling
- No polling required - pure push updates
- Automatic cleanup of disconnected clients
- Messages are broadcast only to relevant shareID

## Security

- WebSocket origin checking enabled (development: allow all)
- For production: Add origin whitelist in upgrader config
- No authentication beyond share password
- Rate limiting recommended for production

## Next Steps

1. Implement voting API endpoint
2. Add database table for votes
3. Create consensus indicators in UI
4. Add live tag cloud visualization
5. Implement cursor tracking (optional)

## Troubleshooting

**WebSocket won't connect:**
- Check browser console for errors
- Verify server is running on correct port
- Check firewall/proxy settings

**Updates not appearing:**
- Verify shareID is correct
- Check WebSocket connection status
- Look for JavaScript errors in console

**High memory usage:**
- Implement message throttling
- Limit active connections per share
- Add cleanup for old messages
