# Tasklet — Frontend

A small React + Vite + TypeScript single-page app for the Tasklet demo.
Shows a list of tasks, lets you add, complete, and filter them.

## Setup

```sh
npm install
npm run dev
```

The dev server runs on http://localhost:5173 and talks to the backend at
http://localhost:4000 (see `src/lib/api.ts`).

## Layout

- `src/App.tsx` — shell, routing-free top-level component
- `src/components/` — `TaskList`, `TaskItem`, `NewTaskForm`, `FilterBar`
- `src/lib/api.ts` — fetch helpers for the backend
- `src/lib/types.ts` — shared type definitions
