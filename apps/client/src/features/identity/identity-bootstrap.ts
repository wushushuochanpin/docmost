import { bootstrapIdentity } from "./identity-service";
import { identityLoginUrl, identityReturnPath } from "./identity-flow";
import { withAuthCookieLock } from "@/features/auth/auth-cookie-lock";
export { IdentityBrowserUnsupportedError } from "@/features/auth/auth-cookie-lock";

/** The lock protects cookie initialization across simultaneous login tabs. */
export async function beginIdentityLogin(
  returnTo: unknown,
  navigate: (url: string) => void = (url) => window.location.assign(url),
): Promise<void> {
  await withAuthCookieLock(async () => {
    const result = await bootstrapIdentity();
    if (!result.ready) throw new Error("Identity initialization failed");
    navigate(
      result.authenticated
        ? identityReturnPath(returnTo)
        : identityLoginUrl(returnTo),
    );
  }, true);
}
