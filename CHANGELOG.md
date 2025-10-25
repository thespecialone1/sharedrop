# Changelog

All notable changes to ShareDrop will be documented in this file.

## [3.2.0] - 2025-10-25

### ✨ Phase 3.2A - Quick Wins (Collaboration Features)
- **Session Naming**: Name sessions (e.g., "Smith Wedding 2025") for easy identification
- **Username Validation**: No duplicate usernames - enforced at server level
- **Comment Count Badges**: "Comments (3)" shows exactly which photos have discussion
- **Favorite Count Display**: "★ 3 favorites" shows how many people favorited each photo
- **Hover Tooltips**: See who favorited ("Favorited by: Sarah, John, Mom")
- **Active Users Tracking**: Server tracks who's currently reviewing

### 🔗 New API Endpoints
- `POST /api/sessions/validate-name` - Validate username uniqueness
- `GET /api/comments/count` - Get comment count per file
- `GET /api/selections/counts` - Get favorite counts for all files

### 💡 Real-Time Awareness
- Everyone sees how many people favorited each photo
- Comment counts update after posting
- Favorite counts update after favoriting
- Users can't take each other's names

### 📊 Dashboard Improvements
- Session name displayed prominently in orange
- Clearer session identification

---

## [3.1.0] - 2025-10-25

### ✨ UX Improvements & Photographer Dashboard
- **Photographer Dashboard**: New `/dashboard/{shareID}` route showing all selections
- **Grid Responsiveness**: Fixed image cropping (object-fit: contain)
- **Tag Visibility**: Color-coded tags (Album=Blue, Print=Green, Social=Purple, Skip=Red)
- **Save Indicator**: "Saving..."/"All changes saved" status in selection bar
- **Tag Clarity**: Renamed "Pass" to "Skip" for better understanding
- **Persistence Confirmed**: localStorage ensures selections survive browser close

### 📋 Photographer Dashboard Features
- **Overview Stats**: Total photos, reviewers, selections at a glance
- **User Summary**: Per-user favorites and tag counts
- **Selections Table**: Complete table with user, file, favorite, tags, timestamp
- **Quick Export**: Export CSV/JSON directly from dashboard
- **Gallery Link**: Jump to client view from dashboard
- **No Password**: Easy access for photographers

### 📖 Documentation
- **PHOTOGRAPHER_GUIDE.md**: Complete workflow guide
- Answers all UX questions (persistence, CSV usage, etc.)
- Email template for sending to clients
- Excel analysis tips and formulas
- FAQ section covering common scenarios
- Troubleshooting guide

---

## [3.0.0] - 2025-10-25

### ✨ Phase 3.1 - Wedding Photography Review Features (MVP)
- **User Identification**: Welcome modal prompts for user name on first visit
- **Favorite Star Button**: Click star (☆/★) to mark photos as favorites
- **Quick Tags**: Tag photos with Album, Print, Social, or Pass
- **Selection Counter**: Sticky bar shows favorite count when selections exist
- **CSV/JSON Export**: Export all selections with user, favorites, tags, and timestamps
- **Local Storage Sync**: Selections persist in browser and sync with server
- **Multi-User Support**: Multiple reviewers can independently select favorites
- **Real-time Updates**: Star and tag changes instantly saved to server

### 🎨 UI Improvements - Emoji Removal
- Removed all emojis from UI (💦, 🔍, 💬, 📄)
- Replaced with clean text labels and Unicode symbols (☆/★)
- Professional, distraction-free interface
- Better accessibility and consistency

### 🛠️ Technical - Phase 3.1
- `PhotoSelection` struct with favorites, tags, user, and timestamp
- `ShareSession` struct for multi-user session management
- Selection API: `POST /api/selections`, `GET /api/selections/get`, `GET /api/selections/export`
- localStorage + sessionStorage for offline-first experience
- Tag pills with active state styling
- Export formats: CSV (Excel-compatible) and JSON

### 📊 Wedding Photography Workflow
1. Photographer shares folder → generates link
2. Client opens link → enters password → enters name
3. Client browses photos → clicks stars to favorite → adds tags
4. Selection counter updates in real-time
5. Client exports selections as CSV/JSON
6. Multiple clients (bride, groom, mom) can review independently

---

## [2.0.0] - 2025-10-25

### ✨ Phase 2 Features
- **Real-time Search**: Search box with live filtering of files by name
- **File Type Filters**: Filter by file type (All, Images, Videos, Documents)
- **Sorting Options**: Sort files by name (A-Z, Z-A) or size (smallest/largest)
- **Thumbnail Caching**: Generated thumbnails are now cached in memory for instant serving
- **Comments System**: Add comments to any file with author name and timestamp
- **Comments API**: `/api/comments` (POST) and `/api/comments/get` (GET) endpoints

