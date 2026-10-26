import { beforeEach, describe, expect, it, vi } from "vitest";
import { bootstrapIdentity } from "./identity-service";
import {
  beginIdentityLogin,
  IdentityBrowserUnsupportedError,
} from "./identity-bootstrap";
import { establishAuthSession } from "@/features/auth/session-lifecycle";
import {
  AUTH_COOKIE_LOCK,
  withAuthCookieLock,
} from "@/features/auth/auth-cookie-lock";

vi.mock("./identity-service", () => ({ bootstrapIdentity: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  establishAuthSession();
});

function installSerializedLocks() {
  let tail = Promise.resolve();
  const request = vi.fn((_name, action) => {
    const result = tail.then(action);
    tail = result.catch(() => {});
    return result;
  });
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request },
  });
  return request;
}

describe("identity cookie bootstrap", () => {
  it("serializes three concurrent starts before their individual transactions", async () => {
    const locks = installSerializedLocks();
    const calls: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    vi.mocked(bootstrapIdentity).mockImplementation(async () => {
      maxInFlight = Math.max(maxInFlight, ++inFlight);
      calls.push("bootstrap");
      await Promise.resolve();
      inFlight--;
      return { ready: true, authenticated: false };
    });
    await Promise.all(
      [1, 2, 3].map((index) =>
        beginIdentityLogin(`/s/general/p/${index}`, (url) => calls.push(url)),
      ),
    );
    expect(maxInFlight).toBe(1);
    expect(
      calls.map((value) => (value === "bootstrap" ? "bootstrap" : "navigate")),
    ).toEqual([
      "bootstrap",
      "navigate",
      "bootstrap",
      "navigate",
      "bootstrap",
      "navigate",
    ]);
    expect(locks.mock.calls.every(([name]) => name === AUTH_COOKIE_LOCK)).toBe(
      true,
    );
  });
  it("does not navigate when bootstrap fails and releases the lock for retry", async () => {
    installSerializedLocks();
    vi.mocked(bootstrapIdentity)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ ready: true, authenticated: false });
    const navigate = vi.fn();
    await expect(beginIdentityLogin("/home", navigate)).rejects.toThrow(
      "offline",
    );
    expect(navigate).not.toHaveBeenCalled();
    await beginIdentityLogin("/home", navigate);
    expect(navigate).toHaveBeenCalledWith(
      "/api/identity/start?returnTo=%2Fhome",
    );
  });
  it("requires Web Locks for center login while preserving local login compatibility", async () => {
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: undefined,
    });
    const navigate = vi.fn();
    await expect(beginIdentityLogin("/home", navigate)).rejects.toBeInstanceOf(
      IdentityBrowserUnsupportedError,
    );
    expect(bootstrapIdentity).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(await withAuthCookieLock(async () => "local")).toBe("local");
  });
  it("keeps an existing server-authenticated session instead of starting a replacement", async () => {
    installSerializedLocks();
    vi.mocked(bootstrapIdentity).mockResolvedValue({
      ready: true,
      authenticated: true,
    });
    const navigate = vi.fn();
    await beginIdentityLogin("/s/general/p/existing", navigate);
    expect(navigate).toHaveBeenCalledWith("/s/general/p/existing");
  });
});
