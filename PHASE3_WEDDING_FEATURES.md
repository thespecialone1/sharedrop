# Phase 3: Wedding Photography Review System

## Overview

Transform ShareDrop into a professional wedding photography review tool with client selection, favorites, ratings, tags, and collaborative review features.

## Implementation Approach

### MVP (Phase 3.1) - Core Selection Features
**Goal**: Simple, functional client review system
**Timeline**: 1-2 days

#### Features
- ⭐ Star/favorite toggle per photo
- 🏷️ Quick tags: "Album", "Print", "Social Media", "Pass"
- 👤 User identification (name entry on join)
- 📊 Selection counter
- 💾 Local storage with server sync
- 📤 Export selections (CSV/JSON)

#### Data Structure
```go
type PhotoSelection struct {
    SessionID   string    `json:"session_id"`
    ShareID     string    `json:"share_id"`
    FileName    string    `json:"file_name"`
    UserName    string    `json:"user_name"`
    IsFavorite  bool      `json:"is_favorite"`
    Tags        []string  `json:"tags"`
    Timestamp   time.Time `json:"timestamp"`
}

type ShareSession struct {
    ShareID        string    `json:"share_id"`
    SessionName    string    `json:"session_name"` // e.g., "Smith Wedding 2025"
    AllowMultiUser bool      `json:"allow_multi_user"`
    CreatedAt      time.Time `json:"created_at"`
}
```

#### UI Components

**1. User Login Modal** (after password)
```
┌─────────────────────────────────┐
│ Smith Wedding 2025              │
│                                 │
│ Enter your name to get started: │
│ [________________]              │
│                                 │
│ [Continue]                      │
└─────────────────────────────────┘
```

**2. Photo Actions Bar** (on each photo)
```
┌──────────────────────────────┐
│ IMG_0234.jpg                 │
│ ⭐ Favorite                   │
│ 🏷️ Tags: [Album] [Print]     │
│ 💬 Comment                    │
└──────────────────────────────┘
```

**3. Selection Summary Bar** (sticky top)
```
┌────────────────────────────────────────┐
│ 47 favorites • 23 tagged • [Export]    │
└────────────────────────────────────────┘
```

### Full Version (Phase 3.2) - Advanced Features
**Goal**: Professional collaborative review
**Timeline**: 2-3 days

#### Additional Features
- ⭐ 1-5 star ratings
- 📁 Custom collections/albums
- 👥 Multi-user indicators ("Sarah favorited")
- 📊 Photographer dashboard
- 🔔 Real-time activity feed
- 📧 Export reports (PDF/Excel)
- 🗂️ Smart folders by tags
- 💾 Offline support with IndexedDB
- 🔄 Sync queue for offline changes

---

## Technical Implementation Plan

### Backend Changes

#### New Endpoints
```
POST   /api/sessions              - Create review session
GET    /api/sessions/:id          - Get session details
POST   /api/selections            - Add/update selection
GET    /api/selections/:shareID   - Get all selections for share
GET    /api/selections/export     - Export as CSV/JSON
DELETE /api/selections/:id        - Remove selection
```

#### Database (In-Memory for MVP)
```go
type App struct {
    shares         map[string]*Share
    downloadLogs   []DownloadLog
    comments       []Comment
    thumbnailCache *ThumbnailCache
    sessions       map[string]*ShareSession    // NEW
    selections     []PhotoSelection            // NEW
    mu             sync.RWMutex
}
```

### Frontend Changes

#### New UI Elements
1. User identification modal
2. Favorite star button on each photo
3. Tag selection dropdown/pills
4. Selection counter in header
5. Export button with format options
6. Filter by: Favorites, Tags, User

#### Local Storage Strategy
```javascript
// Store selections locally
const userSelections = {
    sessionId: 'wedding-smith',
    userName: 'Sarah',
    favorites: ['IMG_001.jpg', 'IMG_234.jpg'],
    tags: {
        'IMG_001.jpg': ['Album', 'Print'],
        'IMG_234.jpg': ['Social Media']
    },
    lastSync: '2025-01-15T14:30:00Z'
};

localStorage.setItem('selections', JSON.stringify(userSelections));
```

