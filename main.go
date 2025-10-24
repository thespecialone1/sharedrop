package main

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
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
				Name  string
				Size  int64
				IsDir bool
			}

			var fileList []FileInfo
			for _, file := range files {
				if !file.IsDir() {
					info, _ := file.Info()
					fileList = append(fileList, FileInfo{
						Name:  file.Name(),
						Size:  info.Size(),
						IsDir: false,
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
            max-width: 900px; 
            margin: 0 auto 24px; 
            padding: 24px;
            background: #0a0a0a; 
            border: 1px solid #1a1a1a; 
            border-radius: 12px;
        }
        h1 { font-size: 28px; font-weight: 600; margin-bottom: 8px; }
        .subtitle { color: #888; font-size: 14px; }
        .controls { 
            max-width: 900px; 
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
        .file-list { 
            max-width: 900px; 
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
        .file-info { flex: 1; }
        .file-name { font-size: 14px; font-weight: 500; margin-bottom: 4px; }
        .file-size { font-size: 12px; color: #888; }
        .download-btn { 
            padding: 8px 16px; 
            background: #fafafa; 
            color: #000; 
            border: none; 
            border-radius: 6px; 
            font-size: 13px; 
            font-weight: 600; 
            cursor: pointer;
            transition: all 0.2s;
        }
        .download-btn:hover { background: #e0e0e0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>💦 ShareDrop</h1>
        <div class="subtitle">Select files to download</div>
    </div>
    
    <div class="controls">
        <button class="btn" onclick="downloadSelected()" id="downloadBtn" disabled>Download Selected</button>
        <button class="btn select-all" onclick="toggleSelectAll()">Select All</button>
    </div>

    <div class="file-list" id="fileList">
        {{range .Files}}
        <div class="file-item">
            <input type="checkbox" class="checkbox" data-filename="{{.Name}}" onchange="updateDownloadBtn()">
            <div class="file-info">
                <div class="file-name">{{.Name}}</div>
                <div class="file-size">{{formatSize .Size}}</div>
            </div>
            <button class="download-btn" onclick="downloadFile('{{.Name}}')">Download</button>
        </div>
        {{end}}
    </div>

    <script>
        const shareID = '{{.ShareID}}';
        
        function updateDownloadBtn() {
            const checked = document.querySelectorAll('.checkbox:checked').length;
            const btn = document.getElementById('downloadBtn');
            btn.disabled = checked === 0;
            btn.textContent = checked > 0 ? 'Download Selected (' + checked + ')' : 'Download Selected';
        }
        
        function toggleSelectAll() {
            const checkboxes = document.querySelectorAll('.checkbox');
            const allChecked = Array.from(checkboxes).every(cb => cb.checked);
            checkboxes.forEach(cb => cb.checked = !allChecked);
            updateDownloadBtn();
        }
        
        function downloadFile(filename) {
            window.location.href = '/download/' + shareID + '/' + filename;
        }
        
        function downloadSelected() {
            const selected = Array.from(document.querySelectorAll('.checkbox:checked'))
                .map(cb => cb.getAttribute('data-filename'));
            selected.forEach(filename => {
                setTimeout(() => downloadFile(filename), 100);
            });
        }
    </script>
</body>
</html>`

func main() {
	app := NewApp()

	http.HandleFunc("/api/shares", app.handleCreateShare)
	http.HandleFunc("/share/", app.handleSharePage)
	http.HandleFunc("/download/", app.handleDownload)

	log.Println("File Share Server starting on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
