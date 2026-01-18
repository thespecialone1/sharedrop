---
name: electron-owner-app
description: Guides development of the Electron desktop app responsible for local folder sharing and tunnel control.
---

# Electron Owner App Skill

## Responsibilities
- Select local directory
- Start/stop backend services
- Manage Cloudflare tunnel lifecycle
- Display share link and password

## Rules
- File system access stays in Electron main process
- UI logic stays in renderer
- Never expose raw file paths to the web client
- Assume cross-platform (macOS, Windows, Linux)

## UI principles
- Minimal controls
- Clear state indicators (running / stopped)
- No advanced settings in v1
