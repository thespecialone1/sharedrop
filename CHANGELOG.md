# Changelog

All notable changes to ShareDrop will be documented in this file.

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
