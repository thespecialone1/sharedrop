#!/bin/bash

# Build script for ShareDrop Mac app

echo "🔨 Building ShareDrop for macOS..."
echo ""

# Step 1: Build Go backend
echo "1️⃣  Building Go backend..."
go build -o file-share-app main.go
if [ $? -ne 0 ]; then
    echo "❌ Failed to build Go backend"
    exit 1
fi
echo "✅ Go backend built successfully"
echo ""

# Step 2: Convert icon to .icns (macOS native format) if not exists
if [ ! -f "icon.icns" ] && [ -f "icon.png" ]; then
    echo "2️⃣  Converting icon to .icns format..."
    mkdir -p icon.iconset
    
    # Create icon at different sizes
    sips -z 16 16     icon.png --out icon.iconset/icon_16x16.png
    sips -z 32 32     icon.png --out icon.iconset/icon_16x16@2x.png
    sips -z 32 32     icon.png --out icon.iconset/icon_32x32.png
    sips -z 64 64     icon.png --out icon.iconset/icon_32x32@2x.png
    sips -z 128 128   icon.png --out icon.iconset/icon_128x128.png
    sips -z 256 256   icon.png --out icon.iconset/icon_128x128@2x.png
    sips -z 256 256   icon.png --out icon.iconset/icon_256x256.png
    sips -z 512 512   icon.png --out icon.iconset/icon_256x256@2x.png
    sips -z 512 512   icon.png --out icon.iconset/icon_512x512.png
    sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png
    
    # Convert to .icns
    iconutil -c icns icon.iconset
    rm -rf icon.iconset
    
    echo "✅ Icon converted to .icns"
else
    echo "2️⃣  Using existing icon.icns"
fi
echo ""

# Step 3: Build Electron app
echo "3️⃣  Building Electron app..."
npm run build:mac
if [ $? -ne 0 ]; then
    echo "❌ Failed to build Electron app"
    exit 1
fi
echo "✅ Electron app built successfully"
echo ""

# Step 4: Show results
echo "========================================="
echo "✨ Build Complete!"
echo "========================================="
echo ""

if [ -d "dist/mac" ]; then
    echo "📦 DMG file created:"
    ls -lh dist/*.dmg 2>/dev/null
    echo ""
    echo "📱 App bundle:"
    ls -lh dist/mac/*.app 2>/dev/null
    echo ""
    echo "Location: $(pwd)/dist/"
else
    echo "⚠️  Build output not found in dist/ directory"
fi

echo ""
echo "To test the app:"
echo "  npm start"
echo ""
echo "To install the DMG:"
echo "  open dist/*.dmg"
