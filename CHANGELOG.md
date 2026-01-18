# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-01-18

### Added

- **Core Features**
  - Local folder sharing via Cloudflare Quick Tunnel
  - Password-protected sessions with auto-generated 8-character codes
  - Real-time presence indicators (see who's connected)
  - Live text chat with message history and reactions
  - Session vault to store and redeploy previous shares

- **File Browsing**
  - Directory navigation with breadcrumb trail
  - Image and video previews (JPEG, PNG, HEIC, MP4, MOV, etc.)
  - Grid and list view modes
  - Search and sort functionality
  - Bulk download as ZIP

- **Desktop App**
  - Native macOS app (DMG) for Intel and Apple Silicon
  - Native Windows installer (NSIS EXE)
  - System tray integration
  - One-click start/stop controls

### Security

- All traffic tunneled through Cloudflare's secure infrastructure
- No files stored on external servers
- Password rotation without session restart
- Chat history wipe functionality
