# ShareDrop Build & Distribution Guide

## 🎯 Quick Build (Mac)

```bash
# 1. Install dependencies (one time only)
npm install

# 2. Build the app
npm run build:mac
```

The built app will be in `dist/ShareDrop.dmg`

---

## 📋 Prerequisites

### Required
- **Node.js** (v18+) - [Download](https://nodejs.org/)
- **Go** (v1.21+) - [Download](https://golang.org/dl/)
- **npm** (comes with Node.js)

### Optional (for internet access)
- **Cloudflared** - For public internet access via Cloudflare Tunnel
  ```bash
  brew install cloudflare/cloudflare/cloudflared
  ```

---

## 🏗️ Build Process

The build process is fully automated:

1. **Pre-build** (`build-prebuild.js`)
   - ✅ Checks Go installation
   - ✅ Downloads Go dependencies (including SQLite driver)
   - ✅ Compiles Go binary for target platform
   - ✅ Makes binary executable

2. **Electron Builder**
   - ✅ Packages Electron app
   - ✅ Bundles Go binary into resources
   - ✅ Creates distributable (.dmg, .exe, .AppImage)

### Platform-Specific Builds

#### macOS
```bash
npm run build:mac
```
- Output: `dist/ShareDrop.dmg`
- Supports Intel (x64) and Apple Silicon (arm64)

#### Windows
```bash
npm run build:win
```
- Output: `dist/ShareDrop Setup.exe` and `dist/ShareDrop Portable.exe`
- Requires: Windows Build Tools or Visual Studio

#### Linux
```bash
npm run build:linux
```
- Output: `dist/ShareDrop.AppImage`

---

## 📦 What Gets Bundled

### Included in Distribution
✅ Go server binary (compiled for target platform)  
✅ SQLite database support  
✅ Electron UI  
✅ All JavaScript dependencies  

### NOT Included (User Must Install Separately)
❌ Cloudflared (optional, for internet access)  
❌ ImageMagick (optional, for HEIC/RAW support on Windows/Linux)  

---

## 🚀 Distribution to Users

### Option 1: Direct Download (Recommended)
1. Build the app: `npm run build:mac`
2. Share the `.dmg` file from `dist/` folder
3. Users double-click to install

### Option 2: GitHub Releases
1. Create a GitHub release
2. Upload the built `.dmg`/`.exe`/`.AppImage`
3. Users download from releases page

### What Users Need to Know

**macOS Users:**
1. Download `ShareDrop.dmg`
2. Open and drag to Applications
3. Launch ShareDrop
4. **(Optional)** Install cloudflared for internet access:
   ```bash
   brew install cloudflare/cloudflare/cloudflared
   ```

**Windows Users:**
1. Download `ShareDrop Setup.exe`
2. Run installer
3. **(Optional)** Install cloudflared from [GitHub releases](https://github.com/cloudflare/cloudflared/releases)

**Linux Users:**
1. Download `ShareDrop.AppImage`
2. Make executable: `chmod +x ShareDrop.AppImage`
3. Run: `./ShareDrop.AppImage`

---

## 🛠️ Development Workflow

### Local Development
```bash
# Start in dev mode (uses local binary)
npm start
```

### Testing Build Process
```bash
# Test the pre-build script
npm run prebuild

# Build for current platform
npm run build
```

---

## 🔧 Troubleshooting

### "Go not found" error
**Solution:** Install Go from https://golang.org/dl/ and restart terminal

### SQLite compilation errors
**Solution:** 
- Mac: Install Xcode Command Line Tools: `xcode-select --install`
- Windows: Install Visual Studio Build Tools
- Linux: Install gcc: `sudo apt install build-essential`

### Binary not found in packaged app
**Solution:** 
- Check `dist/mac/ShareDrop.app/Contents/Resources/`
- Binary should be `file-share-app` (or `.exe` on Windows)

### Cloudflared not working
**Solution:** 
- Cloudflared is optional
- App will work locally without it
- Users need to install it separately for internet access

---

## 📊 Build Artifacts

After successful build:

```
dist/
├── ShareDrop.dmg           # macOS installer
├── ShareDrop.dmg.blockmap  # For differential updates
└── mac/
    └── ShareDrop.app/      # Unpacked application
        └── Contents/
            └── Resources/
                └── file-share-app  # Your Go binary
                └── sharedrop.db    # Created on first run
```

---

## 🎨 Customization

### Change App Name
Edit `package.json`:
```json
"build": {
  "productName": "YourAppName"
}
```

### Change App Icon
Replace:
- `icon.icns` (macOS)
- `icon.png` (Windows/Linux)

### Change App ID
Edit `package.json`:
```json
"build": {
  "appId": "com.yourcompany.yourapp"
}
```

---

## 🔒 Code Signing (macOS)

For distribution outside the App Store:

1. Get Apple Developer account
2. Create certificates in Xcode
3. Update `package.json`:
```json
"build": {
  "mac": {
    "identity": "Developer ID Application: Your Name (TEAM_ID)"
  }
}
```

---

## 💡 Best Practices

### Before Distributing
- [ ] Test on clean machine (no dev tools)
- [ ] Verify cloudflared shows proper error if missing
- [ ] Test photo selection persistence after restart
- [ ] Check database is created in correct location
- [ ] Test both local and tunnel URLs

### Version Management
```bash
# Bump version before building
npm version patch  # 1.1.0 -> 1.1.1
npm version minor  # 1.1.1 -> 1.2.0
npm version major  # 1.2.0 -> 2.0.0
```

---

## 🆘 Support Resources

- **Go Issues:** Check `go.mod` and run `go mod tidy`
- **Electron Issues:** Check `electron-main.js` logs
- **Build Issues:** Check `build-prebuild.js` output
- **SQLite Issues:** Ensure CGO is enabled in build script

---

## 📝 Notes

- Database (`sharedrop.db`) is created in app directory on first run
- User data persists in the database between sessions
- Cloudflared is detected at runtime, not bundled
- Binary is platform-specific and compiled during build
