import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/api-client";
import { establishAuthSession } from "@/features/auth/session-lifecycle";
import { AUTH_COOKIE_LOCK, IdentityBrowserUnsupportedError } from "@/features/auth/auth-cookie-lock";
import { startIdentityLink } from "./identity-service";

beforeEach(() => establishAuthSession());
afterEach(() => vi.restoreAllMocks());

describe("identity binding cookie serialization", () => {
  it("waits for the shared cookie lock before dispatching link/start", async () => {
    let action: () => Promise<unknown>;
    let release: (result: unknown) => void;
    const request = vi.fn((_name, run) => { action = run; return new Promise((resolve) => { release = resolve; }); });
    Object.defineProperty(navigator, "locks", { configurable: true, value: { request } });
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: { url: "https://identity.example/login/t/example" } });
    const result = startIdentityLink("local-password");
    expect(request).toHaveBeenCalledWith(AUTH_COOKIE_LOCK, expect.any(Function));
    expect(post).not.toHaveBeenCalled();
    release(await action());
    await expect(result).resolves.toEqual({ url: "https://identity.example/login/t/example" });
    expect(post).toHaveBeenCalledWith("/identity/link/start", { password: "local-password", returnTo: "/settings/account/profile" });
  });
  it("does not send a binding request when the browser cannot serialize cookies", async () => {
    Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
    const post = vi.spyOn(api, "post");
    await expect(startIdentityLink("local-password")).rejects.toBeInstanceOf(IdentityBrowserUnsupportedError);
    expect(post).not.toHaveBeenCalled();
  });
});
