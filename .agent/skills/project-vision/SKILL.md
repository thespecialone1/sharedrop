---
name: project-vision
description: Enforces the product vision, scope boundaries, and phase-based development. Use for any planning or architectural decision.
---

# Project Vision Skill

## Source of truth
- The file `docs/vision.md` is authoritative.
- Do not introduce features, dependencies, or complexity outside it.

## Development phases
Phase 1:
- Local directory selection
- Local read-only file server
- Cloudflare tunnel
- Password protection
- Directory browsing UI

Phase 2:
- Username selection (unique)
- Presence
- Text chat

Phase 3:
- Group voice calls

## Rules
- Never skip phases
- Never add “nice-to-have” features early
- Ask before adding new dependencies
