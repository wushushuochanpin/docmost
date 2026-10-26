import { CanceledError } from "axios";
import {
  captureAuthGeneration,
  isCurrentAuthGeneration,
} from "./session-lifecycle";

export const AUTH_COOKIE_LOCK = "docmost:identity-bootstrap";
export class IdentityBrowserUnsupportedError extends Error {}

export async function withAuthCookieLock<T>(
  action: () => Promise<T>,
  requireLock = false,
): Promise<T> {
  const generation = captureAuthGeneration();
  const run = async () => {
    if (!isCurrentAuthGeneration(generation))
      throw new CanceledError("Session changed");
    return action();
  };
  if (navigator.locks?.request)
    return navigator.locks.request(AUTH_COOKIE_LOCK, run);
  if (requireLock) throw new IdentityBrowserUnsupportedError();
  // Existing local login remains supported; center login requires serialization.
  return run();
}
