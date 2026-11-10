import { bootstrapIdentity } from "./identity-service";
import { identityLoginUrl, identityReturnPath } from "./identity-flow";
import { withAuthCookieLock } from "@/features/auth/auth-cookie-lock";
import { beginCookieIdentityFlow } from "@wushushuochanpin/identity-web";
export { IdentityBrowserUnsupportedError } from "@/features/auth/auth-cookie-lock";

/** The lock protects cookie initialization across simultaneous login tabs. */
export async function beginIdentityLogin(
  returnTo: unknown,
  navigate: (url: string) => void = (url) => window.location.assign(url),
  reauthenticate = false,
): Promise<void> {
  await beginCookieIdentityFlow({
    runExclusive: (action) => withAuthCookieLock(action, true),
    bootstrap: bootstrapIdentity,
    authenticatedUrl: () => identityReturnPath(returnTo),
    signInUrl: () => identityLoginUrl(returnTo, reauthenticate),
    navigate,
  });
}
