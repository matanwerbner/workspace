# Tasklet — Backend

Tiny Node + Express + TypeScript API behind the Tasklet demo frontend.
In-memory store, no database — restart wipes everything.

## Setup

```sh
npm install
npm run dev
```

Listens on http://localhost:4000.

## Routes

| Method | Path                  | Description                |
|--------|-----------------------|----------------------------|
| GET    | /api/health           | Liveness probe             |
| GET    | /api/tasks            | List tasks                 |
| POST   | /api/tasks            | Create a task              |
| POST   | /api/tasks/:id/toggle | Toggle completion          |
| DELETE | /api/tasks/:id        | Delete a task              |

## Layout

- `src/server.ts` — Express app bootstrap
- `src/routes/` — HTTP route handlers
- `src/models/` — in-memory store and types
- `src/middleware/` — request logging, error handling
