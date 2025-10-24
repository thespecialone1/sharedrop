# ShareDrop - Mac App Distribution

## What You Have

`ShareDrop-Mac.zip` - A complete Mac application users can download and use.

## How Users Install

1. Download `ShareDrop-Mac.zip`
2. Unzip it
3. Drag `ShareDrop.app` to Applications folder
4. Double-click to run

## What It Does

- Shows a dialog with all access URLs (local, network, internet)
- Automatically opens browser to http://localhost:8080
- Runs in background
- Sets up Cloudflare tunnel automatically (if installed)

## For Internet Sharing

Users need to install cloudflared once:
```bash
brew install cloudflare/cloudflare/cloudflared
```

Then ShareDrop will automatically create public URLs every time it runs.

## To Upload for Distribution

Upload `ShareDrop-Mac.zip` to:
- Your website
- GitHub Releases
- Dropbox/Google Drive
- Any file hosting

Users download, unzip, and double-click. That's it.

## File Location

The app is at:
`/Users/lahrasab/VS Code/file-share-app/ShareDrop-Mac.zip`
