#!/bin/bash

# ShareDrop - Single Command Startup Script
# This script stops any running instances and starts the app cleanly

echo "🛑 Stopping any running instances..."
pkill -f "file-share-app" 2>/dev/null || true
pkill -f "go run main.go" 2>/dev/null || true
sleep 1

echo "🔨 Rebuilding Go binary..."
go build -o file-share-app main.go

echo "🚀 Starting ShareDrop..."
npm start
