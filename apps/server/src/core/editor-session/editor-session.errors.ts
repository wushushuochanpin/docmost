import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

export class EditorSessionConflictException extends ConflictException {
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
