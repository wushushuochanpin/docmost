import type { Edge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";

import type { DropOp } from "@/features/page/tree/model/tree-model.types";

export function gridEdgeToDropOp(edge: Edge | null, targetId: string): DropOp {
  return edge === "top" || edge === "left"
    ? { kind: "reorder-before", targetId }
    : { kind: "reorder-after", targetId };
}
