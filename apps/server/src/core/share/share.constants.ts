export enum ShareAccessMode {
  Public = 'public',
  PasswordExpiring = 'password_expiring',
}

export enum ShareErrorCode {
  ShareNotFound = 'SHARE_NOT_FOUND',
  ShareExpired = 'SHARE_EXPIRED',
  SharePasswordRequired = 'SHARE_PASSWORD_REQUIRED',
  SharePasswordInvalid = 'SHARE_PASSWORD_INVALID',
  ShareAccessTokenInvalid = 'SHARE_ACCESS_TOKEN_INVALID',
  ShareAccessModeForbidden = 'SHARE_ACCESS_MODE_FORBIDDEN',
  ShareTtlInvalid = 'SHARE_TTL_INVALID',
  SharePasswordInvalidFormat = 'SHARE_PASSWORD_INVALID_FORMAT',
  ShareRegenerateRequired = 'SHARE_REGENERATE_REQUIRED',
  ShareVerifyRateLimited = 'SHARE_VERIFY_RATE_LIMITED',
}

export const MAX_PROTECTED_SHARE_TTL_MINUTES = 30;
export const MIN_PROTECTED_SHARE_TTL_MINUTES = 1;

export enum ShareLegacyRouteMode {
  Observe = 'observe',
  ProtectedBlock = 'protected_block',
  RedirectPublic = 'redirect_public',
  Removed = 'removed',
}
