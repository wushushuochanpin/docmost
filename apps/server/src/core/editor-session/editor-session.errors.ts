import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EDITOR_SESSION_COLLAB_CLOSE_CODE } from './editor-session.constants';

/**
 * Thrown when an editor-session lease is missing, expired or mismatched.
 * The numeric `code` lets @hocuspocus/server close the collab WebSocket with a
 * distinguishable close code (4409) so the client can detect this specific
 * failure and recover by re-acquiring the lease, instead of blindly retrying
 * with a stale edit session.
 */
export class EditorSessionConflictException extends ConflictException {
  readonly code: number = EDITOR_SESSION_COLLAB_CLOSE_CODE;

  constructor(message = 'Editor session conflict') {
    super({ code: 'EDITOR_SESSION_CONFLICT', message });
  }
}

export class EditorSessionForbiddenException extends ForbiddenException {
  constructor(message = 'Editor session forbidden') {
    super({ code: 'EDITOR_SESSION_FORBIDDEN', message });
  }
}

export class EditorSessionResourceNotFoundException extends NotFoundException {
  constructor(message = 'Editor session resource not found') {
    super({ code: 'EDITOR_SESSION_RESOURCE_NOT_FOUND', message });
  }
}
