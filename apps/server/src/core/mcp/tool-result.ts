import { HttpException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DocumentCommandError } from '../document-command/document-candidate';
import { AgentRateLimitError } from '../document-command/agent-quota';
const safe = new Set([
  'RATE_LIMITED',
  'RESOURCE_NOT_FOUND_OR_FORBIDDEN',
  'SCOPE_DENIED',
  'MCP_DISABLED',
  'DOCUMENT_NOT_ENROLLED',
  'DOCUMENT_BUSY',
  'REVISION_CONFLICT',
  'BLOCK_REFERENCE_INVALID',
  'BLOCK_NOT_EDITABLE',
  'INVALID_ARGUMENT',
  'UNSUPPORTED_CONTENT',
  'CONTENT_TOO_LARGE',
  'IDEMPOTENCY_KEY_REUSED',
  'DOCUMENT_FENCE_EXPIRED',
  'OPERATION_RECONCILING',
  'OPERATION_RESULT_EXPIRED',
]);
export function toolError(error: unknown) {
  const value =
    error instanceof DocumentCommandError
      ? error.code
      : error instanceof HttpException
        ? error.message
        : '';
  const code = safe.has(value) ? value : 'INTERNAL_ERROR';
  const result = {
    code,
    message: code,
    request_id: randomUUID(),
    retryable: [
      'RATE_LIMITED',
      'DOCUMENT_BUSY',
      'OPERATION_RECONCILING',
    ].includes(code),
    ...(error instanceof AgentRateLimitError
      ? { reason: error.reason, retry_after_ms: error.retryAfterMs }
      : {}),
  };
  return {
    isError: true,
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    structuredContent: result,
  };
}
