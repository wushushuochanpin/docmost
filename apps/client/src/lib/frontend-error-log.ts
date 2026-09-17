/**
 * Reports frontend runtime errors to the server diagnostic endpoint
 * (POST /api/diag/frontend-error) so page-load failures can be diagnosed
 * from server logs without browser console access.
 *
 * The endpoint only writes a log line; it never stores payloads and never
 * returns user data, so it is safe to call from any error path.
 */
export function reportFrontendError(context: string, error: unknown): void {
  try {
    const message =
      error instanceof Error ? error.message : String(error ?? "unknown");
    const stack = error instanceof Error ? error.stack : undefined;
    const payload = JSON.stringify({
      context,
      message,
      stack,
      url: window.location.href,
      userAgent: navigator.userAgent,
      ts: new Date().toISOString(),
    });

    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/api/diag/frontend-error", blob);
    } else {
      void fetch("/api/diag/frontend-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      });
    }
  } catch {
    // never let error reporting break the app
  }
}

export function initGlobalErrorReporting(): void {
  window.addEventListener("error", (event) => {
    reportFrontendError("window.error", event.error ?? event.message);
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportFrontendError("unhandledrejection", event.reason);
  });
}
