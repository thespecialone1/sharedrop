---
name: ui-design-system
description: Guides the AI to design clean, modern, Google/Apple-style UI for Electron and Web apps. Use when creating or refactoring UI.
---

# UI Design System Skill

## Principles
- Minimal, modern, calm design
- Lots of white space, soft shadows, clean typography
- One accent color for buttons/cards
- Subtle hover/active states
- Avoid gradients, flashy animations, or purplish generic themes
- Cards, tabs, dialogs should feel “Apple-like” or “Google material clean”

## Components
Preferred shadcn/ui components:
- **Gallery / Image Grid** — for directory previews
- **Dialog / Modal** — image/video preview, with zoom and download
- **Tabs / Animated Tabs** — sections for Files / Info / Preview
- **Buttons / Icon Buttons** — primary actions, download, close
- **Cards / Avatar / Tooltip** — for files, users, chat messages
- **Skeleton / Loading placeholders** — lazy-load placeholders
- **Input / Form Fields** — for username, chat input

Optional (for later phases):
- Assistant UI / Chat blocks (for Twitch-like chat)
- Notification badges / toast messages

## How to apply
- Use these components wherever possible
- Keep spacing consistent across all elements
- Avoid creating new styles outside Tailwind + shadcn
- Dialogs should overlay cleanly on gallery
- Tabs should clearly separate sections
- Cards should use shadows, rounded corners, subtle hover effects
