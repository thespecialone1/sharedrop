# ShareDrop Quick Start

## 🚀 Starting the App

**Option 1 - Simple (Recommended):**
```bash
./start.sh
```

**Option 2 - Direct:**
```bash
npm start
```

**That's it!** One command does everything:
- ✅ Starts Go backend server
- ✅ Starts Electron desktop app  
- ✅ Starts Cloudflare tunnel (if available)
- ✅ Opens the app window

## 🛑 Stopping the App

Just close the ShareDrop window or press `Ctrl+C` in the terminal.

## ⚠️ Troubleshooting

### "Address already in use" error

Someone is already using port 8080. Kill all instances:
```bash
pkill -f "file-share-app"
pkill -f "go run main.go"
```

Then start again with `npm start`.

### "Server is not ready" error

Wait 2-3 seconds after the app opens, then try creating a share. The Go server takes a moment to start.

## 📝 Development Notes

- **DO NOT** run `go run main.go` manually - `npm start` does this for you
- The app automatically compiles and runs the Go backend
- Logs appear in the terminal where you ran `npm start`
- Server runs on: http://localhost:8080
- Tunnel URL shows in the app after startup

## 🔧 Advanced

**Run server only (no Electron UI):**
```bash
go run main.go
```
Then open http://localhost:8080 in your browser.

**Build standalone app:**
```bash
npm run build
```
