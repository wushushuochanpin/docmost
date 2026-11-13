import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';

type Stage = 'bootstrap' | 'start' | 'link_start' | 'callback' | 'session_verify' | 'discovery' | 'token_exchange' | 'introspection' | 'userinfo' | 'account_headers' | 'account_body' | 'hosted_create' | 'hosted_complete';
type Outcome = 'ok' | 'error';
interface Timing { stage: Stage; durationMs: number; outcome: Outcome }
interface Trace { requestId: string; stages: Timing[]; centerRequestIds: string[] }
const scope = new AsyncLocalStorage<Trace>();
const logger = new Logger('IdentityTiming');
const elapsed = (start: number) => Math.round((performance.now() - start) * 10) / 10;

export async function identityStage<T>(stage: Stage, operation: () => Promise<T>): Promise<T> {
  const started = performance.now();
  let outcome: Outcome = 'error';
  try { const result = await operation(); outcome = 'ok'; return result; }
  finally {
    const trace = scope.getStore();
    if (trace && trace.stages.length < 32) trace.stages.push({stage, durationMs: elapsed(started), outcome});
  }
}
export function identityCenterRequest(response: Response): void {
  try {
    const id = response.headers.get('X-Identity-Request-Id');
    const trace = scope.getStore();
    if (id && /^[a-f0-9-]{36}$/i.test(id) && trace && trace.centerRequestIds.length < 8)
      trace.centerRequestIds.push(id);
  } catch { /* Optional diagnostics must not alter the upstream result. */ }
}
export function withIdentityTiming<T>(
  stage: Stage,
  reply: {header(name: string, value: string): unknown} | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  if (scope.getStore()) return identityStage(stage, operation);
  const trace: Trace = {requestId: randomUUID(), stages: [], centerRequestIds: []};
  return scope.run(trace, async () => {
    const started = performance.now();
    let outcome: Outcome = 'error';
    try { const result = await operation(); outcome = 'ok'; return result; }
    finally {
      const durationMs = elapsed(started);
      // This is an allowlisted projection, never a request/error/token serialization.
      try {
        reply?.header('X-Identity-Request-Id', trace.requestId);
        reply?.header('Server-Timing', [
          `identity_total;dur=${durationMs}`,
          ...trace.stages.map(event => `${event.stage};dur=${event.durationMs}`),
        ].join(', '));
      } catch { /* Observability must not change a login outcome. */ }
      try { logger.log({event: 'identity_login_timing', requestId: trace.requestId, stage, durationMs, outcome, stages: trace.stages, centerRequestIds: trace.centerRequestIds}); } catch {}
    }
  });
}
