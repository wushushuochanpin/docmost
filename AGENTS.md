## Tech Stack

- Frontend: React 18, TypeScript, Vite
- Backend: NestJS on Node.js 22+
- Collaboration: Tiptap 3.20.x, Yjs 13, Hocuspocus 4
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

## Editor Runtime Guardrails

- Keep ProseMirror as a singleton in the client production bundle. The page editor must not load separate CJS and ESM copies of `prosemirror-view`, `prosemirror-state`, `prosemirror-model`, or related `prosemirror-*` packages.
- Do not remove the ProseMirror alias and dedupe block from `apps/client/vite.config.ts` unless the editor packaging strategy changes and a real document page is browser-tested afterward.
- Treat `@docmost/editor-ext` as a high-risk boundary: its CJS dist can import `@tiptap/pm/*`, which can split ProseMirror class identity and crash the editor with `localsInner` errors.
- When changing Tiptap, ProseMirror, `@docmost/editor-ext`, Vite/Rolldown config, or editor decoration plugins, run `pnpm run guard:prosemirror-singleton` and `pnpm --filter client build`.
- A valid smoke check for this failure mode must open an existing document page and verify the page does not show "页面加载失败" and `.ProseMirror` exists.
- Realtime collaboration must default to the current browser origin for `/collab`; use `COLLAB_URL` only for an explicit cross-origin collaboration endpoint. Do not make it depend on `APP_URL` by default.
- Test deployments must not reuse production Redis for collaboration/session state. If test reuses production DB for data inspection, keep Redis isolated so editor leases, Socket.IO registrations, and Hocuspocus Redis sync state cannot collide across environments.
- Run `pnpm run guard:realtime-deployment` after changing deployment compose files, runtime config injection, collaboration URL logic, or editor session settings.

## Page Tree Guardrails

- Root-level sidebar creation must create folders, not files. The root menu folder button must pass `nodeType: "folder"`.
- Keep root and child creation defaults centralized in `apps/client/src/features/page/tree/hooks/build-tree-create-payload.ts`.
- Backend page creation must default omitted `nodeType` to `folder` at the root and `file` under a parent, matching the page tree hierarchy rule that root nodes are folders.
- The sidebar tree must auto-reveal the current route page by opening all loaded or fetched ancestors, and clicking a collapsed row with children should expand it while preserving navigation.
- When changing sidebar creation, page tree creation, or `PageService.create`, run `pnpm --filter client test src/features/page/tree/model/tree-model.test.ts src/features/page/tree/hooks/build-tree-create-payload.test.ts`, `pnpm --filter client build`, and `pnpm run server:build`.

## Database Migration Guardrails

- Treat merged migration files in `apps/server/src/database/migrations` as immutable and append-only.
- New migration filenames must start with a unique sortable `YYYYMMDDTHHMMSS-` key and be later than the latest migration on the base branch.
- Do not rename, delete, or edit an already-merged migration; create a follow-up migration instead.
- Run `pnpm run security:migration-order` when adding or touching database migrations.
