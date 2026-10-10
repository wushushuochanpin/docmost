import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { notifications } from "@mantine/notifications";

import { treeModel } from "@/features/page/tree/model/tree-model";
import type { DropOp } from "@/features/page/tree/model/tree-model.types";
import type { SpaceTreeNode } from "@/features/page/tree/types.ts";
import { invalidateRootSidebarQueries } from "@/features/page/queries/page-query.ts";
import { reorderPinnedPages } from "@/features/page/services/page-service.ts";

/**
 * Shared pinned-page ordering for every pinned-view layout (chips / list /
 * grid). Keeps a local display order (instant drag feedback), persists it via
 * reorderPinnedPages (writes pinnedAt keys), guards against concurrent
 * reorders, and rolls back to the previous order on failure.
 */
export function usePinnedReorder(pages: SpaceTreeNode[], spaceId: string) {
  const { t } = useTranslation();

  // The user's display order, kept separately from the atom so drag reorder is
  // instant. Newly pinned ids are inserted at the top (newest pin first);
  // unpinned ids drop out automatically.
  const [orderIds, setOrderIds] = useState<string[]>(() =>
    pages.map((page) => page.id),
  );
  const orderIdsRef = useRef(orderIds);
  orderIdsRef.current = orderIds;

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

  const orderedNodes = useMemo(
    () =>
      orderIds
        .map((id) => pageById.get(id))
        .filter((page): page is SpaceTreeNode => Boolean(page)),
    [orderIds, pageById],
  );

  const orderedNodesRef = useRef(orderedNodes);
  orderedNodesRef.current = orderedNodes;

  // Guards against concurrent reorder requests. Each reorder rewrites the
  // persisted pinnedAt keys for the whole section, so two in-flight requests
  // could otherwise clobber each other with stale orders.
  const savingRef = useRef(false);

  const handleMove = useCallback(
    async (sourceId: string, op: DropOp) => {
      if (op.kind === "make-child") return;
      if (savingRef.current) return;
      const prev = orderIdsRef.current;
      const { tree: after } = treeModel.move(
        orderedNodesRef.current,
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

  return { orderedNodes, handleMove };
}
