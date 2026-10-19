import { randomUUID } from 'node:crypto';
import { monitorEventLoopDelay } from 'node:perf_hooks';

export type AgentMetricArea =
  | 'oauth_token'
  | 'oauth_authorize'
  | 'oauth_authenticate'
  | 'document_transaction'
  | 'mcp_tool'
  | 'recovery'
  | 'maintenance';
const codes = new Set([
  'DOCUMENT_BUSY',
  'DOCUMENT_OWNER_BUSY',
  'REVISION_CONFLICT',
  'BLOCK_REFERENCE_INVALID',
  'DOCUMENT_FENCE_EXPIRED',
  'DOCUMENT_OWNER_CHANGED',
  'DOCUMENT_PERMIT_EXPIRED',
  'RATE_LIMITED',
  'RESOURCE_NOT_FOUND_OR_FORBIDDEN',
  'SCOPE_DENIED',
  'MCP_DISABLED',
  'INVALID_ARGUMENT',
  'UNSUPPORTED_CONTENT',
  'OPERATION_RESULT_EXPIRED',
  'IDEMPOTENCY_KEY_REUSED',
  'invalid_grant',
  'invalid_client',
  'invalid_scope',
  'invalid_request',
]);
export const latencyBoundsMs = [10, 50, 100, 200, 500, 1000, 2000, 5000, 15000];
export class AgentTelemetry {
  private readonly instanceId = randomUUID();
  private readonly startedAt = new Date().toISOString();
  private readonly counters = new Map<string, number>();
  private readonly timings = new Map<
    string,
    { count: number; sumMs: number; maxMs: number; buckets: number[] }
  >();
  private loop?: ReturnType<typeof monitorEventLoopDelay>;
  start() {
    if (!this.loop) {
      this.loop = monitorEventLoopDelay({ resolution: 20 });
      this.loop.enable();
    }
  }
  stop() {
    this.loop?.disable();
    this.loop = undefined;
  }
  increment(
    event: 'refresh_replay' | 'checkpoint_failure' | 'retention_failure',
  ) {
    this.count(event);
  }
  private count(key: string) {
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }
  errorCode(error: any) {
    const candidate =
      error?.code ?? error?.getResponse?.()?.error ?? error?.message;
    return codes.has(candidate)
      ? candidate
      : codes.has(error?.name)
        ? error.name
        : error?.getStatus?.() === 401
          ? 'AUTH_REJECTED'
          : error?.getStatus?.() === 403
            ? 'AUTH_FORBIDDEN'
            : 'INTERNAL_ERROR';
  }
  async measure<T>(area: AgentMetricArea, work: () => Promise<T>): Promise<T> {
    const started = performance.now();
    this.count(area + ':attempt');
    try {
      const result = await work();
      this.count(area + ':success');
      return result;
    } catch (error) {
      this.count(area + ':error:' + this.errorCode(error));
      throw error;
    } finally {
      const ms = performance.now() - started;
      const item = this.timings.get(area) ?? {
        count: 0,
        sumMs: 0,
        maxMs: 0,
        buckets: Array(latencyBoundsMs.length + 1).fill(0),
      };
      item.count++;
      item.sumMs += ms;
      item.maxMs = Math.max(item.maxMs, ms);
      const index = latencyBoundsMs.findIndex((n) => ms <= n);
      item.buckets[index < 0 ? latencyBoundsMs.length : index]++;
      this.timings.set(area, item);
    }
  }
  snapshot() {
    return {
      started_at: this.startedAt,
      instance_id: this.instanceId,
      observed_at: new Date().toISOString(),
      scope: 'process',
      counters: Object.fromEntries(this.counters),
      latency_bounds_ms: [...latencyBoundsMs, '+Inf'],
      latency: Object.fromEntries(
        [...this.timings].map(([key, value]) => [
          key,
          { ...value, buckets: [...value.buckets] },
        ]),
      ),
      event_loop: this.loop
        ? {
            p95_ms: this.loop.percentile(95) / 1e6,
            p99_ms: this.loop.percentile(99) / 1e6,
            max_ms: this.loop.max / 1e6,
          }
        : null,
    };
  }
}
export const agentTelemetry = new AgentTelemetry();
