# Release Instructions

## One-Time Setup

1. **Create GitHub repository:**
   ```bash
   # Create new repo on GitHub at: https://github.com/new
   # Name it: sharedrop
   # Keep it public
   # Don't initialize with README (we already have one)
   ```

2. **Add remote and push:**
   ```bash
   git remote add origin https://github.com/thespecialone1/sharedrop.git
   git branch -M main
   git push -u origin main
   git push --tags
   ```

## Creating a Release

### Manual Release (GitHub Web UI)

1. Go to your repository: https://github.com/thespecialone1/sharedrop
2. Click "Releases" → "Create a new release"
3. Choose tag: `v1.0.0`
4. Release title: `ShareDrop v1.0.0`
5. Copy content from `CHANGELOG.md` for description
6. Upload the DMG file: `dist/ShareDrop-1.0.0-arm64.dmg`
7. Check "Set as the latest release"
8. Click "Publish release"

### Automated Release (GitHub CLI)

```bash
# Install GitHub CLI if needed
brew install gh

# Login
gh auth login

# Create release with file
gh release create v1.0.0 \
  dist/ShareDrop-1.0.0-arm64.dmg \
  --title "ShareDrop v1.0.0" \
  --notes-file CHANGELOG.md
```

## Future Releases

1. **Update version in package.json**
   ```json
   "version": "1.1.0"
   ```

2. **Update CHANGELOG.md** with new features/fixes

3. **Build new version:**
   ```bash
   go build -o file-share-app main.go
   npm run build:mac
   ```

4. **Commit, tag, and release:**
   ```bash
   git add -A
   git commit -m "Release v1.1.0 - <description>"
   git tag v1.1.0
   git push origin main
   git push --tags
   
   # Create GitHub release
   gh release create v1.1.0 \
     dist/ShareDrop-1.1.0-arm64.dmg \
     --title "ShareDrop v1.1.0" \
     --notes-file CHANGELOG.md
   ```

5. **Update README.md** download links to point to new version

## Building for Intel Macs

```bash
# Build Go binary for Intel
GOOS=darwin GOARCH=amd64 go build -o file-share-app main.go

# Build Electron app for Intel
npm run build:mac -- --x64

# The DMG will be at: dist/ShareDrop-1.0.0.dmg
```

## Testing Before Release

```bash
# Test with npm start
npm start

# Test the built DMG
open dist/ShareDrop-1.0.0-arm64.dmg
# Install and test the app
```

## Download Statistics

View download statistics in GitHub Insights:
https://github.com/thespecialone1/sharedrop/graphs/traffic
