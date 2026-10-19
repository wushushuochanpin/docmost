// Feed two snapshots from the SAME node to calculate interval rates. No network or secret access.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
export function evaluate(previous, current) {
  if (
    previous.started_at !== current.started_at ||
    previous.instance_id !== current.instance_id
  )
    return { baseline_required: true, reason: "process_restarted", alerts: [] };
  const seconds =
    (Date.parse(current.observed_at) - Date.parse(previous.observed_at)) / 1000;
  if (!(seconds > 0)) throw Error("INVALID_SNAPSHOT_ORDER");
  const count = (key) => {
    const delta = (current.counters[key] ?? 0) - (previous.counters[key] ?? 0);
    if (!Number.isFinite(delta) || delta < 0) throw Error("COUNTER_RESET");
    return delta;
  };
  const errors = (area) =>
    Object.keys(current.counters)
      .filter((k) => k.startsWith(area + ":error:"))
      .reduce((sum, k) => sum + count(k), 0);
  const attempts = count("mcp_tool:attempt"),
    oauth = count("oauth_token:attempt");
  const ratios = {
    oauth_failure: oauth ? errors("oauth_token") / oauth : 0,
    busy: attempts ? count("mcp_tool:error:DOCUMENT_BUSY") / attempts : 0,
    revision_conflict: attempts
      ? count("mcp_tool:error:REVISION_CONFLICT") / attempts
      : 0,
    quota: attempts ? count("mcp_tool:error:RATE_LIMITED") / attempts : 0,
  };
  const alerts = [];
  if (count("refresh_replay") > 0) alerts.push("REFRESH_REPLAY");
  if (count("checkpoint_failure") > 0) alerts.push("CHECKPOINT_FAILURE");
  if (count("retention_failure") > 0) alerts.push("RETENTION_FAILURE");
  if (seconds >= 60 && oauth >= 10 && ratios.oauth_failure > 0.2)
    alerts.push("OAUTH_FAILURE_RATE");
  if (
    seconds >= 60 &&
    attempts >= 10 &&
    ratios.busy + ratios.revision_conflict > 0.5
  )
    alerts.push("DOCUMENT_CONTENTION_RATE");
  const latency = {};
  for (const [area, value] of Object.entries(current.latency)) {
    const before = previous.latency[area];
    const samples = value.count - (before?.count ?? 0);
    if (samples < 0) throw Error("COUNTER_RESET");
    let sum = 0,
      p95 = null;
    for (let i = 0; i < value.buckets.length; i++) {
      const delta = value.buckets[i] - (before?.buckets[i] ?? 0);
      if (delta < 0) throw Error("COUNTER_RESET");
      sum += delta;
      if (p95 === null && samples > 0 && sum >= Math.ceil(samples * 0.95))
        p95 = current.latency_bounds_ms[i];
    }
    if (sum !== samples) throw Error("INVALID_HISTOGRAM");
    latency[area] = { samples, p95_upper_bound_ms: p95 };
  }
  const tx = latency.document_transaction;
  if (
    seconds >= 60 &&
    tx?.samples >= 20 &&
    (tx.p95_upper_bound_ms === "+Inf" || tx.p95_upper_bound_ms > 200)
  )
    alerts.push("DOCUMENT_TRANSACTION_P95");
  return {
    baseline_required: false,
    window_seconds: seconds,
    ratios,
    latency,
    fence_rejections:
      count("document_transaction:error:DOCUMENT_FENCE_EXPIRED") +
      count("document_transaction:error:DOCUMENT_OWNER_CHANGED"),
    alerts,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const parse = (path) => {
      const text = readFileSync(path, "utf8");
      if (text.length > 262144) throw Error("SNAPSHOT_TOO_LARGE");
      const body = JSON.parse(text);
      return body.metrics ?? body.data ?? body;
    };
    const output = evaluate(parse(process.argv[2]), parse(process.argv[3]));
    console.log(JSON.stringify(output, null, 2));
    process.exitCode = output.alerts.length ? 2 : 0;
  } catch {
    console.error("INVALID_METRIC_SNAPSHOT");
    process.exitCode = 1;
  }
}
