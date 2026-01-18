---
name: cloudflare-tunnel
description: Handles secure exposure of the local server using Cloudflare Tunnel. Use when networking or public access is involved.
---

# Cloudflare Tunnel Skill

## Preferred approach
- Use `cloudflared` binary
- Quick tunnels (no DNS)
- Bind only to localhost

## Security
- Never expose the local server without auth
- Treat tunnel URL as public
- Password protection is mandatory

## Behavior
- Explain trade-offs before implementing
- Prefer simple, inspectable commands
