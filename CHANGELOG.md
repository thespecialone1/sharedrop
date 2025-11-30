# Changelog

All notable changes to ShareDrop will be documented in this file.

## [1.3.0] - 2025-11-30

### 🎉 Major Features

#### Subfolder Navigation
- **Browse nested directories** within shared folders
- **Breadcrumb navigation** with "Root" link and path history
- **Back button** to navigate up one level
- **Security validation** prevents path traversal attacks
- Folders appear before files with 📁 icon
- Full support in both List and Grid views

#### Photo Gallery Grid Redesign
- **Masonry layout** preserves original aspect ratios (no cropping)
- **Actual image thumbnails** instead of generic file icons
- **Hover overlay** shows filename and action icons
- **Minimalist design** with 20px spacing for focus on photography
- **Icon-based controls**: ◉ Preview, ↓ Download, ☆ Favorite
- **Hover-visible checkboxes** for clean gallery view

#### Performance Optimizations
- **Image preloading**: Next/previous images load in background for instant navigation
- **GPU acceleration**: Hardware-accelerated transforms for 60fps scrolling
- **Content-visibility**: Only renders visible images for better performance
- **Faster transitions**: Reduced from 0.3s to 0.2s for snappier feel
- **Optimistic UI**: Favorite stars fill instantly before server response

### ✨ New Features

- **Clickable filenames** in list view to open preview directly
- **Localhost + Tunnel URLs** both displayed in Electron app
- **macOS hidden files filtering**: Automatically hides `._*` and `.DS_Store` files
- **WebSocket cleanup** before folder navigation (prevents notification spam)
- **Startup script** (`start.sh`) with force rebuild to prevent caching

### 🐛 Bug Fixes

- Fixed duplicate image count in preview (was counting both list and grid views)
- Fixed grid selection not working (checkboxes were hidden)
- Fixed `./start.sh` showing cached old builds
- Fixed "Real-time updates enabled" popup appearing on every folder navigation
- Fixed WebSocket normal closure logs (code 1000) spamming terminal
- Fixed missing `data-is-image` attribute in grid view
- Suppressed normal WebSocket navigation closures in logs

### 🎨 UI/UX Improvements

- **Better icons**: Replaced emoji icons with cleaner Unicode symbols
- **Grid checkboxes**: Appear on hover (opacity transition) instead of always visible
- **Instant feedback**: Favorite stars update immediately (optimistic UI)
- **Notification management**: "Real-time updates" shows once per session only
- **Clickable areas**: Filenames and thumbnails both clickable for preview

### 🔧 Technical Improvements

- Added `will-change` CSS hints for browser optimization
- Added `pointer-events: none` on hidden overlays to prevent interference
- Added `backface-visibility: hidden` for smoother animations
- Added `transform: translateZ(0)` to force GPU layer creation
- Improved media files array initialization (only scans list view once)
- Better WebSocket error handling (distinguishes normal vs abnormal closures)

### 📝 Documentation

- Created `QUICKSTART.md` - User guide for running the app
- Updated `start.sh` with rebuild step and comments
- Added inline code comments for security validations

---

## [1.2.1] - 2024-10-XX (Previous Release)

### Features
- Universal binary support for Mac (Intel + Apple Silicon)
- Photographer dashboard with analytics
- Real-time collaboration features
- WebSocket-based live updates
- Chat system for client-photographer communication
- Photo selection, favorites, and tagging
- CSV/JSON export of selections
- Thumbnail caching for performance

### Platforms
- macOS (Universal Binary - Intel + Apple Silicon)
- Windows (x64)
- Linux (x64)

---

## How to Use This Changelog

- **[Version]** indicates the release version
- **🎉 Major Features** are significant new capabilities
- **✨ New Features** are smaller additions
- **🐛 Bug Fixes** are resolved issues
- **🎨 UI/UX** are visual and interaction improvements
- **🔧 Technical** are under-the-hood improvements
- **📝 Documentation** are docs and guides

---

## Version Numbering

ShareDrop follows [Semantic Versioning](https://semver.org/):
- **Major (X.0.0)**: Breaking changes or major rewrites
- **Minor (1.X.0)**: New features, backwards compatible
- **Patch (1.2.X)**: Bug fixes, minor improvements
