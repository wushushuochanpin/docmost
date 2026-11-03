import { describe, expect, it } from "vitest";
import { editorRecoveryDraftId } from "./draft-store";

describe("editor recovery draft identity", () => {
  const base = {
    workspaceId: "workspace-a",
    userId: "user-a",
    resourceType: "page" as const,
    resourceId: "page-1",
  };

  it("never reuses a draft id across accounts or workspaces", () => {
    const current = editorRecoveryDraftId(base, 1);
    expect(current).toBe("workspace-a:user-a:page:page-1:1");
    expect(
      editorRecoveryDraftId({ ...base, userId: "user-b" }, 1),
    ).not.toBe(current);
    expect(
      editorRecoveryDraftId({ ...base, workspaceId: "workspace-b" }, 1),
    ).not.toBe(current);
  });
});
