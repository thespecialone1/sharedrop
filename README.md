# ShareDrop

**Share local folders instantly with password-protected links. No uploads, no cloud storage - files stay on your machine.**

## 🚀 Quick Start

### For Users
1. Download `ShareDrop.dmg`
2. Drag to Applications
3. Launch and start sharing!

### For Developers
```bash
npm install && npm run build:mac
```

See [QUICK_START.md](QUICK_START.md) for details.

*Built with AI assistance from Claude (Anthropic) via Warp Agent Mode.*

## Download

### Latest Release: v1.0.0

**[📥 Download ShareDrop for Mac (Apple Silicon)](https://github.com/thespecialone1/sharedrop/releases/download/v1.0.0/ShareDrop-1.0.0-arm64.dmg)**

[View all releases](https://github.com/thespecialone1/sharedrop/releases) | [Changelog](CHANGELOG.md)

## Features

- 🔒 Password-protected shares
- 📊 Real-time download monitoring  
- 🌐 Internet access via Cloudflare Tunnel (optional)
- 💻 Native Mac app - **no installation required**
- 🚀 Files stay on your machine - no uploads
- ✅ **Zero dependencies** for local network sharing

## Quick Start

### Basic Setup (Local Network Only)
1. Download the DMG from releases
2. Open the DMG and drag ShareDrop to Applications
3. Double-click ShareDrop.app
4. **That's it!** No installation, no dependencies needed

### Internet Sharing (Optional)
To share files with anyone on the internet:

```bash
brew install cloudflare/cloudflare/cloudflared
```

Restart ShareDrop - it will automatically create public URLs.

**Note**: Internet sharing is optional. ShareDrop works perfectly on your local network without any additional setup.

## Getting Folder Paths

### Option 1: Copy Path (Easiest)
1. Right-click folder in Finder
2. Hold **Option** key  
3. Click "Copy as Pathname"
4. Paste into ShareDrop

### Option 2: Drag to Terminal
1. Open Terminal
2. Type `echo ` (with space)
3. Drag folder to Terminal window
4. Press Enter, copy the path shown

### Option 3: Type Common Paths
Replace `USERNAME` with yours:
```
/Users/USERNAME/Desktop
/Users/USERNAME/Documents
/Users/USERNAME/Downloads
/Users/USERNAME/Pictures
```

## Internet Sharing

To share with people outside your network, install Cloudflare Tunnel:

```bash
brew install cloudflare/cloudflare/cloudflared
```

Restart ShareDrop. It will auto-generate public URLs.

## How It Works

1. Select a folder on your Mac
2. ShareDrop creates a unique link + password
3. Share credentials with your client
4. Client browses and downloads files
5. Everything streams directly from your machine

## Development

### Prerequisites
- Go 1.21+
- Node.js 18+
- NPM

### Running from Source

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Build Backend**
   ```bash
   # Compiles to bin/file-share-app
   go build -o bin/file-share-app main.go
   ```

3. **Start Application**
   ```bash
   # Starts Electron + Go backend
   npm start
   ```

### Building for Production

```bash
# Build for macOS (Universal)
npm run build:mac

# Build for Windows
npm run build:win

# Build for Linux
npm run build:linux
```

## Tech Stack

- **Language**: Go
- **Framework**: Standard library (net/http)
- **Tunneling**: Cloudflare Tunnel (optional)
- **Platform**: macOS (Linux/Windows compatible)

## Credits

**Developed with AI assistance from Claude (Anthropic) via Warp**

## License

MIT License

---

*This project was created with help from Claude AI through Warp's Agent Mode.*
