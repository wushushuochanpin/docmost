import { safeRedirectPath } from "@/lib/app-route";

/** UX filter only: the server independently enforces the return destination. */
export function identityReturnPath(candidate: unknown): string {
  const path = safeRedirectPath(candidate);
  if (!path) return "/home";
  const url = new URL(path, window.location.origin);
  if (
    url.pathname === "/home" ||
    url.pathname === "/settings/account/profile" ||
    /^\/s\/[a-zA-Z0-9_-]+(?:\/p\/[a-zA-Z0-9_-]+)?$/.test(url.pathname)
  )
    return path;
  if (
    url.pathname === "/oauth/consent" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      url.searchParams.get("request_id") ?? "",
    ) &&
    [...url.searchParams.keys()].every((key) => key === "request_id") &&
    url.searchParams.getAll("request_id").length === 1
  )
    return path;
  return "/home";
}

export function identityLoginUrl(candidate: unknown): string {
  return `/api/identity/start?${new URLSearchParams({
    returnTo: identityReturnPath(candidate),
  })}`;
}

// Only known codes become user-facing copy; never render provider error text.
export function identityErrorMessage(code: string | null): string | null {
  if (!code) return null;
  const messages: Record<string, string> = {
    invalid_transaction:
      "This sign-in request expired or was already used. Please start again.",
    center_unavailable:
      "The identity center is unavailable. Please try again later or use your existing local account.",
    identity_invalid: "We could not verify this sign-in. Please start again.",
    identity_not_linked:
      "This identity is not linked to a Docmost account. Sign in with your existing account, then link it in My Profile. New members must first accept an invitation.",
    identity_conflict:
      "This identity is already linked to another account. Contact your workspace administrator.",
    session_changed:
      "Your session changed during sign-in. Please sign in again before linking your account.",
    identity_disabled:
      "Identity center sign-in is not enabled for this workspace. Use your existing local account.",
    identity_assurance_required:
      "Your account requires additional verification. Please continue with your existing sign-in method.",
  };
  return (
    messages[code] ?? "Sign-in could not be completed. Please start again."
  );
}
