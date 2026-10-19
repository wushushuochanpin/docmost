// Read-only, tenant-scoped diagnostics. Never loads .env or changes operation state.
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../../apps/server/package.json", import.meta.url),
);
const postgres = require("postgres");
const args = process.argv.slice(2);
const get = (key) =>
  args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
const workspace = get("--workspace"),
  operation = get("--operation");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (
  !uuid.test(workspace ?? "") ||
  (operation && !uuid.test(operation)) ||
  !process.env.MCP_DIAGNOSTIC_DATABASE_URL
) {
  console.error(
    "Provide MCP_DIAGNOSTIC_DATABASE_URL and --workspace UUID [--operation UUID]. No URL is read from .env.",
  );
  process.exit(1);
}
const pg = postgres(process.env.MCP_DIAGNOSTIC_DATABASE_URL, {
  max: 1,
  connect_timeout: 5,
  onnotice: () => {},
});
try {
  const report = await pg.begin(
    "isolation level repeatable read read only",
    async (tx) => {
      await tx`SELECT set_config('app.workspace_id',${workspace},true),set_config('statement_timeout','5s',true),set_config('lock_timeout','1s',true)`;
      const [role] =
        await tx`SELECT rolsuper OR rolbypassrls AS unsafe FROM pg_roles WHERE rolname=current_user`;
      if (role.unsafe) throw Error("UNSAFE_ROLE");
      if (!(await tx`SELECT id FROM workspaces WHERE id=${workspace}`).length)
        throw Error("NOT_FOUND_OR_FORBIDDEN");
      const [metrics] = await tx`
      SELECT
      (SELECT count(*)::int FROM document_operations WHERE workspace_id=${workspace} AND status IN ('pending','running','recovering')) AS pending_count,
      (SELECT coalesce(max(extract(epoch FROM clock_timestamp()-created_at)),0)::float8 FROM document_operations WHERE workspace_id=${workspace} AND status IN ('pending','running','recovering')) AS pending_age_seconds,
      (SELECT coalesce(max(extract(epoch FROM clock_timestamp()-g.recovering_since)),0)::float8 FROM document_gates g JOIN document_operations o ON o.id=g.operation_id WHERE g.workspace_id=${workspace} AND g.mode='recovering') AS recovering_age_seconds,
      (SELECT count(*)::int FROM document_outbox WHERE workspace_id=${workspace} AND delivered_at IS NULL) AS outbox_count,
      (SELECT coalesce(max(extract(epoch FROM clock_timestamp()-created_at)),0)::float8 FROM document_outbox WHERE workspace_id=${workspace} AND delivered_at IS NULL) AS outbox_age_seconds,
      (SELECT count(*)::int FROM document_operations o WHERE workspace_id=${workspace} AND status='committed' AND ((result IS NULL AND result_expired_at IS NULL) OR (result->>'changed'='true' AND NOT EXISTS(SELECT 1 FROM document_recovery_snapshots s WHERE s.operation_id=o.id AND s.side='after')))) AS committed_integrity_failures,
      (SELECT count(*)::int FROM document_gates g JOIN document_operations o ON o.id=g.operation_id WHERE g.workspace_id=${workspace} AND o.status='committed' AND g.mode<>'open') AS committed_live_pending,
      (SELECT count(*)::int FROM document_updates WHERE workspace_id=${workspace}) AS retained_journal_rows,
      (SELECT coalesce(sum(octet_length(update_bytes)),0)::float8 FROM document_updates WHERE workspace_id=${workspace}) AS retained_journal_bytes,
      (SELECT count(*)::int FROM agent_quota_reservations WHERE workspace_id=${workspace} AND state='reserved') AS quota_reservations,
      (SELECT count(*)::int FROM document_updates u JOIN document_gates g ON g.page_id=u.page_id WHERE u.workspace_id=${workspace} AND u.revision>g.checkpoint_revision) AS journal_tail_rows,
      (SELECT coalesce(sum(octet_length(u.update_bytes)),0)::float8 FROM document_updates u JOIN document_gates g ON g.page_id=u.page_id WHERE u.workspace_id=${workspace} AND u.revision>g.checkpoint_revision) AS journal_tail_bytes,
      (SELECT count(*)::int FROM document_operations WHERE workspace_id=${workspace} AND result_expired_at IS NOT NULL) AS expired_operation_results`;
      const alerts = [];
      if (metrics.committed_integrity_failures > 0)
        alerts.push({
          code: "COMMITTED_INTEGRITY_FAILURE",
          severity: "critical",
          action:
            "Disable workspace Agent writes; preserve evidence and investigate authoritative data.",
        });
      if (metrics.pending_age_seconds > 60)
        alerts.push({
          code: "PENDING_OVER_60S",
          severity: "warning",
          action: "Inspect operation and automatic recovery.",
        });
      if (metrics.recovering_age_seconds > 300)
        alerts.push({
          code: "RECOVERING_OVER_5M",
          severity: "critical",
          action:
            "Escalate to backend/collaboration owner; do not force unlock.",
        });
      if (metrics.outbox_age_seconds > 300)
        alerts.push({
          code: "OUTBOX_OVER_5M",
          severity: "warning",
          action:
            "Inspect recovery worker and downstream effects; do not replay document writes.",
        });
      let detail;
      if (operation) {
        [detail] =
          await tx`SELECT o.id,o.page_id,o.tool,o.status,o.created_at,o.committed_at,g.mode,g.fence::text,g.owner_epoch::text,g.agent_until,
        (SELECT count(*)::int FROM document_recovery_snapshots s WHERE s.operation_id=o.id) AS snapshots,
        (SELECT count(*)::int FROM document_outbox b WHERE b.operation_id=o.id AND delivered_at IS NULL) AS undelivered
        FROM document_operations o LEFT JOIN document_gates g ON g.page_id=o.page_id AND g.workspace_id=o.workspace_id
        WHERE o.workspace_id=${workspace} AND o.id=${operation}`;
        if (!detail) throw Error("NOT_FOUND_OR_FORBIDDEN");
      }
      return {
        observed_at: new Date().toISOString(),
        workspace_id: workspace,
        read_only: true,
        metrics,
        alerts,
        ...(detail ? { operation: detail } : {}),
      };
    },
  );
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.alerts.length ? 2 : 0;
} catch (error) {
  console.error(
    JSON.stringify({
      code: ["UNSAFE_ROLE", "NOT_FOUND_OR_FORBIDDEN"].includes(error.message)
        ? error.message
        : "DIAGNOSTIC_FAILED",
      message:
        "No changes made; check role, connectivity and schema without logging credentials.",
    }),
  );
  process.exitCode = 1;
} finally {
  await pg.end({ timeout: 5 });
}
