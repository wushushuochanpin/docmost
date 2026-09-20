import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useEditorSessionLease } from "./use-editor-session-lease";
import {
  acquireEditorSession,
  heartbeatEditorSession,
  releaseEditorSession,
  releaseEditorSessionOnUnload,
  takeoverEditorSession,
} from "./services";
import { ensureUniqueEditorSessionClientId } from "./client-id";

vi.mock("./services", () => ({
  acquireEditorSession: vi.fn(),
  heartbeatEditorSession: vi.fn(),
  releaseEditorSession: vi.fn(),
  releaseEditorSessionOnUnload: vi.fn(),
  takeoverEditorSession: vi.fn(),
}));

vi.mock("./client-id", () => ({
  ensureUniqueEditorSessionClientId: vi.fn(),
  getEditorSessionClientId: vi.fn(),
}));

const acquireMock = vi.mocked(acquireEditorSession);
const heartbeatMock = vi.mocked(heartbeatEditorSession);
const ensureClientIdMock = vi.mocked(ensureUniqueEditorSessionClientId);

const editSession = {
  sessionId: "session-1",
  clientId: "client-1",
  leaseId: "lease-1",
  token: 42,
};

const activeResponse = {
  resourceType: "page" as const,
  resourceId: "page-1",
  status: "active" as const,
  writable: true,
  editSession,
};

beforeEach(() => {
  vi.clearAllMocks();
  // In DEV/vitest, getConfigValue reads import.meta.env instead of window.CONFIG.
  vi.stubEnv("EDITOR_SESSION_ENABLED", "true");
  ensureClientIdMock.mockResolvedValue("client-1");
  acquireMock.mockResolvedValue(activeResponse);
  heartbeatMock.mockResolvedValue(activeResponse);
  vi.mocked(releaseEditorSession).mockResolvedValue(undefined as any);
  vi.mocked(releaseEditorSessionOnUnload).mockResolvedValue(undefined as any);
  vi.mocked(takeoverEditorSession).mockResolvedValue(activeResponse as any);
  Object.defineProperty(document, "visibilityState", {
    value: "visible",
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("useEditorSessionLease recovery surface", () => {
  it("exposes reacquire so the collab layer can recover a stale lease", async () => {
    const { result } = renderHook(() =>
      useEditorSessionLease({
        enabled: true,
        resourceType: "page",
        resourceId: "page-1",
      }),
    );

    await waitFor(() => {
      expect(result.current.status).toBe("active");
    });
    expect(result.current.reacquire).toBeTypeOf("function");

    // Second lease returned by a re-acquire replaces the first one.
    const secondResponse = {
      ...activeResponse,
      editSession: { ...editSession, leaseId: "lease-2", token: 43 },
    };
    acquireMock.mockResolvedValueOnce(secondResponse);

    await act(async () => {
      await result.current.reacquire();
    });
    expect(acquireMock).toHaveBeenCalledTimes(2);
    expect(result.current.editSession?.leaseId).toBe("lease-2");
    expect(result.current.editSession?.token).toBe(43);
  });

  it("fires an immediate heartbeat when the tab becomes visible again", async () => {
    const { result } = renderHook(() =>
      useEditorSessionLease({
        enabled: true,
        resourceType: "page",
        resourceId: "page-1",
      }),
    );

    await waitFor(() => {
      expect(result.current.status).toBe("active");
    });
    heartbeatMock.mockClear();

    // Regression: returning to a backgrounded tab must refresh the lease right
    // away so the collab reconnect validates against a fresh lease instead of
    // a stale one (server would otherwise 409 and close the connection).
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => {
      expect(heartbeatMock).toHaveBeenCalledTimes(1);
    });
    expect(heartbeatMock).toHaveBeenCalledWith({
      resourceType: "page",
      resourceId: "page-1",
      editSession,
    });
  });
});
