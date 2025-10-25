# Database Persistence Implementation

## Overview
ShareDrop now uses SQLite for persistent storage of all application data. Data is automatically saved to `sharedrop.db` and loaded on application startup.

## What's Persisted

### 1. Shares
- Share ID, session name, folder path, password
- Creation timestamp, expiration timestamp
- Access count

### 2. Photo Selections
- User favorites and tags per photo
- User name, file name associations
- Selection timestamps

### 3. Comments
- User comments on photos
- Comment threads (parent-child relationships)
- Author and timestamps

### 4. Sessions
- Share session metadata
- Multi-user settings
- Active users list

## Database Schema

```sql
-- Shares table
CREATE TABLE shares (
    id TEXT PRIMARY KEY,
    session_name TEXT,
    folder_path TEXT,
    password TEXT,
    created_at DATETIME,
    expires_at DATETIME,
    access_count INTEGER
);

-- Photo selections table
CREATE TABLE photo_selections (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    share_id TEXT,
    file_name TEXT,
    user_name TEXT,
    is_favorite BOOLEAN,
    tags TEXT,  -- JSON array
    timestamp DATETIME
);

-- Comments table
CREATE TABLE comments (
    id TEXT PRIMARY KEY,
    share_id TEXT,
    file_name TEXT,
    author TEXT,
    text TEXT,
    created_at DATETIME,
    parent_id TEXT
);

-- Sessions table
CREATE TABLE sessions (
    share_id TEXT PRIMARY KEY,
    session_name TEXT,
    allow_multi_user BOOLEAN,
    active_users TEXT,  -- JSON array
    created_at DATETIME
);
```

## Key Functions

### Initialization
- `InitDB()` - Creates database and tables
- `LoadFromDB()` - Loads all data on startup

### Save Functions
- `SaveShare(*Share)` - Saves/updates share
- `SaveSelection(*PhotoSelection)` - Saves/updates photo selection
- `SaveComment(*Comment)` - Saves comment
- `SaveSession(*ShareSession)` - Saves/updates session

## Automatic Persistence

Data is automatically saved when:
- A new share is created
- A user favorites/unfavorites a photo
- A user adds/removes tags
- A comment is posted
- Access count is incremented

## Database Location

The SQLite database file is created in the application directory:
```
./sharedrop.db
```

## Benefits

1. **Survives Restarts** - All data persists across application restarts
2. **No Data Loss** - Selections and comments are never lost
3. **Multi-Session Support** - Users can return later and see their previous selections
4. **Photographer Dashboard** - Photographers can review all client selections even after restart

## Migration Notes

- First run will create the database automatically
- Existing in-memory data is now saved to disk
- No manual migration needed - database is created on first startup

## Backup

To backup all data, simply copy the `sharedrop.db` file:
```bash
cp sharedrop.db sharedrop-backup-$(date +%Y%m%d).db
```

## Dependencies

- `github.com/mattn/go-sqlite3` - SQLite driver for Go

Install with:
```bash
go get github.com/mattn/go-sqlite3
```
