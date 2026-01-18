# Project Vision: Local Folder Sharing App

## Overview
This app allows a user to share a local folder over the internet via a Cloudflare Tunnel.  
Multiple users can view files, preview them, and download them securely with a password.  
It will have both a **cross-platform Electron desktop app** (owner) and a **Web app** (guest).  
The UI should be modern, clean, and visually appealing, inspired by Apple/Google product design principles.

---

## Phases

### Phase 1 – Core Sharing & UI
- Electron app:
  - Select a local folder
  - Start/stop Cloudflare tunnel
  - Generate public link + password
- Web app:
  - Browse shared directory
  - Preview images/videos in a dialog/modal
  - Download files via button
  - Support HEIC, DNG, RAW by converting previews to JPEG
- UI/UX:
  - Use React + Vite + Tailwind + shadcn/ui
  - Gallery layout for files (grid/masonry)
  - Preview modal (zoom, next/prev, download)
  - Tabs for sections: Files / Preview / Info
  - Skeletons for lazy-loading placeholders
  - Clean typography, white space, soft shadows, one accent color
- No extra features like chat, username, or voice calls yet

### Phase 2 – Multi-user & Presence
- Users pick a unique username
- List of active users
- Basic chat between users

### Phase 3 – Social Layer
- Twitch-style chat UI
- Group voice/video calls (WebRTC)
- Reactions/notifications

---

## Rules & Constraints
- Do not skip phases
- Follow design and UI rules strictly (see `ui-design-system` skill)
- All files served read-only
- Password-protect all tunnels
- Ask before adding new dependencies or features outside vision
- Keep Electron & Web apps consistent in style and functionality

---

## Design Principles
- Minimal, calm, modern design
- One accent color
- Soft shadows, rounded corners
- White space prioritized over borders or clutter
- Subtle hover states and animations only
- Avoid flashy, generic, or purple-heavy themes
