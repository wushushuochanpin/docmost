import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import type { SpaceTreeNode } from "@/features/page/tree/types";
import { SidebarNodeGrid } from "./sidebar-node-grid";
import { gridEdgeToDropOp } from "./sidebar-node-grid-dnd";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@atlaskit/pragmatic-drag-and-drop/element/adapter", () => ({
  draggable: () => () => undefined,
  dropTargetForElements: () => () => undefined,
}));

vi.mock("@atlaskit/pragmatic-drag-and-drop-auto-scroll/element", () => ({
  autoScrollForElements: () => () => undefined,
}));

vi.mock("./sidebar-node-card", () => ({
  SidebarNodeCard: ({ node }: { node: SpaceTreeNode }) => (
    <a href={`/pages/${node.slugId}`}>{node.name}</a>
  ),
}));

const nodes: SpaceTreeNode[] = [
  {
    id: "page-1",
    slugId: "one",
    name: "One",
    position: "a",
    spaceId: "space-1",
    parentPageId: null,
    hasChildren: false,
    children: [],
  },
  {
    id: "page-2",
    slugId: "two",
    name: "Two",
    position: "b",
    spaceId: "space-1",
    parentPageId: null,
    hasChildren: false,
    children: [],
  },
];

describe("SidebarNodeGrid", () => {
  it("renders cards as normal-flow list items instead of virtual tree rows", () => {
    const { container } = render(
      <SidebarNodeGrid
        nodes={nodes}
        readOnly={false}
        onMove={vi.fn()}
        ariaLabel="Pages"
      />,
    );

    expect(screen.getByRole("list", { name: "Pages" })).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(container.querySelector('[role="tree"]')).toBeNull();
    expect(container.querySelector('[style*="position: absolute"]')).toBeNull();
  });

  it("maps all four grid edges to stable sibling reorder operations", () => {
    expect(gridEdgeToDropOp("left", "target")).toEqual({
      kind: "reorder-before",
      targetId: "target",
    });
    expect(gridEdgeToDropOp("top", "target")).toEqual({
      kind: "reorder-before",
      targetId: "target",
    });
    expect(gridEdgeToDropOp("right", "target")).toEqual({
      kind: "reorder-after",
      targetId: "target",
    });
    expect(gridEdgeToDropOp("bottom", "target")).toEqual({
      kind: "reorder-after",
      targetId: "target",
    });
  });
});
