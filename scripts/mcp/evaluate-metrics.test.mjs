import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "./evaluate-metrics.mjs";
const baseline = () => ({
  started_at: "node-A",
  observed_at: "2026-01-01T00:00:00Z",
  counters: {},
  latency: {},
  latency_bounds_ms: [10, 50, 100, 200, 500, 1000, 2000, 5000, 15000, "+Inf"],
});
test("rates, replay, quota/conflict signals, real histogram buckets and restart handling", () => {
  const previous = baseline(),
    current = baseline();
  current.observed_at = "2026-01-01T00:01:00Z";
  current.counters = {
    "mcp_tool:attempt": 20,
    "mcp_tool:error:DOCUMENT_BUSY": 8,
    "mcp_tool:error:REVISION_CONFLICT": 4,
    "mcp_tool:error:RATE_LIMITED": 2,
    "oauth_token:attempt": 10,
    "oauth_token:error:invalid_grant": 3,
    refresh_replay: 1,
    checkpoint_failure: 1,
    retention_failure: 1,
    "document_transaction:error:DOCUMENT_OWNER_CHANGED": 1,
  };
  current.latency = {
    document_transaction: {
      count: 20,
      buckets: [0, 0, 0, 0, 20, 0, 0, 0, 0, 0],
    },
  };
  const result = evaluate(previous, current);
  assert.equal(result.ratios.oauth_failure, 0.3);
  assert.equal(result.ratios.quota, 0.1);
  assert.equal(result.fence_rejections, 1);
  assert.equal(result.latency.document_transaction.p95_upper_bound_ms, 500);
  assert.deepEqual(result.alerts, [
    "REFRESH_REPLAY",
    "CHECKPOINT_FAILURE",
    "RETENTION_FAILURE",
    "OAUTH_FAILURE_RATE",
    "DOCUMENT_CONTENTION_RATE",
    "DOCUMENT_TRANSACTION_P95",
  ]);
  current.started_at = "node-B";
  assert.equal(evaluate(previous, current).baseline_required, true);
});
test("counter reset, reversed time and invalid histogram fail closed; small samples do not trigger rate alerts", () => {
  const previous = baseline(),
    current = baseline();
  assert.throws(() => evaluate(previous, current));
  current.observed_at = "2026-01-01T00:01:00Z";
  previous.counters = { "oauth_token:attempt": 10 };
  assert.throws(() => evaluate(previous, current));
  previous.counters = {};
  current.counters = {
    "oauth_token:attempt": 1,
    "oauth_token:error:invalid_grant": 1,
  };
  assert.deepEqual(evaluate(previous, current).alerts, []);
  current.latency = { mcp_tool: { count: 5, buckets: [1] } };
  assert.throws(() => evaluate(previous, current));
});
