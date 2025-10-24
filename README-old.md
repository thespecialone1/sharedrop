# File Share

Share local folders without uploading. Files stay on your machine, clients download directly.

## Features

- No file uploads - serve directly from your filesystem
- Password protected shares
- Download activity monitoring
- Simple web interface
- Single binary, no dependencies

## Quick Start

### Mac

Double-click `run-app.sh` or run:

```bash
./run-app.sh
```

This will:
1. Start the server
2. Open your browser automatically
3. Show you the local and network URLs
4. Set up Cloudflare tunnel automatically (for internet access)

### Manual Start

```bash
./file-share-app
```

Then visit `http://localhost:8080`

## How to Use

1. **Create a share**: Enter a folder path (e.g., `/Users/name/Pictures`)
2. **Copy the link and password** using the copy buttons
3. **Send to your client** - they can access from anywhere if you're using ngrok
4. **Monitor downloads** in the Activity section

## Internet Access

The app automatically uses Cloudflare Tunnel if installed (no signup required).

**Install Cloudflare Tunnel:**
```bash
brew install cloudflare/cloudflare/cloudflared
```

Then just run `./run-app.sh` and you'll get a public URL like:
```
https://abc123.trycloudflare.com
```

Share this URL with anyone - they can access your files from anywhere.

## Usage

### Admin Panel Features

- **Create Shares**: Connect any local folder
- **View Active Shares**: See all current shares with their links and passwords
- **Monitor Activity**: Real-time log of who's downloading what
- **Delete Shares**: Remove access instantly

### Client Features

- **Browse Folders**: Navigate through directories
- **Download Files**: Direct download using client's bandwidth
- **Secure Access**: Password required for each share

## Network Setup

### Local Network (LAN) Testing
- Share `http://YOUR_LOCAL_IP:8080/share/...` with devices on the same network
- Find your local IP: `ifconfig | grep "inet " | grep -v 127.0.0.1`

### Internet Access
You need to make your server accessible from the internet:

**Option 1: Port Forwarding**
1. Forward port 8080 on your router to your machine
2. Share `http://YOUR_PUBLIC_IP:8080/share/...`

**Option 2: Cloudflare Tunnel** (Recommended for Oracle server)
```bash
# Install cloudflared
# Then run:
cloudflared tunnel --url http://localhost:8080
```

**Option 3: ngrok**
```bash
ngrok http 8080
# Use the provided URL
```

## Deployment on Oracle Ubuntu Server

1. **Upload the binary**:
```bash
# On your Mac, build for Linux
GOOS=linux GOARCH=amd64 go build -o file-share-server main.go

# Upload to server
rsync -avz --progress file-share-server panda4:/home/ubuntu/
```

2. **Run on server**:
```bash
ssh panda4
chmod +x file-share-server
./file-share-server
```

3. **Run as background service** (optional):
```bash
# Create systemd service
sudo nano /etc/systemd/system/file-share.service
```

Add:
```ini
[Unit]
Description=File Share Server
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/home/your-user
ExecStart=/home/your-user/file-share-server
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable file-share
sudo systemctl start file-share
```

## Security Notes

- Shares are active as long as the server runs
- Each share has its own password
- Path traversal protection prevents accessing files outside shared folders
- Download activity is logged with client IP addresses
- Cookies expire after 24 hours

## Configuration

Set custom port:
```bash
PORT=3000 go run main.go
```

## How It Works

1. You select a local folder to share
2. The app generates a unique link and password
3. When a client accesses the link:
   - They authenticate with the password
   - Files are served directly from your filesystem
   - Downloads use their bandwidth, not yours for upload
4. All activity is logged in the admin panel

## Troubleshooting

**Cannot access from other devices:**
- Check firewall settings: `sudo ufw allow 8080`
- Verify the server is listening: `lsof -i :8080`

**Folder not found error:**
- Use absolute paths (e.g., `/Users/name/folder`, not `~/folder`)
- Ensure the folder exists and is readable

**Downloads failing:**
- Check file permissions
- Ensure the server process can read the files
