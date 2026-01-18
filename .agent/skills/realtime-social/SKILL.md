---
name: realtime-social
description: Implements realtime features such as presence, chat, and signaling. Use for WebSocket or WebRTC work.
---

# Realtime Social Skill

## Order of implementation
1. Presence
2. Text chat
3. Voice calls

## Chat rules
- Twitch-style: fast, simple, scroll-first
- No message persistence in v1

## WebRTC
- Use WebSockets for signaling
- Prefer peer-to-peer initially
- Explain scaling limits clearly
