#!/bin/bash

# GitHub Release Script for ShareDrop
# Usage: ./create-release.sh <version> "<release notes>"
# Example: ./create-release.sh v1.1.0 "Added universal binary support"

set -e

VERSION=$1
NOTES=$2

if [ -z "$VERSION" ] || [ -z "$NOTES" ]; then
    echo "Usage: ./create-release.sh <version> \"<release notes>\""
    echo "Example: ./create-release.sh v1.1.0 \"Added universal binary support\""
    exit 1
fi

echo "🚀 Creating GitHub Release for $VERSION"

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed"
    echo "Install it with: brew install gh"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "❌ Not authenticated with GitHub"
    echo "Run: gh auth login"
    exit 1
fi

# Update version in package.json
echo "📝 Updating version in package.json..."
npm version $VERSION --no-git-tag-version

# Build all platforms
echo "🔨 Building for all platforms..."

echo "  📦 Building macOS (Universal)..."
npm run build:mac

echo "  📦 Building Windows..."
npm run build:win

echo "  📦 Building Linux..."
npm run build:linux

# Find build artifacts
echo "🔍 Finding build artifacts..."
DMG=$(find dist -name "*.dmg" | head -n 1)
WIN_INSTALLER=$(find dist -name "*.exe" | grep -v "Unpacked" | head -n 1)
WIN_PORTABLE=$(find dist -name "*portable*.exe" | head -n 1)
LINUX=$(find dist -name "*.AppImage" | head -n 1)

if [ -z "$DMG" ]; then
    echo "❌ macOS DMG not found"
    exit 1
fi

if [ -z "$WIN_INSTALLER" ]; then
    echo "⚠️  Windows installer not found"
fi

if [ -z "$LINUX" ]; then
    echo "⚠️  Linux AppImage not found"
fi

# Create release
echo "📤 Creating GitHub release..."
gh release create "$VERSION" \
    --title "ShareDrop $VERSION" \
    --notes "$NOTES" \
    "$DMG#macOS-Universal-DMG" \
    ${WIN_INSTALLER:+"$WIN_INSTALLER#Windows-Installer"} \
    ${WIN_PORTABLE:+"$WIN_PORTABLE#Windows-Portable"} \
    ${LINUX:+"$LINUX#Linux-AppImage"}

echo "✅ Release $VERSION created successfully!"
echo "🔗 View at: https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/releases/tag/$VERSION"
