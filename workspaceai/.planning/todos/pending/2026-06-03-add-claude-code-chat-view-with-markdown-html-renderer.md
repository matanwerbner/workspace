---
created: 2026-06-03T16:35:25.097Z
title: Add Claude Code chat view with markdown HTML renderer
area: ui
files: []
---

## Problem

The current Claude interaction surfaces output in a terminal view. There's demand for a dedicated "Claude Code" view that feels like a proper chat interface — messages and responses rendered as rich markdown or HTML rather than raw terminal output. Users should not need a terminal at all for this view.

## Solution

1. Add a new view type (e.g. `claude-code`) registered alongside existing view types in the view system.
2. Build a dedicated chat component:
   - Input bar at the bottom (textarea + send button)
   - Message thread area with alternating user/assistant bubbles
   - Assistant responses rendered as markdown (or raw HTML when the model returns HTML)
   - Support for code blocks with syntax highlighting
3. Wire the component to the existing AI chat loop (`ai:chat` IPC) — reuse the same Claude backend, just swap the output surface.
4. No terminal spawned or shown for this view type.
