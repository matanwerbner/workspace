---
created: 2026-06-03T16:35:25.097Z
title: Add workspace homepage with async WhatsApp Claude agent
area: ui
files: []
---

## Problem

The app currently has no homepage/dashboard view for the workspace. There's also a feature request to integrate WhatsApp as an async input channel — a dedicated Claude agent should run persistently in the background, poll or listen for incoming WhatsApp messages, and process them as workspace requests (similar to how the user would type into the chat UI directly).

## Solution

1. Build a homepage view for the workspace — likely a dashboard/landing screen shown when no specific view is active. Could surface recent sessions, pinned agents, quick actions.
2. Add a persistent async Claude agent that:
   - Connects to WhatsApp (via whatsapp-web.js, Baileys, or Meta Cloud API)
   - Listens for incoming messages on a configured number/account
   - Routes each message as a workspace request to the Claude AI loop
   - Sends replies back to the WhatsApp thread
3. The agent lifecycle should be managed by the main process (start/stop/restart), with status surfaced on the homepage.
