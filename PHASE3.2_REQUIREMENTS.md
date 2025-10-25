# Phase 3.2 Requirements - Advanced Features

## Critical Features Needed

### 1. Real-Time Visibility ⚡
**Problem**: Users can't see each other's favorites
**Solution**: Show public favorite indicators

#### Implementation:
```go
// Add to PhotoSelection struct
type PhotoSelection struct {
    // ... existing fields
    IsPublic bool `json:"is_public"` // Should this be visible to others?
}

// UI: Show favorite count per photo
"★ 3" // 3 people favorited this
```

#### UI Changes:
- Below each photo: "★ 3 favorites" (clickable to see names)
- Modal shows: "Favorited by: Sarah, John, Mom"
- Real-time updates via polling or WebSockets

### 2. Comment Count Indicators 💬
**Problem**: No way to know which photos have comments
**Solution**: Show count on button

#### Implementation:
```html
<!-- Current -->
<button>Comments</button>

<!-- New -->
<button>Comments (3)</button>  <!-- If 3 comments exist -->
<button>Comments</button>       <!-- If 0 comments -->
```

#### Badge Style:
```css
.comment-badge {
    background: #ef4444;
    color: white;
    border-radius: 50%;
    padding: 2px 6px;
    font-size: 10px;
    margin-left: 4px;
}
```

### 3. Unique Username Enforcement 🔒
**Problem**: Two users can have same name → data conflicts
**Solution**: Server-side name validation

#### Implementation:
```go
// API endpoint
POST /api/sessions/claim-name
{
    "share_id": "abc123",
    "user_name": "Sarah"
}

// Response
{
    "success": true,
    "token": "user-session-token"
}
// OR
{
    "success": false,
    "error": "Name already taken. Try: Sarah2, SarahB, etc."
}
```

#### Track Active Users:
```go
type ShareSession struct {
    ShareID        string
    SessionName    string
    ActiveUsers    []string  // ["Sarah", "John", "Mom"]
    CreatedAt      time.Time
}
```

### 4. Session Management 💾

#### A. Save Session
```go
type SessionExport struct {
    SessionName  string
    ShareID      string
    FolderPath   string
    CreatedAt    time.Time
    Selections   []PhotoSelection
    Comments     []Comment
    Users        []string
}

// API
GET /api/sessions/export/:shareID
// Returns JSON file with ALL data
```

#### B. Import Session
```go
// When creating new share
POST /api/shares
{
    "folder_path": "/path/to/photos",
    "session_name": "Smith Wedding 2025",
    "import_session": "/path/to/previous-session.json"  // Optional
}

// Server:
// 1. Create new shareID + password
// 2. Load previous selections/comments
// 3. Associate with new share
// 4. Return new credentials
```

#### C. Session Naming
```go
POST /api/shares
{
    "folder_path": "/path/to/photos",
    "session_name": "Smith Wedding - Final Review",
    "expires_in_mins": 0
}

// Response includes session_name
{
    "id": "newABC",
    "password": "newPass",
    "session_name": "Smith Wedding - Final Review",
    "dashboard_url": "/dashboard/newABC"
}
```

### 5. CSV Import to Dashboard 📥

#### UI in Dashboard:
```html
<div class="import-section">
    <h3>Import Selections</h3>
    <input type="file" accept=".csv,.json" id="importFile">
    <button onclick="importSelections()">Import</button>
    <p>Upload CSV/JSON from client to restore their selections</p>
</div>
```

#### API:
```go
POST /api/sessions/import/:shareID
Content-Type: multipart/form-data

// Parses CSV/JSON
// Creates PhotoSelection records
// Returns count of imported selections
```

---

## Technical Architecture

### Real-Time Updates

**Option A: Polling (Simple)**
```javascript
// Client polls every 5 seconds
setInterval(() => {
    fetchFavoriteCounts();
    fetchCommentCounts();
}, 5000);
```

