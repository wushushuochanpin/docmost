import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { ActionIcon, Text, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconChevronDown,
  IconChevronRight,
  IconFileDescription,
  IconFolder,
  IconInfoCircle,
  IconPinned,
} from "@tabler/icons-react";
import clsx from "clsx";

import { treeModel } from "@/features/page/tree/model/tree-model";
import type { DropOp } from "@/features/page/tree/model/tree-model.types";
import type { SpaceTreeNode } from "@/features/page/tree/types.ts";
import { invalidateRootSidebarQueries } from "@/features/page/queries/page-query.ts";
import { reorderPinnedPages } from "@/features/page/services/page-service.ts";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { DocTree } from "./doc-tree";
import { SpaceTreeRow } from "./space-tree-row";
import classes from "./pinned-pages-section.module.css";

/**
 * How many pinned pages we consider healthy. Beyond this the sidebar shows a
 * gentle nudge to prune — the whole point of the pinned section is quick
 * access, which degrades once the section becomes a second tree.
 */
const PINNED_PAGES_LIMIT = 10;
const COLLAPSE_STORAGE_PREFIX = "docmost:pinned-section-collapsed:";

interface PinnedPagesSectionProps {
  spaceId: string;
  readOnly: boolean;
  /** Root-level pinned pages, in server order (pinnedAt desc). */
  pages: SpaceTreeNode[];
  openIds: ReadonlySet<string>;
  selectedId?: string;
  onToggle: (id: string, isOpen: boolean) => void;
  /**
   * When false, the collapsible section header (chevron, "Pinned pages"
   * title, count, over-limit hint) is not rendered. Used when this section
   * is itself the whole sidebar view (the "Pinned" tab) — the tab already
   * communicates what is shown, so the inner header would be redundant.
   */
  showHeader?: boolean;
}

