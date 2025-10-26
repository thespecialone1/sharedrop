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

## Universal Binary (Intel + Apple Silicon)

The build process now automatically creates a **universal binary** that works on both Intel and Apple Silicon Macs.

```bash
# Build universal binary (automatically done by npm run build:mac)
npm run prebuild  # Creates universal Go binary
npm run build:mac # Packages into universal DMG

# Verify it's universal
lipo -info file-share-app
# Output: Architectures in the fat file: file-share-app are: x86_64 arm64
```

The resulting DMG will work on **both Intel and Apple Silicon** Macs.

## Automated Release Script

Use the automated release script to build and publish all platforms at once:

```bash
./create-release.sh v1.2.0 "Added universal binary support"
```

This will:
- Build universal macOS binary (Intel + Apple Silicon)
- Build Windows x64 installer and portable
- Build Linux AppImage
- Create GitHub release with all artifacts

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