**Option B: WebSockets (Better)**
```go
// Use gorilla/websocket
// Broadcast updates to all connected clients
// When user favorites → notify all others
```

**Recommendation**: Start with polling, upgrade to WebSockets in Phase 3.3

### Database Persistence

**Problem**: In-memory data lost on restart
**Solution**: Add SQLite

```go
import "github.com/mattn/go-sqlite3"

// Initialize DB
func (app *App) InitDB() {
    db, _ := sql.Open("sqlite3", "./sharedrop.db")
    
    // Create tables
    db.Exec(`
        CREATE TABLE IF NOT EXISTS photo_selections (
            id TEXT PRIMARY KEY,
            share_id TEXT,
            file_name TEXT,
            user_name TEXT,
            is_favorite BOOLEAN,
            tags TEXT,  -- JSON array
            timestamp DATETIME
        )
    `)
    
    db.Exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            share_id TEXT PRIMARY KEY,
            session_name TEXT,
            folder_path TEXT,
            password TEXT,
            created_at DATETIME,
            active_users TEXT  -- JSON array
        )
    `)
}
```

---

## Implementation Priority

### Phase 3.2A (Quick Wins - 2-3 hours)
1. ✅ Comment count indicators
2. ✅ Favorite count per photo (read-only)
3. ✅ Session naming
4. ✅ Username uniqueness check

### Phase 3.2B (Core Features - 4-6 hours)
1. ✅ Real-time favorite updates (polling)
2. ✅ Session export/import
3. ✅ SQLite persistence
4. ✅ CSV import to dashboard

### Phase 3.2C (Polish - 2-3 hours)
1. ✅ "Favorited by" modal
2. ✅ Active users list
3. ✅ Session history view
4. ✅ Better error messages

---

## Detailed Feature Specs

### Feature: Favorite Count Display

**UI**:
```
┌──────────────────────────┐
│ IMG_0234.jpg             │
│ 238.6 KB                 │
│                          │
│ ★ 3 favorites            │ ← New
│ (Sarah, John, Mom)       │ ← New
│                          │
│ [☆ Favorite] [Preview]   │
└──────────────────────────┘
```

**API**:
```go
GET /api/selections/stats/:shareID/:fileName
Response:
{
    "favorite_count": 3,
    "favorited_by": ["Sarah", "John", "Mom"],
    "comment_count": 2,
    "tags": {
        "Album": 2,
        "Print": 1
    }
}
```

### Feature: Username Validation

**Flow**:
```
1. User enters name: "Sarah"
2. Click Continue
3. POST /api/sessions/validate-name
4. Server checks: Is "Sarah" already active?
5. If yes: "Name taken. Try Sarah2 or SarahBride"
6. If no: Register name, return success
```

**Server State**:
```go
type ActiveSession struct {
    ShareID     string
    Users       map[string]time.Time  // username -> last_active
}

// Clean up inactive users (>30 min)
func (app *App) CleanInactiveUsers() {
    // Run every 5 minutes
    // Remove users not active in last 30 min
}
```

### Feature: Session Import

**Workflow**:
```
SCENARIO: Photographer did initial review with couple,
now wants to share with extended family but keep existing favorites

1. Photographer creates share "Smith_Wedding_Initial"
2. Sarah & John review, favorite 50 photos
3. Photographer exports: smith_initial.json
4. 2 weeks later: Create NEW share for family
   - POST /api/shares with import_session=smith_initial.json