export function PinnedPagesSection({
  spaceId,
  readOnly,
  pages,
  openIds,
  selectedId,
  onToggle,
  showHeader = true,
}: PinnedPagesSectionProps) {
  const { t } = useTranslation();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return (
        localStorage.getItem(COLLAPSE_STORAGE_PREFIX + spaceId) === "collapsed"
      );
    } catch {
      return false;
    }
  });

  // The user's display order, kept separately from the atom so drag reorder is
  // instant. Newly pinned ids are inserted at the top (newest pin first);
  // unpinned ids drop out automatically.
  const [orderIds, setOrderIds] = useState<string[]>(() =>
    pages.map((page) => page.id),
  );
  const orderIdsRef = useRef(orderIds);
  orderIdsRef.current = orderIds;

  useEffect(() => {
    try {
      localStorage.setItem(
        COLLAPSE_STORAGE_PREFIX + spaceId,
        collapsed ? "collapsed" : "open",
      );
    } catch {
      // localStorage unavailable (private mode etc.) — collapse state is
      // session-only then, which is fine.
    }
  }, [collapsed, spaceId]);

  useEffect(() => {
    setOrderIds((prev) => {
      const ids = new Set(pages.map((page) => page.id));
      const next = prev.filter((id) => ids.has(id));
      let changed = next.length !== prev.length;
      // Newly pinned pages go to the TOP (newest pin first), matching the
      // server-side pinnedAt desc ordering, so a fresh pin lands in the same
      // spot after a reload.
      for (let i = pages.length - 1; i >= 0; i--) {
        if (!next.includes(pages[i].id)) {
          next.unshift(pages[i].id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pages]);

  const pageById = useMemo(
    () => new Map(pages.map((page) => [page.id, page])),
    [pages],
  );

  const orderedPages = useMemo(
    () =>
      orderIds
        .map((id) => pageById.get(id))
        .filter((page): page is SpaceTreeNode => Boolean(page)),
    [orderIds, pageById],
  );

  const orderedPagesRef = useRef(orderedPages);
  orderedPagesRef.current = orderedPages;

  // Guards against concurrent reorder requests. Each reorder rewrites the
  // persisted pinnedAt keys for the whole section, so two in-flight requests
  // could otherwise clobber each other with stale orders.
  const savingRef = useRef(false);

  const renderRow = useCallback(
    (rowProps: Parameters<typeof SpaceTreeRow>[0]) => (
      <SpaceTreeRow {...rowProps} readOnly={readOnly} />
    ),
    [readOnly],
  );

  const getDragLabel = useCallback(
    (node: SpaceTreeNode) => node.name || t("untitled"),
    [t],
  );

  // Only the pinned root rows are reorderable here. Descendants of a pinned
  // folder are shown for navigation, but structural drag belongs to the tree
  // (or the Move dialog) — dragging them here would be a no-op.
  const disableDrag = useCallback((node: SpaceTreeNode) => {
    return node.parentPageId !== null;
  }, []);
  const disableDrop = useCallback((node: SpaceTreeNode) => {
    return node.parentPageId !== null;
  }, []);

  const handleMove = useCallback(
    async (sourceId: string, op: DropOp) => {
      if (op.kind === "make-child") return;
      if (savingRef.current) return;
      const prev = orderIdsRef.current;
      const { tree: after } = treeModel.move(
        orderedPagesRef.current,
        sourceId,
        op,
      );
      const next = after.map((node) => node.id);
      if (
        next.length === prev.length &&
        next.every((id, index) => id === prev[index])
      ) {
        return;
      }

      savingRef.current = true;
      setOrderIds(next);
      try {
        await reorderPinnedPages(next);
        // Refetch so pinnedAt timestamps (the persisted sort key) match the
        // user's new order across sessions and other clients.
        invalidateRootSidebarQueries(spaceId);
      } catch {
        setOrderIds(prev);
        notifications.show({
          message: t("Reordering pinned pages failed. Please try again."),
          color: "red",
        });
      } finally {
        savingRef.current = false;
      }
    },
    [spaceId, t],
  );

  // --- Chip-mode drag reorder (used when this section is the whole sidebar
  // view, i.e. the "Pinned" tab). Falls back to native HTML5 DnD so we don't
  // have to wire the complex DocTree drag sensors into a flat chip list.
  const chipDragSourceId = useRef<string | null>(null);
  const [chipDropTarget, setChipDropTarget] = useState<{
    id: string;
    position: "before" | "after";
  } | null>(null);

  const handleChipDragStart = useCallback(
    (e: React.DragEvent, id: string) => {
      chipDragSourceId.current = id;
      e.dataTransfer.effectAllowed = "move";
      // Firefox requires data to be set for drag to start.
      e.dataTransfer.setData("text/plain", id);
    },
    [],
  );

  const handleChipDragOver = useCallback(
    (e: React.DragEvent, id: string) => {
      e.preventDefault();
      if (chipDragSourceId.current === id) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const before = e.clientX < rect.left + rect.width / 2;
      setChipDropTarget({ id, position: before ? "before" : "after" });
    },
    [],
  );

  const handleChipDrop = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      const sourceId = chipDragSourceId.current;
      const position = chipDropTarget?.position ?? "after";
      setChipDropTarget(null);
      chipDragSourceId.current = null;
      if (!sourceId || sourceId === targetId) return;
      const op: DropOp =
        position === "before"
          ? { kind: "reorder-before", targetId }
          : { kind: "reorder-after", targetId };
      handleMove(sourceId, op);
    },
    [chipDropTarget, handleMove],
  );

  const handleChipDragEnd = useCallback(() => {
    chipDragSourceId.current = null;
    setChipDropTarget(null);
  }, []);

  return (
    <div className={classes.section}>
      {showHeader && (
        <div className={classes.header}>
          <ActionIcon
            variant="subtle"
            size={20}
            c="gray"
            aria-label={
              collapsed
                ? t("Expand pinned pages")
                : t("Collapse pinned pages")
            }
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? (
              <IconChevronRight size={16} stroke={2} />
            ) : (
              <IconChevronDown size={16} stroke={2} />
            )}
          </ActionIcon>

          <IconPinned size={14} stroke={1.8} className={classes.pinIcon} />

          <Text size="xs" fw={500} c="dimmed">
            {t("Pinned pages")}
          </Text>

          <span className={classes.count}>{pages.length}</span>

          {pages.length > PINNED_PAGES_LIMIT && (
            <Tooltip
              label={t("Pinned pages limit hint")}
              withArrow
              position="bottom"
              multiline
              w={220}
            >
              <span className={classes.hintIcon}>
                <IconInfoCircle size={14} stroke={1.8} />
              </span>
            </Tooltip>
          )}
        </div>
      )}

      {!collapsed && (
        <>
          {pages.length > PINNED_PAGES_LIMIT && (
            <Text size="xs" c="dimmed" className={classes.hint}>
              {t("Pinned pages over limit hint", { count: pages.length })}
            </Text>
          )}
          {showHeader ? (
            <DocTree<SpaceTreeNode>
              data={orderedPages}
              openIds={openIds}
              selectedId={selectedId}
              renderRow={renderRow}
              indentPerLevel={12}
              onMove={handleMove}
              onToggle={onToggle}
              readOnly={readOnly}
              disableDrag={disableDrag}
              disableDrop={disableDrop}
              blockMakeChild
              getDragLabel={getDragLabel}
              containerClassName={classes.tree}
              aria-label={t("Pinned pages")}
            />
          ) : (
            <div className={classes.chipsWrap} aria-label={t("Pinned pages")}>
              {orderedPages.map((node) => (
                <PinnedChip
                  key={node.id}
                  node={node}
                  readOnly={readOnly}
                  dropState={
                    chipDropTarget?.id === node.id ? chipDropTarget.position : null
                  }
                  onDragStart={handleChipDragStart}
                  onDragOver={handleChipDragOver}
                  onDrop={handleChipDrop}
                  onDragEnd={handleChipDragEnd}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface PinnedChipProps {
  node: SpaceTreeNode;
  readOnly: boolean;
  dropState: "before" | "after" | null;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDrop: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
}

function PinnedChip({
  node,
  readOnly,
  dropState,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: PinnedChipProps) {
  const { t } = useTranslation();
  const { spaceSlug } = useParams();
  const pageUrl = buildPageUrl(spaceSlug, node.slugId, node.name);

  return (
    <Link
      to={pageUrl}
      draggable={!readOnly}
      onDragStart={(e) => onDragStart(e, node.id)}
      onDragOver={(e) => onDragOver(e, node.id)}
      onDrop={(e) => onDrop(e, node.id)}
      onDragEnd={onDragEnd}
      className={clsx(classes.chip, {
        [classes.chipDropBefore]: dropState === "before",
        [classes.chipDropAfter]: dropState === "after",
      })}
      aria-label={node.name || t("untitled")}
    >
      {node.icon ? (
        <span className={classes.chipIcon}>{node.icon}</span>
      ) : node.nodeType === "folder" ? (
        <IconFolder size={14} className={classes.chipIcon} />
      ) : (
        <IconFileDescription size={14} className={classes.chipIcon} />
      )}
      <span className={classes.chipLabel}>{node.name || t("untitled")}</span>
    </Link>
  );
}
