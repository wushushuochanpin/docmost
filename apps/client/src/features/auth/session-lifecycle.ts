import { getDefaultStore } from "jotai";
import { RESET } from "jotai/utils";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";
import { socketAtom } from "@/features/websocket/atoms/socket-atom";
import { clearRecentPages } from "@/features/page/hooks/use-recent-pages";
import { queryClient } from "@/query-client";
import { settleSessionBackgroundWork } from "./session-background-work";

export const AUTH_INVALIDATED_EVENT = "docmost:auth:invalidated";
const AUTH_GENERATION_KEY = "docmost:auth:generation";
let generation = readStoredGeneration() ?? "initial";
let generationStored = true;
let invalidated = false;
let invalidationReason: "logout" | "expired" | "changed" = "expired";
const listeners = new Set<() => void>();

function readStoredGeneration(): string | null {
  try {
    return window.localStorage.getItem(AUTH_GENERATION_KEY) ?? "initial";
  } catch {
    return null;
  }
}

export function captureAuthGeneration(): string {
  return generation;
}

export function isCurrentAuthGeneration(captured: string): boolean {
  const stored = readStoredGeneration();
  return captured === generation && (!generationStored || stored === null || captured === stored);
}

export function isAuthInvalidated(): boolean {
  return invalidated;
}

export function getAuthInvalidationReason() {
  return invalidationReason;
}

export function subscribeAuthLifecycle(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function advanceGeneration(): void {
  generation = crypto.randomUUID();
  try {
    window.localStorage.setItem(AUTH_GENERATION_KEY, generation);
    generationStored = true;
  } catch {
    generationStored = false; // Preserve local isolation when storage is unavailable/full.
  }
}

function clearPrivateState(): void {
  const store = getDefaultStore();
  // Every cleanup runs even if one storage adapter fails.
  const cleanups = [
    () => store.get(socketAtom)?.disconnect(),
    () => store.set(socketAtom, null),
    () => store.set(currentUserAtom, RESET),
    () => clearRecentPages(),
    () => {
      void settleSessionBackgroundWork(queryClient.cancelQueries(), (error) => {
        console.warn("Unable to finish cancelling private queries", error);
      });
      queryClient.clear();
    },
  ];
  for (const cleanup of cleanups) {
    try {
      cleanup();
    } catch {
      /* continue cleanup */
    }
  }
}

export function invalidateAuthSession(
  reason: "logout" | "expired" = "expired",
): void {
  invalidationReason = reason;
  invalidated = true;
  advanceGeneration();
  clearPrivateState();
  window.dispatchEvent(new Event(AUTH_INVALIDATED_EVENT));
  listeners.forEach((listener) => listener());
}

/** Start a fresh request generation before a login request can set a new cookie. */
export function beginAuthAttempt(): void {
  advanceGeneration();
}

export function establishAuthSession(): void {
  advanceGeneration();
  clearPrivateState();
  invalidated = false;
  listeners.forEach((listener) => listener());
}

// Another tab changed the cookie-owning account/session. Quarantine old state;
// reload obtains current server truth instead of replaying cached account data.
if (typeof window !== "undefined") {
  const params = new URLSearchParams(window.location.search);
  if (params.get("identity_authenticated") === "1") {
    // A hint only: protected pages still fetch and verify /users/me.
    establishAuthSession();
    params.delete("identity_authenticated");
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
  }
  window.addEventListener("storage", (event) => {
    if (event.key !== AUTH_GENERATION_KEY || event.newValue === generation)
      return;
    generation = event.newValue ?? "initial";
    invalidated = true;
    invalidationReason = "changed";
    clearPrivateState();
    window.dispatchEvent(new Event(AUTH_INVALIDATED_EVENT));
    listeners.forEach((listener) => listener());
  });
}
