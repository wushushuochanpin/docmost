import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCodeType } from './error-codes';

/**
 * Structured application exception.
 *
 * Every thrown AppException produces a response body of:
 *   { code: ErrorCodeType, message: string, statusCode: number }
 *
 * Usage:
 *   throw new AppException(ErrorCode.PAGE_NOT_FOUND, 'Page not found', 404);
 */
export class AppException extends HttpException {
  public readonly code: ErrorCodeType;

  constructor(
    code: ErrorCodeType,
    message: string,
    status: number = HttpStatus.BAD_REQUEST,
  ) {
    super({ code, message, statusCode: status }, status);
    this.code = code;
  }
}
