# workspace_demo

A self-contained sample workspace for demoing WorkspaceAI's view types:

- `frontend/` — a small React + Vite + TypeScript task-tracker UI.
  Open it in a **Code View** to show the file tree and Monaco editing.
- `backend/` — a matching Node + Express + TypeScript JSON API.
  Open it in a second **Code View** alongside the frontend.
- `PRD.pdf` — the product requirements document for the Tasklet feature.
  Open it in a **Document View**.
- `scripts/make-prd.mjs` — regenerates `PRD.pdf` from source (no deps).

Suggested demo flow:

1. Add a Code View pointed at `workspace_demo/frontend`.
2. Add a Code View pointed at `workspace_demo/backend`.
3. Add a Document View on `workspace_demo/PRD.pdf`.
4. Add a Browser View on any URL of your choice.
