export class BackupError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

export function redactBackupError(
  message: string,
  databaseUrl?: string,
): string {
  let result = message;
  if (databaseUrl) {
    result = result.split(databaseUrl).join('[database]');
    try {
      const password = new URL(databaseUrl).password;
      for (const value of [password, decodeURIComponent(password)]) {
        if (value) result = result.split(value).join('[redacted]');
      }
    } catch {
      /* Invalid configuration is reported without its value. */
    }
  }
  return result
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[database]')
    .slice(0, 8000);
}
