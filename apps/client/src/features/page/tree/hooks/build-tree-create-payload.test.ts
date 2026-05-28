import { describe, expect, it } from "vitest";

import { buildTreeCreatePayload } from "./build-tree-create-payload";

describe("buildTreeCreatePayload", () => {
  it("defaults root creates to folders", () => {
    expect(buildTreeCreatePayload("space-1", null)).toEqual({
      spaceId: "space-1",
      nodeType: "folder",
    });
  });

  it("defaults child creates to files", () => {
    expect(buildTreeCreatePayload("space-1", "parent-1")).toEqual({
      spaceId: "space-1",
      parentPageId: "parent-1",
      nodeType: "file",
    });
  });

  it("keeps an explicit node type", () => {
    expect(
      buildTreeCreatePayload("space-1", "parent-1", { nodeType: "folder" }),
    ).toEqual({
      spaceId: "space-1",
      parentPageId: "parent-1",
      nodeType: "folder",
    });
  });
});
