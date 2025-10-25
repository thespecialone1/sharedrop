package main

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"html/template"
	"image"
	"image/jpeg"
	_ "image/gif"
	_ "image/png"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/nfnt/resize"
)

type Share struct {
	ID          string    `json:"id"`
	FolderPath  string    `json:"folder_path"`
	Password    string    `json:"password"`
	CreatedAt   time.Time `json:"created_at"`
	AccessCount int       `json:"access_count"`
}

type DownloadLog struct {
	ShareID    string    `json:"share_id"`
	FileName   string    `json:"file_name"`
	ClientIP   string    `json:"client_ip"`
	DownloadAt time.Time `json:"download_at"`
}

type App struct {
	shares       map[string]*Share
	downloadLogs []DownloadLog
	mu           sync.RWMutex
}

func NewApp() *App {
	return &App{
		shares:       make(map[string]*Share),
		downloadLogs: make([]DownloadLog, 0),
	}
}

func generateRandomString(length int) string {
	bytes := make([]byte, length)
	rand.Read(bytes)
	return base64.URLEncoding.EncodeToString(bytes)[:length]
}

func (app *App) createShare(folderPath string) (*Share, error) {
	info, err := os.Stat(folderPath)
	if err != nil {
		return nil, fmt.Errorf("folder not found: %v", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("path is not a directory")
	}

	share := &Share{
		ID:         generateRandomString(8),
		FolderPath: folderPath,
		Password:   generateRandomString(12),
		CreatedAt:  time.Now(),
	}

	app.mu.Lock()
	app.shares[share.ID] = share
	app.mu.Unlock()

	return share, nil
}

func (app *App) logDownload(shareID, fileName, clientIP string) {
	app.mu.Lock()
	defer app.mu.Unlock()

	app.downloadLogs = append(app.downloadLogs, DownloadLog{
		ShareID:    shareID,
		FileName:   fileName,
		ClientIP:   clientIP,
		DownloadAt: time.Now(),
	})
}

func (app *App) handleCreateShare(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		FolderPath string `json:"folder_path"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	share, err := app.createShare(req.FolderPath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(share)
}

func (app *App) handleSharePage(w http.ResponseWriter, r *http.Request) {
	shareID := strings.TrimPrefix(r.URL.Path, "/share/")

	app.mu.RLock()
	share, exists := app.shares[shareID]
	app.mu.RUnlock()

	if !exists {
		http.Error(w, "Share not found", http.StatusNotFound)
		return
	}

	if r.Method == http.MethodPost {
		r.ParseForm()
		password := r.FormValue("password")
		if password == share.Password {
			files, err := os.ReadDir(share.FolderPath)
			if err != nil {
				http.Error(w, "Failed to read folder", http.StatusInternalServerError)
				return
			}

			type FileInfo struct {
				Name    string
				Size    int64
				IsDir   bool
				IsImage bool
				IsVideo bool
			}

			var fileList []FileInfo
			for _, file := range files {
				if !file.IsDir() {
					info, _ := file.Info()
					fileName := file.Name()
					fileExt := strings.ToLower(filepath.Ext(fileName))
					isImage := isImageFile(fileExt)
					isVideo := isVideoFile(fileExt)
					fileList = append(fileList, FileInfo{
						Name:    fileName,
						Size:    info.Size(),
						IsDir:   false,
						IsImage: isImage,
						IsVideo: isVideo,
					})
				}
			}

			app.mu.Lock()
			share.AccessCount++
			app.mu.Unlock()

			tmpl := template.Must(template.New("browse").Funcs(template.FuncMap{
				"formatSize": func(size int64) string {
					const unit = 1024
					if size < unit {
						return fmt.Sprintf("%d B", size)
					}
					div, exp := int64(unit), 0
					for n := size / unit; n >= unit; n /= unit {
						div *= unit
						exp++
					}
					return fmt.Sprintf("%.1f %cB", float64(size)/float64(div), "KMGTPE"[exp])
				},
				"urlEncode": func(s string) string {
					return strings.ReplaceAll(strings.ReplaceAll(strings.ReplaceAll(s, "\\", "\\\\"), "'", "\\'"), "\"", "\\\"")
				},
			}).Parse(browseTemplate))
			tmpl.Execute(w, map[string]interface{}{
				"ShareID": shareID,
				"Files":   fileList,
			})
			return
		}
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, "<script>alert('Invalid password'); window.location.reload();</script>")
		return
	}

	tmpl := template.Must(template.New("password").Parse(passwordTemplate))
	tmpl.Execute(w, shareID)
}

func (app *App) handleDownload(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/download/"), "/")
	if len(parts) < 2 {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	shareID := parts[0]
	fileName := strings.Join(parts[1:], "/")

	app.mu.RLock()
	share, exists := app.shares[shareID]
	app.mu.RUnlock()

	if !exists {
		http.Error(w, "Share not found", http.StatusNotFound)
		return
	}

	filePath := filepath.Join(share.FolderPath, fileName)
	if !strings.HasPrefix(filepath.Clean(filePath), filepath.Clean(share.FolderPath)) {
		http.Error(w, "Invalid file path", http.StatusBadRequest)
		return
	}

	app.logDownload(shareID, fileName, r.RemoteAddr)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filepath.Base(fileName)))
	http.ServeFile(w, r, filePath)
}

func isImageFile(ext string) bool {
	imageExts := []string{".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".heic", ".heif", ".dng", ".cr2", ".nef", ".arw"}
	for _, e := range imageExts {
		if ext == e {
			return true
		}
	}
	return false
}

func isVideoFile(ext string) bool {
	videoExts := []string{".mp4", ".webm", ".ogg", ".mov", ".avi", ".mkv"}
	for _, e := range videoExts {
		if ext == e {
			return true
		}
	}
	return false
}

func (app *App) handleThumbnail(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/thumbnail/"), "/")
	if len(parts) < 2 {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	shareID := parts[0]
	fileName := strings.Join(parts[1:], "/")

	app.mu.RLock()
	share, exists := app.shares[shareID]
	app.mu.RUnlock()

	if !exists {
		http.Error(w, "Share not found", http.StatusNotFound)
		return
	}

	filePath := filepath.Join(share.FolderPath, fileName)
	if !strings.HasPrefix(filepath.Clean(filePath), filepath.Clean(share.FolderPath)) {
		http.Error(w, "Invalid file path", http.StatusBadRequest)
		return
	}

	ext := strings.ToLower(filepath.Ext(fileName))
	if isImageFile(ext) {
		app.generateImageThumbnail(w, filePath)
	} else if isVideoFile(ext) {
		app.generateVideoThumbnail(w, filePath)
	} else {
		http.Error(w, "Not a media file", http.StatusBadRequest)
	}
}

func (app *App) generateImageThumbnail(w http.ResponseWriter, filePath string) {
	ext := strings.ToLower(filepath.Ext(filePath))
	
	// HEIC/HEIF and RAW files need special handling
	if ext == ".heic" || ext == ".heif" || ext == ".dng" || ext == ".cr2" || ext == ".nef" || ext == ".arw" {
		if runtime.GOOS == "darwin" {
			// macOS: use sips command
			cmd := exec.Command("sips", "-s", "format", "jpeg", "-Z", "300", filePath, "--out", "/dev/stdout")
			output, err := cmd.Output()
			if err != nil {
				log.Printf("Failed to convert %s image: %v", ext, err)
				http.Error(w, fmt.Sprintf("Failed to convert %s image", ext), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "image/jpeg")
			w.Header().Set("Cache-Control", "public, max-age=3600")
			w.Write(output)
			return
		} else if runtime.GOOS == "windows" {
			// Windows: try ImageMagick/magick command
			cmd := exec.Command("magick", "convert", filePath, "-resize", "300x300", "jpeg:-")
			output, err := cmd.Output()
			if err != nil {
				log.Printf("Failed to convert %s image (ImageMagick not installed?): %v", ext, err)
				http.Error(w, fmt.Sprintf("%s format not supported on Windows without ImageMagick", ext), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "image/jpeg")
			w.Header().Set("Cache-Control", "public, max-age=3600")
			w.Write(output)
			return
		} else {
			// Linux: try ImageMagick
			cmd := exec.Command("convert", filePath, "-resize", "300x300", "jpeg:-")
			output, err := cmd.Output()
			if err != nil {
				log.Printf("Failed to convert %s image (ImageMagick not installed?): %v", ext, err)
				http.Error(w, fmt.Sprintf("%s format not supported without ImageMagick", ext), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "image/jpeg")
			w.Header().Set("Cache-Control", "public, max-age=3600")
			w.Write(output)
			return
		}
	}

	file, err := os.Open(filePath)
	if err != nil {
		http.Error(w, "Failed to open image", http.StatusInternalServerError)
		return
	}
	defer file.Close()

	img, _, err := image.Decode(file)
	if err != nil {
		http.Error(w, "Failed to decode image", http.StatusInternalServerError)
		return
	}

	thumbnail := resize.Thumbnail(300, 300, img, resize.Lanczos3)

	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	jpeg.Encode(w, thumbnail, &jpeg.Options{Quality: 85})
}

func (app *App) generateVideoThumbnail(w http.ResponseWriter, filePath string) {
	// Use ffmpeg to extract first frame
	cmd := exec.Command("ffmpeg", "-i", filePath, "-vframes", "1", "-vf", "scale=300:-1", "-f", "image2pipe", "-vcodec", "png", "-")
	output, err := cmd.Output()
	if err != nil {
		// Fallback: send a placeholder or error
		http.Error(w, "Failed to generate video thumbnail", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.Write(output)
}

func (app *App) handlePreview(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/preview/"), "/")
	if len(parts) < 2 {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	shareID := parts[0]
	fileName := strings.Join(parts[1:], "/")

	app.mu.RLock()
	share, exists := app.shares[shareID]
	app.mu.RUnlock()

	if !exists {
		http.Error(w, "Share not found", http.StatusNotFound)
		return
	}

	filePath := filepath.Join(share.FolderPath, fileName)
	if !strings.HasPrefix(filepath.Clean(filePath), filepath.Clean(share.FolderPath)) {
		http.Error(w, "Invalid file path", http.StatusBadRequest)
		return
	}

	ext := strings.ToLower(filepath.Ext(fileName))
	
	// Convert HEIC/HEIF and RAW to JPEG for preview
	if ext == ".heic" || ext == ".heif" || ext == ".dng" || ext == ".cr2" || ext == ".nef" || ext == ".arw" {
		var cmd *exec.Cmd
		if runtime.GOOS == "darwin" {
			cmd = exec.Command("sips", "-s", "format", "jpeg", filePath, "--out", "/dev/stdout")
		} else if runtime.GOOS == "windows" {
			cmd = exec.Command("magick", "convert", filePath, "jpeg:-")
		} else {
			cmd = exec.Command("convert", filePath, "jpeg:-")
		}
		
		output, err := cmd.Output()
		if err != nil {
			log.Printf("Failed to convert %s image for preview: %v", ext, err)
			http.Error(w, fmt.Sprintf("Failed to convert %s image", ext), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "image/jpeg")
		w.Write(output)
		return
	}
	
	if isImageFile(ext) {
		w.Header().Set("Content-Type", "image/"+strings.TrimPrefix(ext, "."))
	} else if isVideoFile(ext) {
		w.Header().Set("Content-Type", "video/"+strings.TrimPrefix(ext, "."))
		w.Header().Set("Accept-Ranges", "bytes")
	} else {
		http.Error(w, "Not a media file", http.StatusBadRequest)
		return
	}

	http.ServeFile(w, r, filePath)
}

func (app *App) handleCheckCloudflared(w http.ResponseWriter, r *http.Request) {
	var paths []string
	var installCommand string
	
	if runtime.GOOS == "windows" {
		paths = []string{
			`C:\Program Files\cloudflared\cloudflared.exe`,
			`C:\Program Files (x86)\cloudflared\cloudflared.exe`,
		}
		installCommand = "Download from https://github.com/cloudflare/cloudflared/releases and run: cloudflared.exe service install"
	} else if runtime.GOOS == "darwin" {
		paths = []string{
			"/opt/homebrew/bin/cloudflared",
			"/usr/local/bin/cloudflared",
		}
		installCommand = "brew install cloudflare/cloudflare/cloudflared"
	} else {
		// Linux
		paths = []string{
			"/usr/local/bin/cloudflared",
			"/usr/bin/cloudflared",
		}
		installCommand = "wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared"
	}

	installed := false
	for _, path := range paths {
		if _, err := os.Stat(path); err == nil {
			installed = true
			break
		}
	}

	if !installed {
		// Check if it's in PATH
		if _, err := exec.LookPath("cloudflared"); err == nil {
			installed = true
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"installed":       installed,
		"install_command": installCommand,
		"platform":        runtime.GOOS,
	})
}

const passwordTemplate = `<!DOCTYPE html>
<html>
<head>
    <title>ShareDrop 💦</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; 
            background: #000; 
            min-height: 100vh; 
            display: flex; 
            align-items: center; 
            justify-content: center;
            color: #fafafa;
        }
        .container { max-width: 400px; width: 100%; padding: 20px; }
        .card { background: #0a0a0a; border: 1px solid #1a1a1a; border-radius: 12px; padding: 32px; }
        h1 { font-size: 28px; font-weight: 600; color: #fafafa; margin-bottom: 8px; text-align: center; }
        .subtitle { text-align: center; color: #888; font-size: 14px; margin-bottom: 24px; }
        input[type="password"] { 
            width: 100%; 
            padding: 12px; 
            background: #000; 
            border: 1px solid #333; 
            border-radius: 8px; 
            font-size: 14px; 
            margin-bottom: 16px;
            color: #fafafa;
        }
        input[type="password"]:focus { outline: none; border-color: #555; }
        button { 
            width: 100%; 
            padding: 12px 24px; 
            background: #fafafa; 
            color: #000; 
            border: none; 
            border-radius: 8px; 
            font-size: 14px; 
            font-weight: 600; 
            cursor: pointer;
            transition: all 0.2s;
        }
        button:hover { background: #e0e0e0; }
        .error { color: #ff4444; margin-top: 12px; font-size: 14px; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <h1>💦 ShareDrop</h1>
            <div class="subtitle">Enter password to access files</div>
            <form method="POST">
                <input type="password" name="password" placeholder="Password" required autofocus>
                <button type="submit">Access Files</button>
            </form>
        </div>
    </div>
</body>
</html>`

const browseTemplate = `<!DOCTYPE html>
<html>
<head>
    <title>ShareDrop 💦</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; 
            background: #000; 
            min-height: 100vh;
            color: #fafafa;
            padding: 20px;
        }
        .header { 
            max-width: 1200px; 
            margin: 0 auto 24px; 
            padding: 24px;
            background: #0a0a0a; 
            border: 1px solid #1a1a1a; 
            border-radius: 12px;
        }
        h1 { font-size: 28px; font-weight: 600; margin-bottom: 8px; }
        .subtitle { color: #888; font-size: 14px; }
        .controls { 
            max-width: 1200px; 
            margin: 0 auto 16px; 
            display: flex; 
            gap: 12px;
            align-items: center;
        }
        .btn { 
            padding: 10px 20px; 
            background: #fafafa; 
            color: #000; 
            border: none; 
            border-radius: 8px; 
            font-size: 14px; 
            font-weight: 600; 
            cursor: pointer;
            transition: all 0.2s;
        }
        .btn:hover { background: #e0e0e0; }
        .btn:disabled { background: #333; color: #666; cursor: not-allowed; }
        .select-all { margin-left: auto; }
        .view-toggle { display: flex; gap: 8px; }
        .view-toggle button { padding: 8px 16px; font-size: 13px; }
        .view-toggle button.active { background: #e0e0e0; }
        
        .file-list { 
            max-width: 1200px; 
            margin: 0 auto; 
            background: #0a0a0a; 
            border: 1px solid #1a1a1a; 
            border-radius: 12px;
            overflow: hidden;
        }
        .file-item { 
            display: flex; 
            align-items: center; 
            padding: 16px 20px; 
            border-bottom: 1px solid #1a1a1a; 
            transition: background 0.2s;
        }
        .file-item:hover { background: #111; }
        .file-item:last-child { border-bottom: none; }
        .checkbox { 
            width: 20px; 
            height: 20px; 
            cursor: pointer;
            margin-right: 16px;
        }
        .file-info { flex: 1; display: flex; align-items: center; gap: 16px; }
        .file-name { font-size: 14px; font-weight: 500; }
        .file-size { font-size: 12px; color: #888; }
        .file-details { flex: 1; }
        .thumbnail { 
            width: 60px; 
            height: 60px; 
            object-fit: cover; 
            border-radius: 6px; 
            background: #1a1a1a;
            cursor: pointer;
        }
        .action-btns { display: flex; gap: 8px; }
        .action-btn { 
            padding: 8px 16px; 
            background: #fafafa; 
            color: #000; 
            border: none; 
            border-radius: 6px; 
            font-size: 13px; 
            font-weight: 600; 
            cursor: pointer;
            transition: all 0.2s;
            text-decoration: none;
        }
        .action-btn:hover { background: #e0e0e0; }
        .action-btn.secondary { background: #333; color: #fafafa; }
        .action-btn.secondary:hover { background: #444; }

        /* Grid view */
        .grid-view { 
            max-width: 1200px; 
            margin: 0 auto;
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 16px;
        }
        .grid-item { 
            background: #0a0a0a; 
            border: 1px solid #1a1a1a; 
            border-radius: 12px;
            overflow: hidden;
            transition: all 0.2s;
            position: relative;
        }
        .grid-item:hover { border-color: #333; transform: translateY(-2px); }
        .grid-thumbnail { 
            width: 100%; 
            height: 200px; 
            object-fit: cover; 
            background: #1a1a1a;
            cursor: pointer;
        }
        .grid-info { padding: 12px; }
        .grid-name { font-size: 13px; font-weight: 500; margin-bottom: 4px; word-break: break-word; }
        .grid-size { font-size: 11px; color: #888; }
        .grid-checkbox { position: absolute; top: 10px; left: 10px; width: 24px; height: 24px; }
        .grid-actions { padding: 0 12px 12px; display: flex; gap: 8px; }
        .grid-actions button { flex: 1; padding: 6px; font-size: 12px; }

        /* Modal */
        .modal { 
            display: none; 
            position: fixed; 
            top: 0; 
            left: 0; 
            width: 100%; 
            height: 100%; 
            background: rgba(0,0,0,0.95);
            z-index: 1000;
            align-items: center;
            justify-content: center;
        }
        .modal.show { display: flex; }
        .modal-content { 
            max-width: 90%; 
            max-height: 90%; 
            position: relative;
        }
        .modal-content img { 
            max-width: 100%; 
            max-height: 90vh; 
            object-fit: contain;
        }
        .modal-content video { 
            max-width: 100%; 
            max-height: 90vh;
        }
        .modal-close { 
            position: absolute; 
            top: -40px; 
            right: 0; 
            background: none; 
            border: none; 
            color: #fafafa; 
            font-size: 32px; 
            cursor: pointer;
            padding: 0 10px;
        }
        .modal-nav { 
            position: absolute; 
            top: 50%; 
            transform: translateY(-50%);
            background: rgba(0,0,0,0.7);
            border: none; 
            color: #fafafa; 
            font-size: 48px; 
            cursor: pointer;
            padding: 20px 15px;
            transition: all 0.2s;
            user-select: none;
            border-radius: 4px;
        }
        .modal-nav:hover { background: rgba(0,0,0,0.9); }
        .modal-nav:disabled { opacity: 0.3; cursor: not-allowed; }
        .modal-nav.prev { left: 20px; }
        .modal-nav.next { right: 20px; }
        .modal-filename { 
            color: #fafafa; 
            text-align: center; 
            margin-top: 20px; 
            font-size: 16px;
        }
        .modal-counter {
            position: absolute;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.7);
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            color: #fafafa;
        }
        .hidden { display: none !important; }
    </style>
</head>
<body>
    <div class="header">
        <h1>💦 ShareDrop</h1>
        <div class="subtitle">Select files to download</div>
    </div>
    
    <div class="controls">
        <button class="btn" onclick="downloadSelected()" id="downloadBtn" disabled>Download Selected</button>
        <div class="view-toggle">
            <button class="btn active" id="listViewBtn" onclick="switchView('list')">List</button>
            <button class="btn" id="gridViewBtn" onclick="switchView('grid')">Grid</button>
        </div>
        <button class="btn select-all" onclick="toggleSelectAll()">Select All</button>
    </div>

    <div class="file-list" id="listView">
        {{range .Files}}
        <div class="file-item" data-filename="{{.Name}}">
            <input type="checkbox" class="checkbox" data-filename="{{.Name}}" onchange="updateDownloadBtn()">
            <div class="file-info">
                {{if or .IsImage .IsVideo}}
                <img class="thumbnail" data-filename="{{.Name}}" data-is-video="{{.IsVideo}}" alt="{{.Name}}" loading="lazy" onerror="this.style.display='none'">
                {{end}}
                <div class="file-details">
                    <div class="file-name">{{.Name}}</div>
                    <div class="file-size">{{formatSize .Size}}</div>
                </div>
            </div>
            <div class="action-btns">
                {{if or .IsImage .IsVideo}}
                <button class="action-btn secondary" data-filename="{{.Name}}" data-is-video="{{.IsVideo}}" onclick="openPreviewFromButton(this)">Preview</button>
                {{end}}
                <button class="action-btn" data-filename="{{.Name}}" onclick="downloadFileFromButton(this)">Download</button>
            </div>
        </div>
        {{end}}
    </div>

    <div class="grid-view hidden" id="gridView">
        {{range .Files}}
        <div class="grid-item" data-filename="{{.Name}}">
            <input type="checkbox" class="grid-checkbox checkbox" data-filename="{{.Name}}" onchange="updateDownloadBtn()">
            {{if or .IsImage .IsVideo}}
            <img class="grid-thumbnail" data-filename="{{.Name}}" data-is-video="{{.IsVideo}}" alt="{{.Name}}" loading="lazy" onerror="this.style.display='none'">
            {{else}}
            <div class="grid-thumbnail" style="display: flex; align-items: center; justify-content: center; font-size: 48px;">📄</div>
            {{end}}
            <div class="grid-info">
                <div class="grid-name">{{.Name}}</div>
                <div class="grid-size">{{formatSize .Size}}</div>
            </div>
            <div class="grid-actions">
                {{if or .IsImage .IsVideo}}
                <button class="action-btn secondary" data-filename="{{.Name}}" data-is-video="{{.IsVideo}}" onclick="openPreviewFromButton(this)">Preview</button>
                {{end}}
                <button class="action-btn" data-filename="{{.Name}}" onclick="downloadFileFromButton(this)">Download</button>
            </div>
        </div>
        {{end}}
    </div>

    <div class="modal" id="previewModal" onclick="closeModalOnBackdrop(event)">
        <div class="modal-content">
            <button class="modal-close" onclick="closeModal(event)">×</button>
            <div class="modal-counter" id="modalCounter"></div>
            <button class="modal-nav prev" id="prevBtn" onclick="navigatePreview(-1)">‹</button>
            <button class="modal-nav next" id="nextBtn" onclick="navigatePreview(1)">›</button>
            <img id="previewImage" class="hidden" />
            <video id="previewVideo" class="hidden" controls></video>
            <div class="modal-filename" id="modalFilename"></div>
        </div>
    </div>

    <script>
        const shareID = '{{.ShareID}}';
        let currentView = 'list';
        let mediaFiles = []; // Array of all media files
        let currentMediaIndex = 0; // Current file being viewed
        
        function updateDownloadBtn() {
            const checked = document.querySelectorAll('.checkbox:checked').length;
            const btn = document.getElementById('downloadBtn');
            btn.disabled = checked === 0;
            btn.textContent = checked > 0 ? 'Download Selected (' + checked + ')' : 'Download Selected';
        }
        
        function toggleSelectAll() {
            const checkboxes = document.querySelectorAll('.checkbox:checked');
            const allCheckboxes = document.querySelectorAll('.checkbox');
            const allChecked = checkboxes.length === allCheckboxes.length;
            allCheckboxes.forEach(cb => cb.checked = !allChecked);
            updateDownloadBtn();
        }
        
        function downloadFile(filename) {
            window.location.href = '/download/' + shareID + '/' + encodeURIComponent(filename);
        }
        
        function downloadSelected() {
            const selected = Array.from(document.querySelectorAll('.checkbox:checked'))
                .map(cb => cb.getAttribute('data-filename'));
            selected.forEach((filename, index) => {
                setTimeout(() => downloadFile(filename), index * 100);
            });
        }

        function switchView(view) {
            currentView = view;
            const listView = document.getElementById('listView');
            const gridView = document.getElementById('gridView');
            const listBtn = document.getElementById('listViewBtn');
            const gridBtn = document.getElementById('gridViewBtn');

            if (view === 'list') {
                listView.classList.remove('hidden');
                gridView.classList.add('hidden');
                listBtn.classList.add('active');
                gridBtn.classList.remove('active');
            } else {
                listView.classList.add('hidden');
                gridView.classList.remove('hidden');
                listBtn.classList.remove('active');
                gridBtn.classList.add('active');
            }
        }

        function openPreview(filename, isVideo) {
            // Find the index of this file in mediaFiles array
            currentMediaIndex = mediaFiles.findIndex(f => f.name === filename);
            if (currentMediaIndex === -1) currentMediaIndex = 0;
            
            showPreviewAtIndex(currentMediaIndex);
        }
        
        function showPreviewAtIndex(index) {
            if (index < 0 || index >= mediaFiles.length) return;
            
            currentMediaIndex = index;
            const file = mediaFiles[index];
            
            const modal = document.getElementById('previewModal');
            const img = document.getElementById('previewImage');
            const video = document.getElementById('previewVideo');
            const filenameEl = document.getElementById('modalFilename');
            const counter = document.getElementById('modalCounter');
            const prevBtn = document.getElementById('prevBtn');
            const nextBtn = document.getElementById('nextBtn');

            filenameEl.textContent = file.name;
            counter.textContent = (index + 1) + ' / ' + mediaFiles.length;
            
            // Update navigation buttons
            prevBtn.disabled = index === 0;
            nextBtn.disabled = index === mediaFiles.length - 1;

            if (file.isVideo) {
                img.classList.add('hidden');
                video.classList.remove('hidden');
                video.src = '/preview/' + shareID + '/' + encodeURIComponent(file.name);
                video.load();
            } else {
                video.classList.add('hidden');
                img.classList.remove('hidden');
                img.src = '/preview/' + shareID + '/' + encodeURIComponent(file.name);
            }

            modal.classList.add('show');
        }
        
        function navigatePreview(direction) {
            const newIndex = currentMediaIndex + direction;
            if (newIndex >= 0 && newIndex < mediaFiles.length) {
                showPreviewAtIndex(newIndex);
            }
        }

        function closeModalOnBackdrop(event) {
            if (event.target.id === 'previewModal') {
                closeModal(event);
            }
        }
        
        function closeModal(event) {
            const modal = document.getElementById('previewModal');
            const video = document.getElementById('previewVideo');
            video.pause();
            video.src = '';
            modal.classList.remove('show');
        }

        document.addEventListener('keydown', (e) => {
            const modal = document.getElementById('previewModal');
            if (modal.classList.contains('show')) {
                if (e.key === 'Escape') {
                    closeModal({target: modal});
                } else if (e.key === 'ArrowLeft') {
                    navigatePreview(-1);
                } else if (e.key === 'ArrowRight') {
                    navigatePreview(1);
                }
            }
        });
        
        // Helper functions for buttons with data attributes
        function openPreviewFromButton(button) {
            const filename = button.getAttribute('data-filename');
            const isVideo = button.getAttribute('data-is-video') === 'true';
            openPreview(filename, isVideo);
        }
        
        function downloadFileFromButton(button) {
            const filename = button.getAttribute('data-filename');
            downloadFile(filename);
        }
        
        // Load thumbnails dynamically with proper URL encoding
        document.addEventListener('DOMContentLoaded', () => {
            // Build array of all media files for navigation
            document.querySelectorAll('.file-item, .grid-item').forEach(item => {
                const filename = item.getAttribute('data-filename');
                const hasMedia = item.querySelector('img.thumbnail, img.grid-thumbnail');
                if (hasMedia) {
                    const isVideo = hasMedia.getAttribute('data-is-video') === 'true';
                    mediaFiles.push({ name: filename, isVideo: isVideo });
                }
            });
            
            // Load thumbnails for all images
            document.querySelectorAll('img.thumbnail, img.grid-thumbnail').forEach(img => {
                const filename = img.getAttribute('data-filename');
                const isVideo = img.getAttribute('data-is-video') === 'true';
                if (filename) {
                    img.src = '/thumbnail/' + shareID + '/' + encodeURIComponent(filename);
                    // Make thumbnail clickable
                    img.onclick = function() {
                        openPreview(filename, isVideo);
                    };
                }
            });
        });
    </script>
</body>
</html>`

func main() {
	app := NewApp()

	http.HandleFunc("/api/shares", app.handleCreateShare)
	http.HandleFunc("/api/check-cloudflared", app.handleCheckCloudflared)
	http.HandleFunc("/share/", app.handleSharePage)
	http.HandleFunc("/download/", app.handleDownload)
	http.HandleFunc("/thumbnail/", app.handleThumbnail)
	http.HandleFunc("/preview/", app.handlePreview)

	log.Println("File Share Server starting on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