#### Sync Logic
```javascript
// On page load
1. Load from localStorage
2. Display immediately
3. Sync with server in background
4. Merge conflicts (server wins)

// On user action
1. Update localStorage immediately
2. Queue API call
3. Retry on failure
4. Show sync status indicator
```

---

## Photographer Dashboard (Phase 3.2)

### New Route
```
GET /dashboard/:shareID - Photographer's dashboard
```

### Dashboard UI
```
┌──────────────────────────────────────────────────────┐
│ Smith Wedding 2025                                   │
│ Status: ● 3 active reviewers • Last sync: 1 min ago │
├──────────────────────────────────────────────────────┤
│ Summary                                              │
│ • Total photos: 500                                  │
│ • Favorited: 47 (9%)                                 │
│ • Tagged for album: 23                               │
│ • With comments: 12                                  │
├──────────────────────────────────────────────────────┤
│ Recent Activity                                      │
│ • Sarah favorited 5 photos (2 min ago)              │
│ • John tagged 3 photos for print (5 min ago)        │
│ • Mom commented "Love this!" (8 min ago)            │
├──────────────────────────────────────────────────────┤
│ Actions                                              │
│ [Export All Selections] [Download CSV]               │
│ [View by User] [View by Tag]                         │
└──────────────────────────────────────────────────────┘
```

---

## Export Formats

### CSV Export
```csv
Filename,User,Favorite,Tags,Comments,Timestamp
IMG_0234.jpg,Sarah,Yes,"Album,Print","Album cover!",2025-01-15T14:23:05Z
IMG_0235.jpg,John,No,Social Media,"Great shot",2025-01-15T14:25:00Z
```

### JSON Export
```json
{
  "session": "Smith Wedding 2025",
  "exportDate": "2025-01-15T15:00:00Z",
  "selections": [
    {
      "filename": "IMG_0234.jpg",
      "users": [
        {
          "name": "Sarah",
          "favorite": true,
          "tags": ["Album", "Print"],
          "comment": "Album cover!",
          "timestamp": "2025-01-15T14:23:05Z"
        }
      ]
    }
  ]
}
```

---

## Migration Path

### Phase 3.1 (MVP) - Week 1
- [ ] Add PhotoSelection and ShareSession structs
- [ ] Implement selection API endpoints
- [ ] Add user identification modal
- [ ] Add favorite star button
- [ ] Add tag selection UI
- [ ] Add selection counter
- [ ] Implement CSV export
- [ ] Test with real wedding photos

### Phase 3.2 (Full) - Week 2
- [ ] Add 1-5 star ratings
- [ ] Add custom collections
- [ ] Build photographer dashboard
- [ ] Add real-time activity feed
- [ ] Implement offline support (IndexedDB)
- [ ] Add sync queue
- [ ] Add PDF export
- [ ] Multi-user indicators

### Phase 3.3 (Polish) - Week 3
- [ ] Smart folders
- [ ] Advanced filters
- [ ] Batch operations
- [ ] Email notifications
- [ ] Session history
- [ ] Performance optimization

---

## Open Questions

1. **Session Management**: Should sessions be created automatically per share or manually by photographer?
2. **Data Persistence**: Keep in-memory for MVP or add SQLite immediately?
3. **Conflict Resolution**: If two users favorite/unfavorite the same photo, which wins?
4. **Privacy**: Should users see each other's selections in real-time?
5. **Authentication**: Keep simple name-based or add proper user accounts?

## Recommended Decisions

1. **Auto-create sessions** - Simpler UX, one session per share
2. **In-memory for MVP** - Add persistence in Phase 3.2
3. **Last-write-wins** - Simple conflict resolution
4. **Private by default** - Dashboard only for photographer
5. **Name-based for MVP** - No accounts needed

---

## Success Metrics

- [ ] Client can review 500 photos in under 30 minutes
- [ ] Selections sync reliably (<1% data loss)
- [ ] Offline mode works for >1 hour
- [ ] Export completes in <10 seconds
- [ ] Works on mobile (iPad/iPhone)
- [ ] Photographer sees selections within 1 minute

---

**Next Step**: Implement Phase 3.1 MVP
