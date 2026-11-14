type Stage = "cookie_lock_wait" | "bootstrap" | "click_to_navigation_request";
type Outcome = "ok" | "error";
const key = "docmost.identity.timings.v1";
export function beginIdentityTiming(stage: Stage) {
  const started = performance.now(), startedAtMs = Date.now();
  let done = false;
  return (outcome: Outcome = "ok") => {
    if (done) return;
    done = true;
    try {
      const stored: unknown = JSON.parse(sessionStorage.getItem(key) ?? "[]");
      const rows = Array.isArray(stored) ? stored.filter(row =>
        row && ["cookie_lock_wait", "bootstrap", "click_to_navigation_request"].includes(row.stage)
        && ["ok", "error"].includes(row.outcome)
        && typeof row.startedAtMs === "number" && Number.isFinite(row.startedAtMs)
        && typeof row.durationMs === "number" && Number.isFinite(row.durationMs)
      ).slice(-63).map(row => ({stage: row.stage, outcome: row.outcome, startedAtMs: row.startedAtMs, durationMs: row.durationMs})) : [];
      rows.push({stage, outcome, startedAtMs, durationMs: Math.round((performance.now() - started) * 10) / 10});
      sessionStorage.setItem(key, JSON.stringify(rows));
    } catch { /* Storage is optional and cannot block authentication. */ }
  };
}
