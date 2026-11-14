import { beginIdentityTiming } from "./identity-timing";
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
  const finish = beginIdentityTiming("click_to_navigation_request");
  try { await beginCookieIdentityFlow({
    runExclusive: (action) => {
      const acquired = beginIdentityTiming("cookie_lock_wait");
      return withAuthCookieLock(() => {acquired(); return action();}, true).catch(error => {acquired("error"); throw error;});
    },
    bootstrap: async () => {
      const done = beginIdentityTiming("bootstrap");
      try {const result = await bootstrapIdentity(); done(); return result;}
      catch (error) {done("error"); throw error;}
    },
    authenticatedUrl: () => identityReturnPath(returnTo),
    signInUrl: () => identityLoginUrl(returnTo, reauthenticate),
    navigate: (url) => {finish(); navigate(url);},
  }); } catch (error) {finish("error"); throw error;}

}
