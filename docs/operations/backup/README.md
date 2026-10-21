---
file: docs/operations/backup/README.md
description: Isolated full-database backup roles, regression gates, deployment acceptance and recovery.
created_at: 2026-10-21 18:30:19 Asia/Shanghai
updated_at: 2026-10-21 20:13:48 Asia/Shanghai
timezone: Asia/Shanghai
source_of_truth: apps/server/src/integrations/backup, deploy/k8s/production/backup-worker.yaml, .github/workflows/deploy.yml
applies_to: [operations, backup, deployment]
disclaimer: 本文可能更新，仅供参考；当前代码和实际运行状态优先。
---

# Backup operations

## Scope and credential boundary

The existing settings action creates a **full database** backup, associated with the requesting workspace for job tracking. It is not a workspace-only export. Preserve database-wide completeness, including RLS tables and Y.Doc binary state. Local storage is included when STORAGE_DRIVER=local; with S3 attachment storage, the package does not copy the attachment bucket. Bucket retention/versioning remains a separate recovery prerequisite.

The HTTP application queues jobs and serves authorized downloads. It does not register a BackupProcessor and must not receive BACKUP_DATABASE_URL. The isolated `docmost-backup` Deployment runs the same immutable image with a dedicated entrypoint, no HTTP listener, no Kubernetes service account token, and no migration/application-signing secrets. It reads attachment storage and writes only the backup subdirectory.

- DATABASE_URL: existing restricted application role, used for job records.
- BACKUP_DATABASE_URL: only in `docmost-backup-env`, role `docmost_backup_reader` with LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, BYPASSRLS and SELECT on all public tables/sequences. No membership in administrator roles; default transaction read-only.
- Migration credential: remains solely in `docmost-migration-env` and the migration Job.

The worker validates a distinct role on the same database, BYPASSRLS and SELECT-only table privileges before consuming jobs. Missing credentials never fall back to the runtime account. Permission errors are permanent failures; transport failures retain bounded retries. stdout EOF is insufficient: the exporter must exit zero and compression/file output must finish.

## Provisioning

On the documented `xenzify-dev` host, run the reviewed `scripts/provision-backup-role.py`. It reads existing Kubernetes Secret references, preserves any existing backup credential, snapshots configuration in a restricted `/root/backups/docmost_backup_role_*` directory, grants the dedicated role, and installs only the isolated backup Secret. It never prints credentials. The existing database/container is not restarted. Default privileges cover tables and sequences subsequently created by the migration owner.

Ensure `/var/lib/docmost/storage/backups` exists with UID/GID 1000 access before the first rollout. Apply the repository deployment normally through GitHub Actions; do not run a host-side application build.

For local Compose, run both `docmost` and `backup`. Put only the distinct backup connection in an ignored mode-600 `.env.backup`, and provision equivalent SELECT/default grants in that local database. Never put BACKUP_DATABASE_URL in the shared `.env`. The Compose test configuration reuses production data for inspection and intentionally disables backup.

## Verification and gates

`pnpm run test:backup` builds on `pnpm --filter @docmost/editor-ext build` and `pnpm --filter server build`. It starts disposable PostgreSQL 16 and Redis Docker containers, applies all current migrations, reproduces the runtime-role RLS failure, tests missing/wrong credentials and process failures, then exercises the compiled worker through BullMQ. Its output is restored into a fresh database and checks both workspaces, RLS-protected records, byte-identical Y.Doc state and a local attachment. No production URLs, .env or production Redis are accepted as test inputs.

For local installations without Docker, explicitly set BACKUP_TEST_PG_BIN (PostgreSQL 16 initdb/pg_ctl/postgres), BACKUP_TEST_REDIS_BIN, and optionally BACKUP_TEST_PG_DUMP and BACKUP_TEST_PSQL. These are executable paths only; the test still owns a fresh loopback cluster.

The reusable Backup regression workflow runs on every PR and is a required dependency inside the production deployment workflow, including manual releases. A failed test prevents migration and rollout. Post-rollout, `backup-smoke.js` creates a real system job, waits for success and downloads/hashes both local and configured COS/S3 copies. Failure prevents the source SHA annotation and invokes the existing rollback path for both application and backup worker. Artifacts are retained; do not delete verification backups as routine CI cleanup.

## Recovery and acceptance

Keep the previous application and worker image digests. Normal rollback restores both; on the first rollout, absence of an old worker scales the new worker to zero. This first-version rollback restores the previously broken backup behavior, so it is recovery of the app, not acceptance of backups. Retain the dedicated role/Secret for investigation; never restore application superuser access or disable FORCE RLS.

A complete acceptance record includes commit/digest, successful CI restore, job ID, terminal status, artifact size and matching local/remote SHA-256. Health HTTP 200 alone is insufficient. Existing backup records remain visible; permission-error details can be opened from the settings page.

The worker checks the latest retained successful backup every minute. It emits `BACKUP_OVERDUE` when no success exists or the age exceeds BACKUP_MAX_AGE_HOURS (default 24), and `BACKUP_HEALTHY` on recovery. Events are emitted on state changes only. These are structured log signals; external email/chat alert routing requires the site's monitoring system and is not provisioned by this change. This does not add an automatic backup schedule.

Application, worker and release verification all use `/app/data/storage/backups` on the shared PVC. The application manifest pins this path explicitly; the code default is derived from the installed server location rather than `process.cwd()`. The regression starts separate Node processes in the repository root and server directory and requires identical paths. Rollback restores the worker's prior replica count as well as its image, including a previously disabled worker.
