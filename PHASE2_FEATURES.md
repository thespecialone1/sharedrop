# Phase 2 Features - To Be Implemented

## 🔍 Search & Filtering
- Real-time search box in browse page
- Filter by file type (images, videos, documents)
- Sort by name, size, date
- Search in current view (list/grid)

## 💾 Thumbnail Caching
- Generate thumbnails once on share creation
- Store in temp directory (.sharedrop/cache/)
- Serve cached thumbnails on subsequent requests
- Clear cache on share expiration/deletion
- Configurable cache size limit

## 💬 Comments & Annotations
- Comment thread per file
- Reply to comments
- Timestamp and username
- Store in memory (lost on restart)
- Optional: Export comments to JSON

## Implementation Notes

### Search Implementation
```javascript
// Add to browse page
function filterFiles(searchTerm) {
    const items = document.querySelectorAll('.file-item, .grid-item');
    items.forEach(item => {
        const filename = item.getAttribute('data-filename').toLowerCase();
        if (filename.includes(searchTerm.toLowerCase())) {
            item.style.display = '';
        } else {
            item.style.display = 'none';
        }
    });
}
```

### Thumbnail Cache Structure
```go
type ThumbnailCache struct {
    cache map[string][]byte // shareID/filename -> thumbnail data
    mu    sync.RWMutex
}
```

### Comments Structure  
```go
type Comment struct {
    ID        string
    ShareID   string
    FileName  string
    Author    string
    Text      string
    CreatedAt time.Time
    ParentID  string // For replies
}
```

## Priority Order
1. Search & Filtering (High impact, low complexity)
2. Thumbnail Caching (Performance improvement)
3. Comments System (Complex, requires UI changes)
