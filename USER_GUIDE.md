# ShareDrop User Guide

## 🎯 What is ShareDrop?

ShareDrop lets you share photos and files from your computer instantly, without uploading to the cloud. Perfect for wedding photographers sharing galleries with clients for review and selection.

**Key Features:**
- 📁 Share entire folders with password-protected links
- ⭐ Clients can favorite photos
- 🏷️ Add tags like "First Look", "Reception", "Favorites"
- 💬 Comment on specific photos
- 💾 All selections saved automatically
- 📊 Photographer dashboard to view all client selections
- 🌐 Optional internet access via Cloudflare Tunnel

---

## 🚀 Getting Started

### For Photographers

#### 1. Launch ShareDrop
Double-click the ShareDrop app icon

#### 2. Share a Folder
1. Click **"Select Folder"**
2. Choose the folder with your photos
3. Copy the share link
4. Send to your client with the password

#### 3. View Client Selections
- Open the **Dashboard** link to see all client favorites and tags
- Export selections as CSV or JSON
- Review comments on individual photos

---

### For Clients (Photo Selection)

#### 1. Open the Share Link
Click the link your photographer sent you

#### 2. Enter Password
Type the password provided by your photographer

#### 3. Enter Your Name
Type your name when prompted (appears only once)

#### 4. Review Photos

**Viewing:**
- Click any photo to view full screen
- Use arrow keys to navigate
- Switch between Grid and List view

**Selecting Favorites:**
- Click the ⭐ star icon to favorite
- Yellow = favorited, Gray = not favorited

**Adding Tags:**
- Click tag buttons: "First Look", "Reception", "Portraits", etc.
- Active tags show with colored backgrounds
- Add multiple tags to a photo

**Commenting:**
- Click 💬 icon
- Add notes or questions about specific photos
- View other comments

#### 5. Export Your Selections
- Click **"Export as CSV"** or **"Export as JSON"**
- Send the file to your photographer

---

## 🎨 Photo Review Features

### Star Rating
⭐ Favorite photos you want in your final album

### Quick Tags
Organize photos by category:
- **First Look** - Pre-ceremony photos
- **Ceremony** - Wedding ceremony
- **Reception** - Reception and party
- **Portraits** - Couple/family portraits
- **Details** - Rings, decor, details
- **Skip** - Photos you don't want

### Comments
💬 Leave notes on specific photos for your photographer

### Selection Counter
See how many photos you've favorited in real-time

---

## 💾 Your Selections Are Saved

✅ All favorites, tags, and comments are automatically saved  
✅ You can close the browser and come back later  
✅ Your progress is always saved  
✅ Multiple people can review the same gallery  

---

## 📊 Photographer Dashboard

Access the dashboard by adding `/dashboard/{SHARE_ID}` to your share link

**What You'll See:**
- Total number of photos in the gallery
- Number of unique reviewers
- Favorites count per user
- Tagged photos per user
- All comments
- Access count (how many times the link was opened)

**Export Options:**
- **CSV** - Import into Excel/Google Sheets
- **JSON** - Import into your workflow tools

---

## 🌐 Local vs Internet Access

### Local Access Only (Default)
- Works on your local network
- Link format: `http://localhost:8080/share/ABC123`
- Clients must be on the same WiFi network

### Internet Access (Optional)
If cloudflared is installed:
- Works from anywhere in the world
- Link format: `https://xyz.trycloudflare.com/share/ABC123`
- Free Cloudflare Tunnel automatically created

To enable internet access:
```bash
brew install cloudflare/cloudflare/cloudflared
```

---

## 🔐 Security

- Each share has a unique password
- Passwords are 12 characters, randomly generated
- Files never leave your computer
- Shares are password-protected
- Database stores all activity locally

---

## 💡 Tips & Best Practices

### For Photographers
- **Organize folders** by wedding date or client name
- **Test the link** before sending to clients
- **Include password** in a separate message for security
- **Set a deadline** for client selections
- **Export regularly** to backup client selections

### For Clients
- **Use Chrome or Safari** for best experience
- **Favorite liberally** - easier to narrow down later
- **Use tags** to organize by category
- **Add comments** if you need specific edits
- **Download your CSV** as a backup

---

## 🆘 Troubleshooting

### Link doesn't work
- **Check password** - Copy/paste to avoid typos
- **Check expiration** - Link may have expired
- **Try local link** - Use `http://localhost:8080/share/...` if on same network

### Photos not loading
- **Wait a moment** - Large galleries take time to load thumbnails
- **Check internet** - Required for Cloudflare Tunnel links
- **Refresh page** - Sometimes helps with slow connections

### Selections not saving
- **Check browser storage** - Enable cookies/localStorage
- **Don't use incognito** - Private browsing may block storage
- **Stay on same device** - Selections saved per browser

### Can't see dashboard
- **Check URL** - Must be `/dashboard/{SHARE_ID}`
- **Photographer only** - Not accessible to clients
- **Check server** - Server must be running

---

## 📝 File Format Support

### Images
✅ JPG, JPEG, PNG, GIF, BMP, WEBP  
✅ HEIC, HEIF (Apple photos)  
✅ RAW formats: DNG, CR2, NEF, ARW  

### Videos
✅ MP4, WEBM, OGG, MOV, AVI, MKV

### RAW Photo Notes
- macOS: Native support via `sips`
- Windows/Linux: Requires ImageMagick installation

---

## 📞 Support

For issues or questions:
1. Check this guide
2. Review the BUILD_GUIDE.md for technical details
3. Check server logs in terminal
4. Restart the ShareDrop app

---

## ⚙️ Advanced Features

### Multiple Users
Multiple clients can review the same gallery simultaneously. Each person's selections are tracked separately by name.

### Session Export/Import
Export all selections from one session and import to another gallery if you need to start fresh or merge reviews.

### Custom Tags
Tags can be customized in the code (see developer documentation)

### Database Backup
Your database file is located at: `sharedrop.db`  
Back it up regularly to preserve all client selections!

---

## 🎉 You're Ready!

Enjoy hassle-free photo sharing and selection with ShareDrop!
