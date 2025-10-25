# ShareDrop - New Features

## Media Preview & Thumbnails

ShareDrop now supports rich media previews for images and videos!

### Features

#### 1. **Thumbnail Generation**
- Automatic thumbnails for images (JPG, PNG, GIF, BMP, WebP)
- Video thumbnail extraction using ffmpeg (first frame)
- 300x300px thumbnails with high quality
- Cached thumbnails for better performance

#### 2. **Inline Preview**
- **Images**: Click any image to view it in a fullscreen lightbox modal
- **Videos**: Click any video to play it inline with HTML5 video player
- Full-screen preview with keyboard shortcuts (ESC to close)
- High-quality preview display

#### 3. **Dual View Modes**
- **List View**: Traditional file list with thumbnails on the side
- **Grid View**: Pinterest-style grid layout perfect for photo galleries
- Toggle between views with one click

### Supported Formats

**Images:**
- .jpg, .jpeg
- .png
- .gif
- .bmp
- .webp

**Videos:**
- .mp4
- .webm
- .ogg
- .mov
- .avi
- .mkv

### Requirements

For **video thumbnails** to work, you need ffmpeg installed:

```bash
# macOS
brew install ffmpeg

# Ubuntu
sudo apt install ffmpeg
```

If ffmpeg is not installed, video thumbnails won't be generated, but video playback will still work.

---

## Cloudflare Tunnel Installation Helper

### Problem Solved
Previously, users had to manually check if cloudflared was installed and remember the installation command.

### New Solution
- **Automatic Detection**: ShareDrop checks if cloudflared is installed on startup
- **Visual Warning**: If not found, a prominent notice appears with installation instructions
- **Copy Command**: One-click copy of the installation command
- **No Interruption**: Users can still share files locally without cloudflared

### How It Works

1. When ShareDrop starts, it checks for cloudflared in common locations:
   - `/opt/homebrew/bin/cloudflared` (Apple Silicon Mac)
   - `/usr/local/bin/cloudflared` (Intel Mac)
   - System PATH

2. If not found:
   - A yellow warning card appears in the Electron app
   - Shows the exact command to run: `brew install cloudflare/cloudflare/cloudflared`
   - Users can copy the command with one click
   
3. After installation:
   - Restart ShareDrop
   - Cloudflare tunnel will automatically start
   - Share links will include the public internet URL

---

## API Endpoints

### New Endpoints

#### `GET /thumbnail/:shareID/:filename`
Returns a 300x300px thumbnail of the image or video.

**Response:**
- Images: JPEG format (85% quality)
- Videos: PNG format (extracted first frame)
- Headers: `Cache-Control: public, max-age=3600`

#### `GET /preview/:shareID/:filename`
Serves the full-resolution file for inline preview.

**Response:**
- Images: Original format with correct Content-Type
- Videos: Streamed with Range support for seeking

#### `GET /api/check-cloudflared`
Checks if cloudflared is installed on the system.

**Response:**
```json
{
  "installed": true,
  "install_command": "brew install cloudflare/cloudflare/cloudflared"
}
```

---

## Usage

### Creating a Share with Media Files

1. **Select a folder** containing images or videos
2. **Create the share** - thumbnails are generated on-demand
3. **Recipients see thumbnails** automatically in the file list
4. **Click to preview** - opens fullscreen viewer/player
5. **Download** as usual with the download button

### Grid View for Photo Galleries

Perfect for sharing photo albums:
1. Create a share of your photos folder
2. Recipients can switch to Grid View
3. Browse photos like a gallery
4. Click any photo to view full resolution
5. Select multiple photos and download

### Testing Locally

```bash
# Build and run
go build -o file-share-app main.go
./run-app.sh

# Or use Electron app
npm start
```

Create a share with a folder containing images/videos and test the preview features!

---

## Technical Notes

### Image Thumbnails
- Uses `github.com/nfnt/resize` library
- Lanczos3 resampling for high quality
- Generated on-the-fly (not pre-cached to disk)
- Served as JPEG for optimal size/quality ratio

### Video Thumbnails
- Requires ffmpeg installed on the system
- Extracts first frame: `ffmpeg -i video.mp4 -vframes 1 -vf scale=300:-1 -f image2pipe -vcodec png -`
- Fallback: Returns error if ffmpeg not available
- Consider showing a generic video icon if ffmpeg is missing

### Performance
- Thumbnails are generated on first request
- Browser caching reduces server load (1 hour cache)
- Grid view uses lazy loading (`loading="lazy"` attribute)
- No pre-generation = no storage overhead

### Security
- All file path validation still applies
- Path traversal prevention maintained
- Same access control (password protection)
- No new security vulnerabilities introduced
