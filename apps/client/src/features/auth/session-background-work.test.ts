import { beforeEach, describe, expect, it, vi } from "vitest";
import { CanceledError } from "axios";
import { queryClient } from "@/query-client";
import { establishAuthSession, invalidateAuthSession } from "./session-lifecycle";
import { settleSessionBackgroundWork } from "./session-background-work";

beforeEach(() => establishAuthSession());

describe("background query cancellation on logout", () => {
  it("settles a real pending fetchQuery chain without unhandled rejection or stale success", async () => {
    const report = vi.fn();
    const success = vi.fn();
    const unhandled = vi.fn();
    window.addEventListener("unhandledrejection", unhandled);
    let complete: (value: string) => void;
    try {
      const task = settleSessionBackgroundWork(queryClient.fetchQuery({
        queryKey: ["logout-cancellation-regression"],
        queryFn: () => new Promise<string>((resolve) => { complete = resolve; }),
      }).then(success), report);
      expect(complete).toBeDefined();
      invalidateAuthSession("logout");
      await expect(task).resolves.toBeUndefined();
      complete("late private response");
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(success).not.toHaveBeenCalled();
      expect(report).not.toHaveBeenCalled();
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("unhandledrejection", unhandled);
    }
  });

  it("treats the API session-generation cancellation as expected", async () => {
    const report = vi.fn();
    await expect(settleSessionBackgroundWork(Promise.reject(new CanceledError("Session changed")), report)).resolves.toBeUndefined();
    expect(report).not.toHaveBeenCalled();
  });

  it("routes unexpected errors to the task owner's failure path", async () => {
    const report = vi.fn();
    const failure = new Error("connection failed");
    await settleSessionBackgroundWork(Promise.reject(failure), report);
    expect(report).toHaveBeenCalledWith(failure);
  });
});