### 🎨 UI Improvements
- Search box with 🔍 icon in controls bar
- Dropdown filters for file type and sorting
- Comment button (💬) on each file in both list and grid views
- Comments modal with threaded display and timestamp formatting

### 🛠️ Technical
- `ThumbnailCache` struct with thread-safe read/write locks
- `Comment` struct for storing file comments in memory
- Enhanced file items with `data-size`, `data-is-image`, `data-is-video` attributes
- JavaScript filtering and sorting functions working on both list and grid views
- XSS protection via HTML escaping in comment rendering

---

## [1.2.0] - 2025-10-25

### ✨ New Features
- **Link Expiration**: Set expiration time for shares (hours/days or never expires)
- **Automatic Cleanup**: Expired links show "Share Expired" message
- **Expiration API**: Backend accepts `expires_in_mins` parameter

### 📝 Planned for Phase 2
- Search & filtering for files
- Thumbnail caching on sender's machine
- Comments/annotations for collaborative review
- Active shares list in Electron app
- Improved cloudflared detection UI

---

## [1.1.0] - 2025-10-25

### 🐛 Bug Fixes
- **HEIC/HEIF Support**: iPhone photos now show thumbnails and previews using macOS `sips` conversion
- **DNG/RAW Support**: Added support for DNG, CR2, NEF, ARW camera raw formats
- **Cloudflare Popup**: Fixed timing to only show warning after 8 seconds if tunnel fails to connect
- **Thumbnail Loading**: Fixed URL encoding issues causing thumbnails to fail on files with special characters
- **Preview Modal**: Fixed onclick handlers to work with all filename types

### ✨ New Features
- **Arrow Navigation**: Navigate through images/videos using on-screen arrows or keyboard (← →)
- **Image Counter**: Shows current position (e.g. "3 / 15") in preview modal
- **Media Previews**: Click images/videos to view in fullscreen modal
- **Thumbnails**: Automatic generation for all images and videos
- **Grid View**: Pinterest-style layout perfect for photo galleries
- **List View**: Traditional file list with inline thumbnails
- **HEIC Support**: Native support for iPhone photos (.heic, .heif)
- **RAW Support**: Support for camera RAW files (.dng, .cr2, .nef, .arw)
- **Video Player**: Inline HTML5 video player with controls

### 🎨 UI Improvements
- Dual view modes (List/Grid) with toggle button
- Fullscreen preview modal with ESC key support
- Arrow navigation buttons (‹ ›) on left/right sides of preview
- Counter badge showing current/total media files
- Disabled state for arrows at first/last image
- Lazy loading for better performance
- Responsive layout for all screen sizes
- Semi-transparent navigation controls

### 🛠️ Technical
- Added `/thumbnail/:shareID/:filename` endpoint
- Added `/preview/:shareID/:filename` endpoint
- Added `/api/check-cloudflared` endpoint
- HEIC/HEIF conversion using native macOS `sips` command
- DNG/CR2/NEF/ARW conversion using `sips` command
- Video thumbnails using ffmpeg (optional)
- Browser caching for thumbnails (1 hour)
- Dynamic thumbnail loading with proper URL encoding
- Media file array for sequential navigation

### ⌨️ Keyboard Shortcuts
- **ESC**: Close preview modal
- **← Left Arrow**: Previous image/video
- **→ Right Arrow**: Next image/video

### 📸 Supported Formats

**Images:**
- JPEG, JPG, PNG, GIF, BMP, WebP
- HEIC, HEIF (iPhone photos)
- DNG, CR2, NEF, ARW (Camera RAW)

**Videos:**
- MP4, WebM, OGG, MOV, AVI, MKV

---

## [1.0.0] - 2025-10-24

### Added
- 🚀 Initial release of ShareDrop
- 🔒 Password-protected folder sharing
- 📊 Real-time download monitoring with IP tracking
- 🌐 Internet sharing via Cloudflare Tunnel integration
- 💻 Native macOS application with Electron
- 🎨 Dark mode UI with modern design
- 📁 Native folder picker dialog
- ⚡ Direct file streaming (no uploads required)
- 🔗 Automatic public URL generation when cloudflared is installed

### Technical Details
- Built with Go (standard library)
- Electron-based desktop wrapper
- In-memory state management
- No external dependencies required (cloudflared optional)
- Files never leave your machine

### Known Limitations
- macOS only (Linux/Windows support planned)
- No persistence - shares cleared on restart
- No share expiration management
- Sequential file downloads only

---

## Download

**[Download ShareDrop v1.0.0 for Mac (Apple Silicon)](https://github.com/thespecialone1/sharedrop/releases/download/v1.0.0/ShareDrop-1.0.0-arm64.dmg)**

For Intel Macs, see releases page.
