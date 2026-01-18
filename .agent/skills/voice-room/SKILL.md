---
name: voice-room
description: Implements secure, high-quality browser-only audio rooms (WebRTC) for SharedDrop. Use when adding voice calling to a session.
---

# Voice Room Skill (for Antigravity)

## Purpose
Add an audio-only voice room that:
- is started by one owner/participant
- others may join while it is active
- preserves SharedDrop session auth and design language
- is robust, secure, and production-ready

## When to use
- Use this skill when implementing signaling, UI controls, backend cleanup, and TURN/STUN configuration for voice rooms.
- Use this instead of inventing a new approach.

## High-level rules
1. **Explore first**: trace join/session lifecycles and existing Socket.IO handlers. Identify where to wire signaling (file-server.js / Socket.IO room).
2. **Phase implementation**:
   - Phase A: Mesh WebRTC for <=6 participants (fast to ship).
   - Phase B: Add SFU (mediasoup / Janus) for scale >6 / production quality.
3. **Security**:
   - All signaling over WSS.
   - Only authenticated session participants (session password) may start/join voice.
   - Use TLS on all endpoints and secure TURN creds.
4. **TURN**:
   - Recommend coturn self-hosted OR a paid TURN provider. Provide instructions and config template.
5. **Output**:
   - Show only changed files (unified diffs).
   - Include a brief run/test checklist and instructions to add TURN credentials.
   - Do not add heavy infra (SFU) without explicit confirmation — propose and wait.

## Signaling API (required)
Implement Socket.IO events:

- client -> server:
  - `voice-start` { sessionId, username }  // request to start voice; server authorizes, creates room
  - `voice-stop` { sessionId }              // owner stops room
  - `voice-join` { sessionId, username }    // join existing voice room
  - `offer` { toSocketId, sdp }             // forward SDP offer
  - `answer` { toSocketId, sdp }            // forward SDP answer
  - `ice-candidate` { toSocketId, candidate }// forward ICE
  - `voice-leave` { sessionId }             // leave voice room

- server -> clients:
  - `voice-started` { roomId, hostSocketId }
  - `voice-stopped` { roomId }
  - `voice-joined` { socketId, username }
  - `voice-left` { socketId }
  - `offer` / `answer` / `ice-candidate` forwarded

## Backend responsibilities
- Create voice-room state per session (host socket id, participants set).
- Authorize start/join using existing session auth.
- Ensure single active host — reject `voice-start` if active.
- Forward SDP/ICE messages between peers.
- Clean up on `voice-stop`, on host disconnect, or on server shutdown.
- Emit presence and participant counts.

## Frontend responsibilities
- Add “Start Voice” button in ChatSidebar (primary small button) — becomes “Join Voice” for others when active.
- If host, show “Stop Voice” control.
- Show participant count and “speaking” indicator (visual only; optional VU meter later).
- Use `getUserMedia({ audio: true })`, create `RTCPeerConnection` per peer (mesh) in Phase A.
- Attach remote streams to hidden `<audio>` elements and autoplay with user gesture.

## Performance & scale guidance
- Mesh is OK for small groups (<= 4–6). For up to 20 participants, recommend SFU (mediasoup/Janus) because mesh causes N*(N-1) streams.
- If user expects up to ~20, present SFU as default for production; ask before adding SFU dependency.

## TURN recommendation
- Provide CONFIG template to read from env (`TURN_URL`, `TURN_USER`, `TURN_PASS`).
- Suggest coturn for self-hosting and/or a paid provider for global reliability.

## Testing checklist (must be included in agent output)
- Host starts room, others join, voice flows live.
- Mic mute/unmute works; leaving/returning works.
- Host stop destroys room and notifies clients.
- TURN fallback tested by forcing public IPs or blocking UDP.

## Output format
- Unified diffs for changed files.
- Short run/test summary (5–8 lines).
- Short note listing files explored and any assumptions.

## Do NOT
- Do not implement SFU without confirmation.
- Do not bypass session auth.
- Do not add UI redesigns; keep existing aesthetic.
