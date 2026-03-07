let shareLazyRuntimePromise: Promise<void> | null = null;

export async function ensureShareLazyRuntime(): Promise<void> {
  if (!shareLazyRuntimePromise) {
    shareLazyRuntimePromise = import("@/i18n").then(() => undefined);
  }

  return shareLazyRuntimePromise;
}
