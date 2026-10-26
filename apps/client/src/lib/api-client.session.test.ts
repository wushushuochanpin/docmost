import { beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError, isCancel, type InternalAxiosRequestConfig } from "axios";
import api, { AUTH_UNAUTHORIZED_EVENT } from "./api-client";
import {
  establishAuthSession,
  invalidateAuthSession,
  isAuthInvalidated,
} from "@/features/auth/session-lifecycle";

beforeEach(() => {
  window.history.replaceState({}, "", "/home");
  establishAuthSession();
});

function rejection(config: InternalAxiosRequestConfig, status: number, data = {}) {
  return new AxiosError(
    "Denied",
    "ERR_BAD_REQUEST",
    config,
    { responseURL: `http://localhost/api${config.url}` },
    { status, statusText: "Denied", headers: {}, config, data },
  );
}

describe("session response isolation", () => {
  it("keeps local generation checks usable when persistent storage is full", async () => {
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota exceeded"); });
    try {
      establishAuthSession();
      const response = await api.get("/pages/info", { adapter: async (config) => ({ data: { data: { safe: true } }, status: 200, statusText: "OK", headers: {}, config }) });
      expect(response.data).toEqual({ safe: true });
    } finally { write.mockRestore(); }
  });
  it("discards an old successful response after login changes", async () => {
    let resolve: (value: any) => void;
    let captured: InternalAxiosRequestConfig;
    const result = api
      .get("/pages/info", {
        adapter: (config) => {
          captured = config;
          return new Promise((done) => {
            resolve = done;
          });
        },
      })
      .catch((error) => error);
    await vi.waitFor(() => expect(resolve).toBeDefined());
    establishAuthSession();
    resolve({
      data: { data: { content: "old private data" } },
      status: 200,
      statusText: "OK",
      headers: {},
      config: captured,
    });
    expect(isCancel(await result)).toBe(true);
    expect(isAuthInvalidated()).toBe(false);
  });
  it("does not let a delayed 401 clear a new login", async () => {
    let reject: (error: unknown) => void;
    let captured: InternalAxiosRequestConfig;
    const listener = vi.fn();
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, listener);
    const result = api
      .get("/pages/info", {
        adapter: (config) => {
          captured = config;
          return new Promise((_, fail) => {
            reject = fail;
          });
        },
      })
      .catch((error) => error);
    await vi.waitFor(() => expect(reject).toBeDefined());
    establishAuthSession();
    reject(rejection(captured, 401));
    expect(isCancel(await result)).toBe(true);
    expect(listener).not.toHaveBeenCalled();
    expect(isAuthInvalidated()).toBe(false);
    window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, listener);
  });
  it("keeps password verification errors local to the linking form", async () => {
    await expect(
      api.post(
        "/identity/link/start",
        {},
        { adapter: (config) => Promise.reject(rejection(config, 401, { message: "identity_password_invalid" })) },
      ),
    ).rejects.toMatchObject({ response: { status: 401 } });
    expect(isAuthInvalidated()).toBe(false);
  });
  it("invalidates an expired session even when the request was account linking", async () => {
    await expect(api.post("/identity/link/start", {}, { adapter: (config) => Promise.reject(rejection(config, 401)) })).rejects.toMatchObject({ response: { status: 401 } });
    expect(isAuthInvalidated()).toBe(true);
  });
  it("quarantines protected requests immediately during logout but permits retrying logout", async () => {
    invalidateAuthSession("logout");
    const adapter = vi.fn(async (config) => ({
      data: {},
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    }));
    expect(
      isCancel(
        await api.get("/pages/info", { adapter }).catch((error) => error),
      ),
    ).toBe(true);
    expect(adapter).not.toHaveBeenCalled();
    await api.post("/auth/logout", {}, { adapter });
    expect(adapter).toHaveBeenCalledOnce();
  });
});
