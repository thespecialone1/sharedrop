#!/bin/bash

# File Share Mac App Launcher
cd "$(dirname "$0")"

# Check if port is already in use
PORT=8080
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null ; then
    echo "Port $PORT is already in use. Killing existing process..."
    lsof -ti:$PORT | xargs kill -9 2>/dev/null
    sleep 1
fi

# Start the server in background
./file-share-app &
SERVER_PID=$!

# Wait for server to start
sleep 2

# Try to get local IP
LOCAL_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -n 1)
PORT=8080

echo "========================================="
echo "File Share Server Started"
echo "========================================="
echo ""
echo "Local Access:"
echo "  http://localhost:$PORT"
echo ""
if [ ! -z "$LOCAL_IP" ]; then
    echo "Network Access:"
    echo "  http://$LOCAL_IP:$PORT"
    echo ""
fi

# Check if cloudflared is available
if command -v cloudflared &> /dev/null; then
    echo "Starting Cloudflare tunnel..."
    cloudflared tunnel --url http://localhost:$PORT > /tmp/cloudflared.log 2>&1 &
    CLOUDFLARED_PID=$!
    
    # Wait and extract URL from logs
    for i in {1..10}; do
        sleep 1
        TUNNEL_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/cloudflared.log 2>/dev/null | head -n 1)
        if [ ! -z "$TUNNEL_URL" ]; then
            echo "Public Access (Cloudflare):"
            echo "  $TUNNEL_URL"
            echo ""
            break
        fi
    done
    
    if [ -z "$TUNNEL_URL" ]; then
        echo "Note: Cloudflare tunnel started but URL not detected yet"
        echo "Check /tmp/cloudflared.log for the URL"
        echo ""
    fi
else
    echo "For internet access, install cloudflared:"
    echo "  brew install cloudflare/cloudflare/cloudflared"
    echo ""
fi

echo "========================================="
echo "Press Ctrl+C to stop the server"
echo "========================================="

# Open browser
open "http://localhost:$PORT"

# Wait for interrupt
trap "kill $SERVER_PID 2>/dev/null; [ ! -z '$CLOUDFLARED_PID' ] && kill $CLOUDFLARED_PID 2>/dev/null; exit" INT TERM

wait $SERVER_PID
