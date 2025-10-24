# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

**ShareDrop** - A file sharing application that allows users to share local folders via password-protected links without uploading files to the cloud. Files stay on the user's machine and are streamed directly to recipients.

**Tech Stack:**
- **Backend**: Go (standard library with `net/http`)
- **Frontend**: Vanilla HTML/CSS/JavaScript (embedded in Go templates)
- **Desktop App**: Electron wrapper
- **Tunneling**: Cloudflare Tunnel (optional, for internet access)
- **Target Platform**: macOS (designed for local testing on Mac, production deployment on Oracle Ubuntu server)

## Commands

### Build and Run
```bash
# Build the Go server binary
go build -o file-share-app main.go

# Run the application (launches server + Cloudflare tunnel if available)
./run-app.sh

# Run Electron app (Mac native wrapper)
npm start

# Build Mac .app distribution
npm run build:mac
```

### Testing
No automated test suite currently exists. Manual testing via:
```bash
./run-app.sh
# Then access http://localhost:8080 in browser
```

## Architecture

### Core Components

**1. Go HTTP Server (`main.go`)**
- Single-file monolithic server
- Embeds HTML templates as string constants (`passwordTemplate`, `browseTemplate`)
- Port: 8080 (hardcoded)

**2. State Management**
- In-memory storage via `App` struct:
  - `shares`: map[string]*Share - active share links
  - `downloadLogs`: []DownloadLog - download tracking
  - `mu`: sync.RWMutex - thread-safe access
- **No persistence** - all data lost on restart

**3. Key Data Structures**
- `Share`: Represents a shared folder with unique ID, password, and metadata
- `DownloadLog`: Tracks who downloaded what and when

**4. Electron Wrapper (`electron-main.js`)**
- Spawns Go server as child process
- Manages Cloudflare tunnel lifecycle
- Provides native folder picker dialog
- Serves `electron-ui.html` as UI

### Request Flow

```
User selects folder → POST /api/shares → Generate ID + password
                                      ↓
                          Return share link: /share/{ID}
                                      ↓
Recipient visits link → Password prompt → Browse files → Download
                                      ↓
                    Download logged with IP and timestamp
```

### Security Model

- **Password Protection**: Random 12-char password per share (base64url encoded)
- **Path Traversal Prevention**: `filepath.Clean()` validates all file paths against share root
- **No Authentication**: Shares never expire, no admin panel
- **Access Tracking**: Logs client IP + filename but doesn't enforce rate limits

## Important Implementation Details

### File Serving
- Direct file streaming via `http.ServeFile()` - no caching
- Multiple concurrent downloads trigger sequential file reads
- No zip/archive support for multi-file downloads (client downloads files individually)

### Cloudflare Tunnel Integration
- Automatically detects `cloudflared` binary at startup (`run-app.sh`)
- Spawns tunnel process and parses URL from stderr
- Electron app extracts tunnel URL and injects into share links
- Tunnel logs stored at `/tmp/cloudflared.log`

### Template Rendering
- Templates compiled at request time (no pre-compilation)
- Custom template function: `formatSize` - converts bytes to human-readable (KB, MB, etc.)

### Port Management
- `run-app.sh` kills existing process on port 8080 before starting
- No graceful shutdown handling

## Development Workflow

### Adding New Features
1. Modify `main.go` for backend changes
2. Update embedded HTML templates if UI changes needed
3. Rebuild: `go build -o file-share-app main.go`
4. Test with `./run-app.sh`

### Modifying Electron App
1. Edit `electron-main.js` or `electron-ui.html`
2. Test: `npm start`
3. Build distribution: `npm run build:mac`

### Deployment to Ubuntu Server
- Build for Linux: `GOOS=linux GOARCH=amd64 go build -o file-share-app main.go`
- Copy binary to server
- Ensure port 8080 accessible or configure reverse proxy
- Optional: Set up systemd service for auto-restart

## Constraints and Limitations

- No database - all state in memory
- No user authentication system
- Shares never expire (cleared only on restart)
- Single-threaded Go server (uses default `http.ListenAndServe`)
- No HTTPS - relies on Cloudflare tunnel for encryption
- Client-side download "select all" triggers sequential downloads with 100ms delay
- No mobile-optimized views beyond basic responsive CSS

## File Structure Notes

- `main.go` - Entire backend (427 lines including HTML templates)
- `electron-main.js` - Desktop app orchestration
- `electron-ui.html` - Native app UI
- `run-app.sh` - Server launcher with tunnel setup
- `file-share-app` - Compiled Go binary (gitignored)
- `ShareDrop.app` - Bundled Mac application
- No separate `static/` or `templates/` directories - all embedded
