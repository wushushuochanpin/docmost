import { beforeEach, describe, expect, it } from "vitest";
import { captureAuthGeneration, establishAuthSession, isAuthInvalidated } from "./session-lifecycle";
import { handleCollaborationSessionEnd } from "./realtime-session-boundary";

beforeEach(() => establishAuthSession());

describe("collaboration session boundary", () => {
  it.each(["Unauthorized", "", "Invalid message", "Session ended elsewhere"])(
    "keeps the web session for document-level 4401 %s",
    (reason) => {
      expect(handleCollaborationSessionEnd({ code: 4401, reason }, captureAuthGeneration())).toBe(false);
      expect(isAuthInvalidated()).toBe(false);
    },
  );
  it("invalidates the current session only for the registered session-ended signal", () => {
    expect(handleCollaborationSessionEnd({ code: 4401, reason: "Session ended" }, captureAuthGeneration())).toBe(true);
    expect(isAuthInvalidated()).toBe(true);
  });
  it("does not let an old connection's session-ended close clear a new login", () => {
    const oldConnection = captureAuthGeneration();
    establishAuthSession();
    expect(handleCollaborationSessionEnd({ code: 4401, reason: "Session ended" }, oldConnection)).toBe(false);
    expect(isAuthInvalidated()).toBe(false);
  });
  it("keeps lease conflicts and normal closes at document scope", () => {
    for (const code of [1000, 1006, 4409]) {
      expect(handleCollaborationSessionEnd({ code, reason: "Session ended" }, captureAuthGeneration())).toBe(false);
    }
    expect(isAuthInvalidated()).toBe(false);
  });
});
