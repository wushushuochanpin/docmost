import { lazy, type ComponentType } from "react";

const RETRYABLE_IMPORT_ERRORS = [
  "ChunkLoadError",
  "ERR_FAILED",
  "Failed to fetch dynamically imported module",
  "Importing a module script failed",
] as const;

function isRetryableImportError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return RETRYABLE_IMPORT_ERRORS.some((token) => message.includes(token));
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function retryDynamicImport<T>(
  loader: () => Promise<T>,
  options?: {
    retries?: number;
    retryDelayMs?: number;
  },
) {
  const retries = options?.retries ?? 2;
  const retryDelayMs = options?.retryDelayMs ?? 300;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await loader();
    } catch (error) {
      lastError = error;
      const shouldRetry =
        attempt < retries && isRetryableImportError(error);

      if (!shouldRetry) {
        throw error;
      }

      await wait(retryDelayMs * (attempt + 1));
    }
  }

  throw lastError;
}

export function lazyWithRetry<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>,
) {
  return lazy(() => retryDynamicImport(loader));
}
