# ShareDrop v1.1.0 - Testing Guide

## 📦 Build Output

**DMG File:** `dist/ShareDrop-1.0.0-arm64.dmg` (111 MB)
**App Bundle:** `dist/mac-arm64/ShareDrop.app`

## 🧪 Test Checklist

### 1. Installation Test
```bash
# Open the DMG
open dist/ShareDrop-1.0.0-arm64.dmg

# Drag ShareDrop.app to Applications
# Launch from Applications folder
```

**Verify:**
- [ ] DMG opens without errors
- [ ] Water droplet icon (💦) displays correctly
- [ ] App installs to Applications folder
- [ ] App launches successfully

---

### 2. Cloudflare Detection Test

**Test A: With cloudflared installed**
- [ ] Launch app
- [ ] Wait 5 seconds
- [ ] Yellow warning should NOT appear
- [ ] Green "Internet sharing active" should appear
- [ ] Tunnel URL should be available in status

**Test B: Without cloudflared** (if you want to simulate)
```bash
# Temporarily rename cloudflared
sudo mv /opt/homebrew/bin/cloudflared /opt/homebrew/bin/cloudflared.bak

# Launch app
# Should see yellow warning after 5 seconds

# Restore
sudo mv /opt/homebrew/bin/cloudflared.bak /opt/homebrew/bin/cloudflared
```

**Verify:**
- [ ] Warning appears after 5 seconds (not 2 seconds)
- [ ] "Copy Command" button works
- [ ] Command copies correctly: `brew install cloudflare/cloudflare/cloudflared`

---

### 3. HEIC Image Test

**Create test share with iPhone photos:**

1. Select a folder with HEIC images (iPhone photos)
2. Create share
3. Open share link in browser
4. Enter password

**List View - Verify:**
- [ ] HEIC files show thumbnails (not broken images)
- [ ] Thumbnails load within 1-2 seconds
- [ ] File names display correctly
- [ ] File sizes show correctly

**Preview - Verify:**
- [ ] Click HEIC thumbnail
- [ ] Modal opens with full-resolution image
- [ ] Image displays correctly (not corrupted)
- [ ] ESC key closes modal
- [ ] Click outside modal closes it
- [ ] Multiple HEIC images work

**Grid View - Verify:**
- [ ] Switch to Grid view
- [ ] HEIC thumbnails display in grid
- [ ] Grid is responsive
- [ ] Hover effects work
- [ ] Click thumbnail opens preview

---

### 4. Regular Image Test

**Test with JPG/PNG files:**

**Verify:**
- [ ] JPG thumbnails generate correctly
- [ ] PNG thumbnails generate correctly
- [ ] Preview modal works for all image types
- [ ] Download button works
- [ ] "Select All" + Download works

---

### 5. Video Test

**Prerequisite:** `brew install ffmpeg` (for thumbnails)

**Test with MP4/MOV files:**

**Thumbnails - Verify:**
- [ ] Video thumbnails show (first frame)
- [ ] Thumbnail quality is acceptable
- [ ] Multiple video formats work

**Preview - Verify:**
- [ ] Click video thumbnail
- [ ] Video player opens in modal
- [ ] Play button works
- [ ] Video controls (pause, seek, volume) work
- [ ] Video plays smoothly
- [ ] ESC key closes player

**Without ffmpeg:**
- [ ] Videos still downloadable (no thumbnails is OK)
- [ ] Consider: Generic video icon instead of error

---

### 6. Mixed Folder Test

**Test with folder containing:**
- HEIC images (iPhone photos)
- JPG images
- PNG images
- MP4 videos
- Other files (.pdf, .txt, etc.)

**Verify:**
- [ ] All media files show thumbnails
- [ ] Non-media files show without thumbnails
- [ ] Preview works for all supported types
- [ ] Grid view looks good with mixed content
- [ ] List view shows all files correctly

---

### 7. Performance Test

**Large folder test (50+ images):**

**Verify:**
- [ ] Page loads without freezing
- [ ] Thumbnails load progressively (lazy loading)
- [ ] Scrolling is smooth in grid view
- [ ] Memory usage is reasonable
- [ ] Multiple preview opens don't slow down

---

### 8. UI/UX Test

**List View:**
- [ ] Checkbox selection works
- [ ] "Select All" toggles correctly
- [ ] "Download Selected" button enables/disables
- [ ] Individual download buttons work
- [ ] Preview buttons appear for media files

**Grid View:**
- [ ] Grid is responsive (resizes with window)
- [ ] Checkboxes visible and functional
- [ ] Cards have hover effects
- [ ] Thumbnails maintain aspect ratio

**View Toggle:**
- [ ] Switch between List/Grid works smoothly
- [ ] Selection state persists when switching views
- [ ] No layout glitches

**Modal:**
- [ ] Opens smoothly without delay
- [ ] Image/video centered correctly
- [ ] Filename displays below media
- [ ] Close button (×) works
- [ ] Click outside closes modal
- [ ] ESC key closes modal
- [ ] No scroll issues behind modal

---

### 9. Download Test

**Single file:**
- [ ] Download starts immediately
- [ ] File saves with correct name
- [ ] File opens correctly after download

**Multiple files:**
- [ ] Select 3-5 files
- [ ] Click "Download Selected"
- [ ] All files download sequentially
- [ ] Download bar shows progress (browser)
- [ ] All files complete successfully

**Large file:**
- [ ] Test with video file (>100MB)
- [ ] Download progresses correctly
- [ ] No timeout errors
- [ ] File is not corrupted

---

### 10. Edge Cases

**Special characters in filenames:**
- [ ] Files with spaces work
- [ ] Files with unicode characters work
- [ ] Files with apostrophes work

**Very large thumbnails:**
- [ ] High-res images (4000x3000) generate thumbnails
- [ ] No timeout errors
- [ ] Reasonable response time (<3 seconds)

**Concurrent access:**
- [ ] Open share link in multiple browsers
- [ ] All can view/download simultaneously
- [ ] No conflicts or errors

---

## 🐛 Known Issues to Watch For

1. **Video thumbnails fail silently** if ffmpeg not installed
   - Consider adding fallback icon

2. **HEIC on non-macOS** won't work
   - Need alternative for Ubuntu deployment

3. **Memory usage** with many large images
   - Monitor Activity Monitor during tests

4. **Browser compatibility**
   - Test on Safari, Chrome, Firefox

---

## ✅ Success Criteria

- [ ] All HEIC images display correctly
- [ ] Thumbnails generate within 2 seconds
- [ ] Preview modal works smoothly
- [ ] No cloudflare popup when installed
- [ ] DMG installs without errors
- [ ] App icon displays correctly
- [ ] All downloads work
- [ ] No console errors in browser

---

## 📝 Test Results Template

```
Date: ___________
Tester: ___________
macOS Version: ___________
Browser: ___________

✅ Installation
✅ Cloudflare Detection  
✅ HEIC Support
✅ Regular Images
✅ Videos
✅ Mixed Folder
✅ Performance
✅ UI/UX
✅ Downloads
✅ Edge Cases

Notes:
_______________________________________
_______________________________________
_______________________________________

Issues Found:
_______________________________________
_______________________________________
_______________________________________
```

---

## 🚀 Quick Test Command

```bash
# Test locally without building
npm start

# Then share a test folder with:
# - iPhone photos (HEIC)
# - Regular photos (JPG)
# - Videos (MP4)
```

## 📦 Install DMG

```bash
open dist/ShareDrop-1.0.0-arm64.dmg
```

Drag to Applications → Launch → Test!
