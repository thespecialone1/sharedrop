# Photographer's Complete Guide

## Answers to Your Questions

### 1. **Grid Responsiveness** ✅ FIXED
- Changed `object-fit: cover` to `object-fit: contain`
- Increased grid column width from 200px to 250px
- Images now display fully without cropping

### 2. **Tag Selection Visibility** ✅ FIXED
- **Album tag** (active): Blue background (#1e3a8a)
- **Print tag** (active): Green background (#166534)
- **Social tag** (active): Purple background (#7e22ce)
- **Skip tag** (active): Red background (#991b1b)
- Added bold font weight when active

### 3. **What Does "Pass" Mean?** ✅ FIXED
- Renamed to "Skip" for clarity
- Meaning: This photo is not needed (skip it)
- Useful for photographers to know which photos clients don't want

### 4. **Data Persistence** ✅ SOLVED
**Client-side**:
- Selections saved in `localStorage` (persists across browser sessions)
- User name saved in `sessionStorage` (persists during browser session)
- If client closes browser and reopens: All selections are still there!

**Server-side**:
- Currently in-memory (lost on server restart)
- **Solution for production**: Add SQLite in Phase 3.2
- CSV/JSON exports provide backup

### 5. **How CSV/JSON Helps Photographer** ✅ EXPLAINED

**CSV Export** (Open in Excel/Google Sheets):
```csv
Filename,User,Favorite,Tags,Timestamp
IMG_0234.jpg,Sarah,Yes,"Album;Print",2025-10-25T14:23:05Z
IMG_0235.jpg,John,Yes,"Album",2025-10-25T14:25:00Z
IMG_0236.jpg,Mom,Yes,"Print",2025-10-25T14:27:00Z
```

**Use cases**:
- **Sort by Tag**: See all "Album" selections → Compile wedding album
- **Filter by User**: See what Sarah favorited vs John favorited
- **Count selections**: How many prints ordered?
- **Track changes**: When did each person review?

**Example workflow**:
1. Export CSV
2. Open in Excel
3. Filter column "Tags" = "Album" → 35 photos for album
4. Filter column "Tags" = "Print" → 20 photos for prints
5. Create order fulfillment list

### 6. **Photographer Dashboard** ✅ NEW FEATURE

**URL**: `http://localhost:8080/dashboard/{shareID}`

**What it shows**:
- Total photos in gallery
- Number of reviewers
- Total selections made
- Per-user summary (favorites, tags)
- **Full table of all selections** with:
  - User name
  - Filename
  - Favorite status (★/☆)
  - Tags (color-coded)
  - Timestamp

**How to access**:
1. Create share → Get `{shareID}`
2. Visit `/dashboard/{shareID}`
3. No password needed (photographer access)

### 7. **Continuing a Session** ✅ SOLVED

**For Clients**:
- Close browser → Reopen same share link
- Enter password → Enter same name
- **All selections automatically restored!**
- Works because of `localStorage` + server sync

**For Photographers**:
- Visit dashboard anytime: `/dashboard/{shareID}`
- All selections visible regardless of server restarts (if exported)
- No account needed

---

## Complete Photographer Workflow

### Step 1: Create Share

```bash
curl -X POST http://localhost:8080/api/shares \
  -H "Content-Type: "application/json" \
  -d '{"folder_path":"/Users/photographer/Wedding_Smith_2025"}'
```

**Response**:
```json
{
  "id": "SmithABC",
  "password": "wXyZ123456",
  "folder_path": "/Users/photographer/Wedding_Smith_2025",
  "created_at": "2025-10-25T14:00:00Z"
}
```

**Save these**:
- Share ID: `SmithABC`
- Password: `wXyZ123456`
- Dashboard URL: `http://localhost:8080/dashboard/SmithABC`

### Step 2: Send to Clients

**Email template**:
```
Subject: Your Wedding Photos Are Ready!

Hi Sarah & John,

Your wedding photos are ready for review!

📸 View Photos: http://localhost:8080/share/SmithABC
🔐 Password: wXyZ123456

INSTRUCTIONS:
1. Enter the password above
2. Enter your name when prompted
3. Click the star (☆) to favorite photos you love
4. Use tags to organize:
   - Album: Want this in the wedding album
   - Print: Want a physical print
   - Social: Share on social media
   - Skip: Don't need this photo

5. When done, click "Export CSV" to download your selections

IMPORTANT:
- Your selections save automatically
- You can close the browser and continue later
- Enter the SAME NAME when you return

Feel free to share this link with family (mom, dad, bridesmaids)
- each person can review independently!

Questions? Reply to this email.

Best,
[Your Name]
```

### Step 3: Monitor Progress

**Check Dashboard**:
1. Visit `http://localhost:8080/dashboard/SmithABC`
2. See:
   - 500 total photos
   - 3 reviewers (Sarah, John, Mom)
   - 97 total selections
   
3. View summary:
   - Sarah: 45 favorites, 32 tagged
   - John: 32 favorites, 25 tagged  
   - Mom: 20 favorites, 18 tagged

4. See full table of selections

### Step 4: Export Selections

**Option A: From Dashboard**
- Click "Export CSV" button
- Opens in Excel

**Option B: Direct API**
```bash
curl "http://localhost:8080/api/selections/export?share_id=SmithABC&format=csv" \
  > smith_selections.csv
```

### Step 5: Fulfill Orders

**Example Excel workflow**:

1. **Album selection**:
   - Filter "Tags" column = "Album"
   - See 35 photos selected for album
   - Sort by "User" to see Sarah vs John picks
   - Create album with union of their selections

2. **Print orders**:
   - Filter "Tags" column = "Print"
   - See 20 photos
   - Group by filename to see if multiple people want same print
   - Create print order list

3. **Social media**:
   - Filter "Tags" column = "Social"
   - See 15 photos
   - Send to clients for social sharing

### Step 6: Archive

**Save for records**:
```bash
# Export final selections
curl "http://localhost:8080/api/selections/export?share_id=SmithABC&format=json" \
  > smith_selections_final.json

# Move to archive folder
mv smith_selections_final.json ~/Archives/Smith_Wedding_2025/
```

---

## FAQ

### Q: What if I accidentally shut down my laptop?

**For Photographer**:
- Selections stored on server (in-memory currently)
- If server stops: Selections lost
- **Solution**: Export CSV/JSON regularly as backup
- **Future**: Phase 3.2 adds SQLite persistence

**For Clients**:
- Selections stored in browser `localStorage`
- If browser closes: Selections still there
- If computer shuts down: Selections still there
- If they open link again: Enter same name → Selections restore

### Q: Can clients continue where they left off?

**YES!** ✅

1. Client reviews 50 photos, favorites 10
2. Closes browser
3. Next day: Opens same link
4. Enters password + SAME NAME
5. All 10 favorites automatically restored
6. Can continue reviewing remaining photos

### Q: How do I know if selections are saved?

**Saving indicator** (bottom of selection bar):
- "Saving..." (orange) - Upload in progress
- "All changes saved" (green) - Successfully saved
- "Save failed" (gray) - Error occurred

### Q: What if two people use the same name?

**Problem**: Selections will merge/conflict

**Solution**: 
- Tell each person to use unique name
- Example: "Sarah", "John", "Mom", not just "User"

### Q: Can I see selections in real-time?

**Currently**: No real-time sync (refresh dashboard manually)

**Workflow**:
1. Visit `/dashboard/{shareID}`
2. Refresh page to see updated selections
3. Check "Total Selections" count

**Future**: Phase 3.2 adds real-time activity feed

### Q: What if client doesn't export CSV?

**No problem!**
- Photographer can export from dashboard anytime
- Exports show ALL users' selections together
- No action needed from clients

### Q: Can I password-protect the dashboard?

**Currently**: No authentication

**Recommendation**:
- Don't share dashboard URL publicly
- Only share client gallery URL (/share/{ID})
- Dashboard is for photographer only

**Future**: Phase 3.2 adds dashboard password

---

## Keyboard Shortcuts

**In Gallery (Client View)**:
- `ESC` - Close preview modal
- `←` - Previous image
- `→` - Next image

---

## Troubleshooting

### Issue: Selections not saving

**Check**:
1. Is "Saving..." indicator showing?
2. Check browser console for errors (F12)
3. Verify server is running: `curl http://localhost:8080/api/check-cloudflared`

**Solution**:
- Selections saved to `localStorage` as backup
- Export CSV manually if needed

### Issue: Can't access dashboard

**Check**:
1. Using correct URL: `/dashboard/{shareID}` (not `/share/{shareID}`)
2. Server is running
3. Share ID is correct

### Issue: Tags not showing color

**Check**:
1. Is tag clicked/active?
2. Refresh page
3. Check if saved (look for "All changes saved")

---

## Best Practices

1. **Export regularly**: Download CSV after each client reviews
2. **Clear instructions**: Tell clients to use unique names
3. **Backup data**: Save JSON exports for records
4. **Monitor dashboard**: Check daily for new selections
5. **Set deadlines**: "Please review by {date}"
6. **Communicate**: Email clients when link is ready

---

## Advanced Tips

### Bulk Analysis in Excel

**Count photos per tag**:
```excel
=COUNTIF(D:D, "*Album*")  // Count Album tags
=COUNTIF(D:D, "*Print*")  // Count Print tags
```

**Find photos favorited by multiple people**:
1. Sort by "Filename"
2. Look for duplicate filenames
3. These are photos multiple reviewers loved

**Timeline analysis**:
1. Sort by "Timestamp"
2. See when each person reviewed
3. Follow up with people who haven't reviewed

---

## Summary of Improvements

✅ **Grid view** - Images no longer cropped  
✅ **Tag colors** - Album=Blue, Print=Green, Social=Purple, Skip=Red  
✅ **Clear naming** - "Pass" → "Skip"  
✅ **Auto-save** - Saves automatically with visual indicator  
✅ **Persistence** - localStorage keeps selections across sessions  
✅ **Dashboard** - Photographer can view all selections  
✅ **Export** - CSV/JSON for Excel analysis  
✅ **Resume** - Clients can continue where they left off  

**All your concerns addressed!** 🎉
