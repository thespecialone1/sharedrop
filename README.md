# ShareDrop

**Share local folders instantly with password-protected links. No uploads, no cloud storage - files stay on your machine.**

*Built with AI assistance from Claude (Anthropic) via Warp Agent Mode.*

## Download

**[Download ShareDrop for Mac](https://github.com/YOURUSERNAME/sharedrop/releases)** 

Download `ShareDrop-Mac.zip` from the releases page.

## Features

- 🔒 Password-protected shares
- 📊 Real-time download monitoring  
- 🌐 Internet access via Cloudflare Tunnel
- 💻 Native Mac app
- 🚀 Files stay on your machine - no uploads

## Quick Start

1. Download and unzip `ShareDrop-Mac.zip`
2. Double-click `ShareDrop.app`
3. A notification shows your internet URL (if cloudflared is installed)
4. Browser opens to http://localhost:8080
5. Create a share by entering a folder path
6. **For internet sharing**: Replace `localhost:8080` in the link with your tunnel URL from the notification
7. Send link + password to your client

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

Built with Go. To run from source:

```bash
go build -o file-share-app main.go
./run-app.sh
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
