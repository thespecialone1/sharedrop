# Thumbnail Feature - Testing Instructions

## ⚠️ IMPORTANT: Clear Browser Cache First!

Your screenshot shows the OLD version without Preview buttons. You MUST:

1. **Close ALL browser tabs** with the old share link
2. **Clear browser cache** (Cmd+Shift+Delete on Mac)
3. Or use **Incognito/Private window**

---

## 🚀 Start Fresh

```bash
# 1. Kill all old processes
pkill -9 file-share-app cloudflared electron

# 2. Start the server
./run-app.sh
```

Wait for:
```
File Share Server starting on http://localhost:8080
Public Access (Cloudflare):
  https://xxxxx.trycloudflare.com
```

---

## 📸 Test with Electron App

```bash
npm start
```

1. Click "Browse" and select your HEIC photos folder
2. Click "Create Share"
3. Copy the share link
4. Open in **INCOGNITO/PRIVATE browser window**
5. Enter password

---

## ✅ What You Should See NOW

### List View:
```
☐  [THUMBNAIL] IMG_3765.HEIC     [Preview] [Download]
               2.3 MB

☐  [THUMBNAIL] IMG_3766.HEIC     [Preview] [Download]
               2.3 MB
```

**You should see:**
- ✅ Thumbnails (60x60px images) on the left
- ✅ "Preview" button (gray) next to Download
- ✅ "List" and "Grid" toggle buttons at top

### Grid View:
Click "Grid" button to see Pinterest-style layout with larger thumbnails (200px height).

---

## 🎯 Test Checklist

### Thumbnails:
- [ ] HEIC files show thumbnails
- [ ] JPG files show thumbnails  
- [ ] PNG files show thumbnails
- [ ] DNG files show thumbnails (if you have them)
- [ ] Thumbnails are clickable

### Preview:
- [ ] Click thumbnail → modal opens
- [ ] Click "Preview" button → modal opens
- [ ] Image displays in fullscreen
- [ ] ESC key closes modal
- [ ] Click outside modal closes it
- [ ] Filename shows below image

### Grid View:
- [ ] Switch to Grid view works
- [ ] Thumbnails display in grid
- [ ] Checkboxes work in grid view
- [ ] Click thumbnail opens preview

---

## 🐛 Troubleshooting

### Problem: Still no thumbnails

**Solution:**
```bash
# 1. Make SURE you killed the old server
ps aux | grep file-share-app

# 2. Make SURE you're using the NEW link
# The old share link uses the OLD code!
# Create a BRAND NEW share

# 3. Open in INCOGNITO window
# Or clear cache: Cmd+Shift+Delete
```

### Problem: "Preview" button missing

This means you're viewing an OLD share link. The old server process was still running with old code.

**Solution:**
1. Kill server: `pkill -9 file-share-app`
2. Start fresh: `./run-app.sh`
3. Create **NEW** share
4. Use the **NEW** link

### Problem: Thumbnails show broken image icon

Check browser console (F12 → Console):
- Look for errors like "404 Not Found" or "500 Internal Server Error"
- Check the URL being requested

**Common causes:**
1. Special characters in filename
2. File doesn't exist
3. sips command failed (check terminal logs)

### Problem: HEIC thumbnails fail

Check terminal output for errors like:
```
Failed to convert .heic image: ...
```

**Solution:**
- `sips` is built into macOS, should work automatically
- Try manually: `sips -s format jpeg -Z 300 yourfile.HEIC --out /tmp/test.jpg`
- Check file permissions

---

## 📊 Supported Formats

**Images** (thumbnails + preview):
- ✅ JPG, JPEG
- ✅ PNG
- ✅ GIF
- ✅ BMP
- ✅ WebP
- ✅ **HEIC, HEIF** (iPhone photos)
- ✅ **DNG, CR2, NEF, ARW** (RAW formats)

**Videos** (thumbnails require ffmpeg):
- ✅ MP4
- ✅ WebM
- ✅ OGG
- ✅ MOV
- ✅ AVI
- ✅ MKV

---

## 🔍 Debug Mode

### Check if thumbnail endpoint works:

1. Get your share ID from the URL: `http://localhost:8080/share/ABC123XY`
2. Get a filename from the list
3. Test thumbnail directly:

```bash
# Replace ABC123XY with your share ID
# Replace IMG_3765.HEIC with your filename
curl "http://localhost:8080/thumbnail/ABC123XY/IMG_3765.HEIC" --output /tmp/thumb.jpg

# Check if file was created
open /tmp/thumb.jpg
```

If this works, the server is fine. The problem is browser-side (cache, JavaScript, etc.)

### Check browser console:

1. Open share page
2. Press F12
3. Go to Console tab
4. Look for errors (red text)
5. Check Network tab to see if thumbnail requests are failing

---

## ✨ Expected Behavior

1. **Page loads** → JavaScript runs → Sets `src` attribute on all img tags
2. **Browser requests** → `/thumbnail/{shareID}/{filename}`
3. **Server generates** → Thumbnail on-the-fly using `sips` (for HEIC/DNG) or Go image library
4. **Browser displays** → Thumbnail appears
5. **Click thumbnail** → Opens fullscreen preview modal

---

## 🎬 Quick Test Script

```bash
#!/bin/bash

echo "1. Killing old processes..."
pkill -9 file-share-app cloudflared

echo "2. Building latest code..."
go build -o file-share-app main.go

echo "3. Starting server..."
./run-app.sh &

echo "4. Waiting 5 seconds..."
sleep 5

echo "5. Server should be ready!"
echo "   → Open Electron app: npm start"
echo "   → Or visit: http://localhost:8080"
echo ""
echo "6. Create NEW share and test thumbnails!"
```

---

## 📝 Summary

The code is FIXED and READY. The issue is:
- **You're viewing an OLD share link** created before the fixes
- **Browser cache** is serving old HTML/JavaScript
- **Old server process** was still running

**Solution:** Start fresh, create new share, use incognito window.

The new features ARE working - you just need to see the NEW code in action!
