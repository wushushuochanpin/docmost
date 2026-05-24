## Tech Stack

- Frontend: React 18, TypeScript, Vite
- Backend: NestJS on Node.js 22+
- Collaboration: Tiptap 4, Yjs 13, Hocuspocus 4
- Database: PostgreSQL
- Package manager: pnpm 10.4.0
- Runtime: Node.js 22

## Stack Guardrails

- Keep the collaboration stack on Hocuspocus 4.x and Tiptap 3.20.x unless a new PRD explicitly approves another migration.
- Do not reintroduce React Query as the live source of truth for editable page content.
- Treat Y.Doc binary persistence as the authoritative collaboration state; `pages.content` is a materialized snapshot.
- Keep editor instance identity stable across keystrokes, save acknowledgements, and transient reconnects.
- Do not add a second realtime collaboration backend, sync engine, or editor framework without explicit approval.
- External hosted or local-first replacements are PoC-only until they prove auth, persistence, rollback, and migration behavior.
- New runtime dependencies must justify stability, maintenance status, and rollback path before landing.
- Preserve Node.js 22+ compatibility in Docker, CI, and local development.