5. New shareID + password generated
6. But Sarah & John's 50 favorites already there!
7. Family adds their favorites on top
```

**Implementation**:
```go
func (app *App) CreateShareWithImport(req CreateShareRequest) (*Share, error) {
    // 1. Create new share
    share := createShare(req.FolderPath)
    
    // 2. If import requested
    if req.ImportSession != "" {
        sessionData := loadSessionFile(req.ImportSession)
        
        // 3. Copy selections to new shareID
        for _, sel := range sessionData.Selections {
            newSel := sel
            newSel.ShareID = share.ID  // Update to new share
            newSel.SessionID = share.ID
            app.selections = append(app.selections, newSel)
        }
        
        // 4. Copy comments
        for _, comment := range sessionData.Comments {
            newComment := comment
            newComment.ShareID = share.ID
            app.comments = append(app.comments, newComment)
        }
    }
    
    return share, nil
}
```

---

## Updated Data Structures

```go
type Share struct {
    ID           string
    SessionName  string     // NEW: "Smith Wedding 2025"
    FolderPath   string
    Password     string
    CreatedAt    time.Time
    ExpiresAt    *time.Time
    AccessCount  int
    ParentSession string    // NEW: ID of imported session
}

type PhotoSelection struct {
    ID         string
    SessionID  string
    ShareID    string
    FileName   string
    UserName   string
    IsFavorite bool
    Tags       []string
    Timestamp  time.Time
    IsPublic   bool        // NEW: Show to others?
}

type ActiveUser struct {
    ShareID    string
    UserName   string
    LastActive time.Time
    SessionToken string
}
```

---

## New API Endpoints

```
POST   /api/sessions/validate-name  - Check if username available
POST   /api/sessions/import          - Import CSV/JSON
GET    /api/selections/stats/:id     - Get favorite/comment counts per file
GET    /api/sessions/active-users    - List active users in session
POST   /api/shares (enhanced)        - Now accepts session_name, import_session
```

---

## UI Mockups

### Photo with Indicators
```
┌─────────────────────────────────┐
│ [Checkbox] [Thumbnail]          │
│                                 │
│ IMG_0234.jpg                    │
│ 238.6 KB                        │
│                                 │
│ 👥 3 favorites (Sarah, John...) │ ← NEW
│ 💬 2 comments                   │ ← NEW
│                                 │
│ Tags: [Album] [Print]           │
│                                 │
│ [☆] [Preview] [Comments (2)]    │
└─────────────────────────────────┘
```

### Dashboard Session Management
```
┌──────────────────────────────────┐
│ PHOTOGRAPHER DASHBOARD            │
│                                  │
│ Session: Smith Wedding 2025      │ ← NEW
│ Created: 2025-10-25              │
│                                  │
│ [Export Session] [Import CSV]    │ ← NEW
│                                  │
│ Active Users (3):                │ ← NEW
│ • Sarah (2 min ago)              │
│ • John (5 min ago)               │
│ • Mom (10 min ago)               │
│                                  │
│ Stats: 500 photos, 97 selections │
└──────────────────────────────────┘
```

---

## Timeline Estimate

- **Phase 3.2A** (Quick wins): 2-3 hours
- **Phase 3.2B** (Core features): 4-6 hours
- **Phase 3.2C** (Polish): 2-3 hours

**Total**: 8-12 hours of development

---

## Questions to Answer

1. **Real-time method**: Polling every 5 sec or WebSockets?
   - **Recommendation**: Polling (simpler, works everywhere)

2. **Persistence**: SQLite or JSON files?
   - **Recommendation**: SQLite (better for queries)

3. **Username conflicts**: Block or suggest alternatives?
   - **Recommendation**: Suggest (e.g., "Sarah2", "SarahB")

4. **Session import**: Full import or selective?
   - **Recommendation**: Full (simpler, photographer can filter in Excel)

5. **Active user timeout**: How long before "inactive"?
   - **Recommendation**: 30 minutes

---

## Next Steps

**Would you like me to**:
1. **Implement Phase 3.2A first** (comment counts, session naming - quick wins)
2. **Implement full Phase 3.2B** (real-time, persistence - more complex)
3. **Create detailed implementation plan** for your review first

**My recommendation**: Start with **3.2A** (2-3 hours) to get immediate value, then tackle 3.2B once you test those features.

What would you prefer?
