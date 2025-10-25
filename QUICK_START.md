# ShareDrop - Quick Start Guide

## 🚀 One-Command Build

```bash
npm install && npm run build:mac
```

Your distributable app will be in: `dist/ShareDrop.dmg`

---

## ✅ What's Included

The build process automatically:
- ✅ Compiles Go server binary with SQLite support
- ✅ Packages everything into a Mac .app
- ✅ Creates a .dmg installer
- ✅ Makes the app completely portable

**Users get:**
- Native Mac application
- No installation required (just drag to Applications)
- No dependencies needed
- Database automatically created on first run
- All features work out of the box

---

## 📦 Distribution

### Send to Users
1. Upload `dist/ShareDrop.dmg` to file sharing service (Dropbox, Google Drive, etc.)
2. Share the download link
3. Users double-click to install
4. Done! ✨

### Optional: Cloudflared
Users can optionally install cloudflared for internet access:
```bash
brew install cloudflare/cloudflare/cloudflared
```
Not required - app works perfectly fine locally.

---

## 🎯 What Users Can Do

### Without Cloudflared (Default)
✅ Share photos on local network  
✅ Password-protected links  
✅ Client photo selection with stars/tags  
✅ Comments on photos  
✅ Photographer dashboard  
✅ Export selections as CSV/JSON  
✅ All data persisted in SQLite  

### With Cloudflared (Optional)
✅ All of the above +  
✅ Share links work over internet  
✅ Clients can access from anywhere  

---

## 🔄 Build Workflow

```
npm install          # Install Node.js dependencies (one time)
    ↓
npm run prebuild     # Compile Go binary (automatic in build)
    ↓
npm run build:mac    # Package everything into .dmg
    ↓
dist/ShareDrop.dmg   # Ready to distribute!
```

---

## 💾 Data Persistence

✅ SQLite database created automatically  
✅ Location: `sharedrop.db` (in app directory)  
✅ Stores:
  - All shares
  - Client selections (favorites/tags)
  - Comments
  - Session data
✅ Survives app restarts  
✅ No manual setup required  

---

## 🛠️ Troubleshooting

### Build fails
- Ensure Go is installed: `go version`
- Ensure Node is installed: `node --version`
- Run: `npm install` first

### Binary not found
- Check: `ls -lh file-share-app`
- Should be ~15MB executable
- If missing: `npm run prebuild`

### SQLite errors
- Mac: `xcode-select --install`
- Ensures C compiler is available

---

## 📚 More Documentation

- **BUILD_GUIDE.md** - Complete build documentation
- **USER_GUIDE.md** - End-user documentation  
- **DATABASE_PERSISTENCE.md** - Database implementation details
- **WARP.md** - Project context for development

---

## 🎉 You're Done!

Build once, distribute forever. Zero hassle for users!
