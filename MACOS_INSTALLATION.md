# macOS Installation Instructions

## ⚠️ "App is damaged" Error?

macOS blocks unsigned apps by default. Here's how to fix it:

### Method 1: Remove Quarantine Flag (Recommended)

After installing the app, run this in Terminal:

```bash
xattr -cr /Applications/ShareDrop.app
```

Then launch ShareDrop normally.

### Method 2: Right-Click to Open

1. Right-click (or Ctrl+Click) on ShareDrop.app
2. Select "Open"
3. Click "Open" in the dialog
4. App will open and remember your choice

### Method 3: System Settings

1. Try to open ShareDrop (will fail)
2. Go to System Settings → Privacy & Security
3. Scroll down to "ShareDrop was blocked"
4. Click "Open Anyway"

---

## Why This Happens

The app is **not code signed** with an Apple Developer certificate ($99/year).

**The app is safe** - you built it yourself from source code. macOS just doesn't trust unsigned apps by default.

---

## For Distribution

If you want to distribute without users seeing this warning:

### Option 1: Code Sign (Recommended for Distribution)
1. Get Apple Developer account ($99/year)
2. Get Developer ID certificate
3. Update `package.json`:
   ```json
   "build": {
     "mac": {
       "identity": "Developer ID Application: Your Name (TEAM_ID)"
     }
   }
   ```
4. Rebuild: `npm run build:mac`

### Option 2: Document the Fix
Include these instructions with your DMG download

### Option 3: Notarization (Full Trust)
After code signing, submit for notarization:
```bash
xcrun notarytool submit dist/ShareDrop-1.1.0-arm64.dmg \
  --apple-id your@email.com \
  --team-id TEAMID \
  --password app-specific-password
```

---

## Current State

✅ **App works perfectly** - just needs the quarantine flag removed  
✅ **No security risk** - you control the source code  
✅ **No malware** - built from your own Go/Electron code  
❌ **Not code signed** - macOS doesn't trust it automatically  

---

## Quick Test

To test the fix:

```bash
# Remove the app if already installed
rm -rf /Applications/ShareDrop.app

# Install fresh from DMG
open dist/ShareDrop-1.1.0-arm64.dmg
# Drag to Applications

# Remove quarantine
xattr -cr /Applications/ShareDrop.app

# Launch
open /Applications/ShareDrop.app
```

Should work without any warnings! ✅
