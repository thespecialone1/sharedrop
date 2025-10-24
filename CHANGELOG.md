# Changelog

All notable changes to ShareDrop will be documented in this file.

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
