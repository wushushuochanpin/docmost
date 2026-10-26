import { invalidateAuthSession, isCurrentAuthGeneration } from "./session-lifecycle";

/** Hocuspocus also uses 4401 for document/token/message errors. Only our server's
 * explicit session-revocation close may invalidate the whole browser session. */
export function handleCollaborationSessionEnd(
  event: Pick<CloseEvent, "code" | "reason">,
  connectionGeneration: string,
): boolean {
  if (
    event.code !== 4401 ||
    event.reason !== "Session ended" ||
    !isCurrentAuthGeneration(connectionGeneration)
  ) return false;
  invalidateAuthSession();
  return true;
}
