# ShareDrop - Cross-Platform Build Instructions

## 📦 Building for Different Platforms

### Prerequisites
- **Go** 1.21+ installed
- **Node.js** 18+ installed
- **npm** installed

---

## 🍎 Build for macOS

### Requirements:
- macOS computer (can build from Mac only)
- `sips` command (built-in to macOS)

### Build:
```bash
./build-mac.sh
```

**Output:**
- `dist/ShareDrop-1.1.0-arm64.dmg` (Apple Silicon)
- `dist/mac-arm64/ShareDrop.app`

### Optional for HEIC thumbnails:
✅ **Built-in** - No additional software needed (uses `sips`)

### Optional for Video thumbnails:
```bash
brew install ffmpeg
```

---

## 🪟 Build for Windows

### Requirements:
- Any OS (can cross-compile)
- For HEIC support: **ImageMagick** installed on Windows

### Build from macOS/Linux:
```bash
# 1. Build Windows binary
GOOS=windows GOARCH=amd64 go build -o file-share-app.exe main.go

# 2. Build Electron app
npm run build:win
```

**Output:**
- `dist/ShareDrop Setup 1.1.0.exe` (Installer)
- `dist/ShareDrop 1.1.0.exe` (Portable)

### On Windows machine:

```powershell
# 1. Build Go binary
go build -o file-share-app.exe main.go

# 2. Build Electron app
npm run build:win
```

### Optional for HEIC thumbnails:
Install **ImageMagick**:
```powershell
winget install ImageMagick.ImageMagick
```

Or download from: https://imagemagick.org/script/download.php

### Optional for Video thumbnails:
```powershell
winget install ffmpeg
```

### Cloudflare Tunnel for Windows:
Download from: https://github.com/cloudflare/cloudflared/releases

Install:
```powershell
cloudflared.exe service install
```

---

## 🐧 Build for Linux

### Requirements:
- Linux machine or VM
- ImageMagick for HEIC support

### Build:
```bash
# 1. Build Go binary
GOOS=linux GOARCH=amd64 go build -o file-share-app main.go

# 2. Build Electron app
npm run build:linux
```

**Output:**
- `dist/ShareDrop-1.1.0.AppImage`

### Optional for HEIC thumbnails:
```bash
# Ubuntu/Debian
sudo apt install imagemagick

# Fedora/RHEL
sudo dnf install ImageMagick

# Arch
sudo pacman -S imagemagick
```

### Optional for Video thumbnails:
```bash
# Ubuntu/Debian
sudo apt install ffmpeg

# Fedora/RHEL
sudo dnf install ffmpeg

# Arch
sudo pacman -S ffmpeg
```

### Cloudflare Tunnel for Linux:
```bash
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared
```

---

## 🌐 Platform Differences

### Supported Features by Platform:

| Feature | macOS | Windows | Linux |
|---------|-------|---------|-------|
| Basic file sharing | ✅ | ✅ | ✅ |
| JPG/PNG thumbnails | ✅ | ✅ | ✅ |
| HEIC thumbnails | ✅ (built-in) | ⚠️ (needs ImageMagick) | ⚠️ (needs ImageMagick) |
| RAW thumbnails (DNG, CR2, etc.) | ✅ (built-in) | ⚠️ (needs ImageMagick) | ⚠️ (needs ImageMagick) |
| Video thumbnails | ⚠️ (needs ffmpeg) | ⚠️ (needs ffmpeg) | ⚠️ (needs ffmpeg) |
| Cloudflare Tunnel | ✅ | ✅ | ✅ |

---

## 🔧 Cross-Compilation

You can build for multiple platforms from a single machine:

### From macOS:
```bash
# Build for all platforms
./build-all.sh

# Or manually:
# macOS
./build-mac.sh

# Windows
GOOS=windows GOARCH=amd64 go build -o file-share-app.exe main.go
npm run build:win

# Linux
GOOS=linux GOARCH=amd64 go build -o file-share-app main.go
npm run build:linux
```

### From Windows:
```powershell
# Windows
go build -o file-share-app.exe main.go
npm run build:win

# macOS (cross-compile Go binary only)
$env:GOOS="darwin"; $env:GOARCH="arm64"; go build -o file-share-app main.go

# Linux
$env:GOOS="linux"; $env:GOARCH="amd64"; go build -o file-share-app main.go
npm run build:linux
```

---

## 📝 Notes

### HEIC/RAW Support:

**macOS:**
- Uses built-in `sips` command
- No additional software needed
- Works out of the box

**Windows/Linux:**
- Requires **ImageMagick** to be installed
- Without ImageMagick:
  - HEIC files will show in file list
  - Thumbnails won't generate
  - Preview won't work
  - Download still works fine

### Installation Commands:

The app automatically detects the platform and shows the correct installation command for Cloudflare Tunnel:

- **macOS**: `brew install cloudflare/cloudflare/cloudflared`
- **Windows**: Download link + service install command
- **Linux**: wget + chmod command

---

## 🚀 Quick Start for Users

### macOS Users:
1. Download `ShareDrop-1.1.0-arm64.dmg`
2. Open DMG, drag ShareDrop to Applications
3. Launch from Applications
4. (Optional) Install cloudflared: `brew install cloudflare/cloudflare/cloudflared`

### Windows Users:
1. Download `ShareDrop Setup 1.1.0.exe`
2. Run installer
3. Launch ShareDrop from Start Menu
4. (Optional) Install ImageMagick for HEIC support
5. (Optional) Download cloudflared from GitHub

### Linux Users:
1. Download `ShareDrop-1.1.0.AppImage`
2. Make executable: `chmod +x ShareDrop-1.1.0.AppImage`
3. Run: `./ShareDrop-1.1.0.AppImage`
4. (Optional) Install ImageMagick: `sudo apt install imagemagick`

---

## 🐛 Troubleshooting

### "HEIC format not supported" error (Windows/Linux):
- Install ImageMagick
- Restart ShareDrop
- Try again

### Video thumbnails not showing:
- Install ffmpeg
- Restart ShareDrop
- Videos will still play, just no thumbnail preview

### Cloudflare tunnel not starting:
- Check if cloudflared is installed
- Check if it's in PATH
- Try manual installation using commands from the app

---

## 📊 File Size Comparison

Approximate sizes:
- **macOS DMG**: ~111 MB
- **Windows Installer**: ~120 MB
- **Windows Portable**: ~110 MB
- **Linux AppImage**: ~115 MB

All include:
- Go backend binary
- Electron wrapper
- Node.js runtime
- Chromium engine
