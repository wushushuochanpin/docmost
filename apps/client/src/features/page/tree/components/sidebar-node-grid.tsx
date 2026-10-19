import { useEffect, useMemo, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import {
  attachClosestEdge,
  extractClosestEdge,
  type Edge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";

import type { DropOp } from "@/features/page/tree/model/tree-model.types";
import type { SpaceTreeNode } from "@/features/page/tree/types.ts";
import { SidebarNodeCard } from "./sidebar-node-card";
import { gridEdgeToDropOp } from "./sidebar-node-grid-dnd";
import classes from "./sidebar-node-grid.module.css";

const GRID_DRAG_TYPE = "sidebar-grid-item";

interface SidebarNodeGridProps {
  nodes: SpaceTreeNode[];
  selectedId?: string;
  readOnly: boolean;
  onMove: (sourceId: string, op: DropOp) => void | Promise<void>;
  ariaLabel: string;
}

/**
 * Flat, responsive collection for root page cards.
 *
 * DocTree deliberately stays a one-dimensional virtualized tree. A grid has
 * different geometry and hit-testing, so forcing cards through DocTree's
 * fixed row offsets makes them overlap. This container shares the same nodes
 * and DropOp contract while owning layout-aware rendering and reordering.
 */
export function SidebarNodeGrid({
  nodes,
  selectedId,
  readOnly,
  onMove,
  ariaLabel,
}: SidebarNodeGridProps) {
  const gridRef = useRef<HTMLUListElement>(null);
  const contextId = useMemo(() => Symbol("sidebar-node-grid"), []);

  useEffect(() => {
    const element = gridRef.current;
    if (!element) return;
    return autoScrollForElements({ element });
  }, []);

  return (
    <ul ref={gridRef} className={classes.grid} aria-label={ariaLabel}>
      {nodes.map((node) => (
        <SidebarNodeGridItem
          key={node.id}
          node={node}
          selected={selectedId === node.id}
          readOnly={readOnly}
          contextId={contextId}
          onMove={onMove}
        />
      ))}
    </ul>
  );
}

interface SidebarNodeGridItemProps {
  node: SpaceTreeNode;
  selected: boolean;
  readOnly: boolean;
  contextId: symbol;
  onMove: (sourceId: string, op: DropOp) => void | Promise<void>;
}

function SidebarNodeGridItem({
  node,
  selected,
  readOnly,
  contextId,
  onMove,
}: SidebarNodeGridItemProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dropEdge, setDropEdge] = useState<Edge | null>(null);
  const canReorder = !readOnly && node.canEdit !== false;

  useEffect(() => {
    const element = cardRef.current;
    if (!element || !canReorder) return;

    return combine(
      draggable({
        element,
        getInitialData: () => ({
          id: node.id,
          type: GRID_DRAG_TYPE,
          contextId,
        }),
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) =>
          source.data.type === GRID_DRAG_TYPE &&
          source.data.contextId === contextId &&
          source.data.id !== node.id,
        getData: ({ input, element: targetElement }) =>
          attachClosestEdge(
            { id: node.id, type: GRID_DRAG_TYPE },
            {
              input,
              element: targetElement,
              allowedEdges: ["top", "right", "bottom", "left"],
            },
          ),
        onDrag: ({ self }) => setDropEdge(extractClosestEdge(self.data)),
        onDragLeave: () => setDropEdge(null),
        onDrop: ({ source, self }) => {
          const sourceId = source.data.id;
          const edge = extractClosestEdge(self.data);
          setDropEdge(null);
          if (typeof sourceId !== "string" || sourceId === node.id) return;
          void onMove(sourceId, gridEdgeToDropOp(edge, node.id));
        },
      }),
    );
  }, [canReorder, contextId, node.id, onMove]);

  return (
    <li className={classes.item}>
      <SidebarNodeCard
        node={node}
        readOnly={readOnly}
        isSelected={selected}
        isDragging={isDragging}
        isReceivingDrop={
          dropEdge === "top" || dropEdge === "left"
            ? "before"
            : dropEdge
              ? "after"
              : null
        }
        cardRef={cardRef}
      />
    </li>
  );
}
