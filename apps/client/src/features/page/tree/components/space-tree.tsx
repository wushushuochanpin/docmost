import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Text } from "@mantine/core";
import {
  fetchAllAncestorChildren,
  useGetRootSidebarPagesQuery,
  usePageQuery,
} from "@/features/page/queries/page-query.ts";
import classes from "@/features/page/tree/styles/tree.module.css";
import { treeDataAtom } from "@/features/page/tree/atoms/tree-data-atom.ts";
import { openTreeNodesAtom } from "@/features/page/tree/atoms/open-tree-nodes-atom.ts";
import {
  recentVisitsAtom,
  recordRecentVisit,
} from "@/features/page/tree/atoms/recent-visits-atom.ts";
import { useTreeMutation } from "@/features/page/tree/hooks/use-tree-mutation.ts";
import {
  buildTree,
  buildTreeWithChildren,
  reconcileRootTrees,
} from "@/features/page/tree/utils/utils.ts";
import { SpaceTreeNode } from "@/features/page/tree/types.ts";
import { treeModel } from "@/features/page/tree/model/tree-model";
import { getPageBreadcrumbs } from "@/features/page/services/page-service.ts";
import { IPage, SidebarViewMode } from "@/features/page/types/page.types.ts";
import { extractPageSlugId } from "@/lib";
import { DocTree } from "./doc-tree";
import { SpaceTreeRow } from "./space-tree-row";
import { PinnedPagesSection } from "./pinned-pages-section";
import { SpaceGridView } from "./space-grid-view";

interface SpaceTreeProps {
  spaceId: string;
  readOnly: boolean;
  /**
   * Which sidebar view the tabs above are showing. "pinned" renders only the
   * pinned root pages (with their own drag-reorder); "all" renders the whole
   * root tree. The category view mode is accepted for future use and falls
   * back to "all" until categories are wired into the sidebar.
   */
  viewMode?: SidebarViewMode;
  /**
   * How the "all" view renders its root nodes: a tree list or a flat card
   * grid. Ignored in the "pinned" view (always a chip list).
   */
  layoutMode?: "list" | "grid";
}

export default function SpaceTree({
  spaceId,
  readOnly,
  viewMode = "all",
  layoutMode = "list",
}: SpaceTreeProps) {
  const { t } = useTranslation();
  const { pageSlug } = useParams();
  const [data, setData] = useAtom(treeDataAtom);
  const { handleMove } = useTreeMutation(spaceId);
  const {
    data: pagesData,
    hasNextPage,
    fetchNextPage,
    isFetching,
  } = useGetRootSidebarPagesQuery({ spaceId });
  const [openTreeNodes, setOpenTreeNodes] = useAtom(openTreeNodesAtom);
  const [, setRecentVisits] = useAtom(recentVisitsAtom);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const spaceIdRef = useRef(spaceId);
  spaceIdRef.current = spaceId;
  const { data: currentPage } = usePageQuery({
    pageId: extractPageSlugId(pageSlug),
  });

  // Record each opened page into the recent-visits rail (front of the list).
  useEffect(() => {
    if (!currentPage?.id) return;
    setRecentVisits((prev) =>
      recordRecentVisit(prev, {
        id: currentPage.id,
        slugId: currentPage.slugId,
        name: currentPage.title || "",
        icon: currentPage.icon ?? undefined,
        spaceId: currentPage.spaceId,
      }),
    );
  }, [currentPage?.id, setRecentVisits]);

  useEffect(() => {
    setIsDataLoaded(false);
  }, [spaceId]);

  useEffect(() => {
    if (hasNextPage && !isFetching) {
      fetchNextPage();
    }
  }, [hasNextPage, fetchNextPage, isFetching, spaceId]);

  useEffect(() => {
    if (!pagesData?.pages || hasNextPage) return;

    const allItems = pagesData.pages.flatMap((page) => page.items);
    const treeData = buildTree(allItems);

    setData((prev) => {
      // Keep nodes belonging to other spaces — filteredData filters by spaceId
      // for rendering, so accumulating is safe. Preserves lazy-loaded children
      // and open-state when the user returns to a previously-visited space.
      const otherSpaces = prev.filter((n) => n?.spaceId !== spaceId);
      const currentSpace = prev.filter((n) => n?.spaceId === spaceId);
      const refreshed =
        currentSpace.length > 0
          ? reconcileRootTrees(currentSpace, treeData)
          : treeData;
      return [...otherSpaces, ...refreshed];
    });
    setIsDataLoaded(true);
  }, [pagesData, hasNextPage, spaceId]);

  const openAncestorNodes = useCallback(
    (ancestorIds: string[]) => {
      if (ancestorIds.length === 0) return;

      setOpenTreeNodes((prev) => {
        let changed = false;
        const next = { ...prev };

        for (const id of ancestorIds) {
          if (!next[id]) {
            next[id] = true;
            changed = true;
          }
        }

        return changed ? next : prev;
      });
    },
    [setOpenTreeNodes],
  );

  useEffect(() => {
    const effectSpaceId = spaceId;
    let cancelled = false;

    const fetchData = async () => {
      if (!isDataLoaded || !currentPage?.id) return;

      // If the current page is already loaded in the client tree, mirror the
      // old react-arborist select() behavior by opening all loaded parents.
      const loadedAncestorIds = treeModel.ancestorIds(data, currentPage.id);
      if (loadedAncestorIds) {
        openAncestorNodes(loadedAncestorIds);
        return;
      }

      // If the selected page is deeper than the loaded tree, fetch and build
      // its ancestor chain before opening those parents.
      const ancestors = await getPageBreadcrumbs(currentPage.id);

      if (cancelled || spaceIdRef.current !== effectSpaceId) return;

      if (ancestors && ancestors.length > 1) {
        let flatTreeItems = [...buildTree(ancestors)];

        const fetchAndUpdateChildren = async (ancestor: IPage) => {
          // we don't want to fetch the children of the opened page
          if (ancestor.id === currentPage.id) return;
          const children = await fetchAllAncestorChildren({
            pageId: ancestor.id,
            spaceId: ancestor.spaceId,
          });

          flatTreeItems = [
            ...flatTreeItems,
            ...children.filter(
              (child) => !flatTreeItems.some((item) => item.id === child.id),
            ),
          ];
        };

        const fetchPromises = ancestors.map((ancestor) =>
          fetchAndUpdateChildren(ancestor),
        );

        Promise.all(fetchPromises).then(() => {
          if (cancelled || spaceIdRef.current !== effectSpaceId) return;

          // build tree with children
          const ancestorsTree = buildTreeWithChildren(flatTreeItems);
          // child of root page we're attaching the built ancestors to
          const rootChild = ancestorsTree[0];
          if (!rootChild) return;

          // attach built ancestors to tree using functional updater
          setData((currentData) =>
            treeModel.appendChildren(
              currentData,
              rootChild.id,
              rootChild.children ?? [],
            ),
          );

          // open all ancestors of the current page. DocTree picks up the
          // selectedId change and scrolls the row into view on its own once
          // flat contains it.
          openAncestorNodes(
            ancestors
              .filter((ancestor) => ancestor.id !== currentPage.id)
              .map((ancestor) => ancestor.id),
          );
        });
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [
    isDataLoaded,
    currentPage?.id,
    data,
    spaceId,
    setData,
    openAncestorNodes,
  ]);

  const openIds = useMemo(
    () => new Set(Object.keys(openTreeNodes).filter((k) => openTreeNodes[k])),
    [openTreeNodes],
  );

  const handleToggle = useCallback(
    async (id: string, isOpen: boolean) => {
      setOpenTreeNodes((prev) => ({ ...prev, [id]: isOpen }));
      if (isOpen) {
        const node = treeModel.find(data, id) as SpaceTreeNode | null;
        if (
          node?.hasChildren &&
          (!node.children || node.children.length === 0)
        ) {
          const fetched = await fetchAllAncestorChildren({
            pageId: id,
            spaceId: node.spaceId,
          });
          setData((prev) => treeModel.appendChildren(prev, id, fetched));
        }
      }
    },
    [data, setOpenTreeNodes, setData],
  );

  const filteredData = useMemo(
    () => data.filter((node) => node?.spaceId === spaceId),
    [data, spaceId],
  );

  // Pinned root pages live in their own collapsible section above the tree.
  // In the "all" view the server already sorts pinned roots first, so the full
  // filtered list is rendered directly as one tree. In the "pinned" view we
  // render only these pinned roots via PinnedPagesSection (which owns their
  // drag-reorder).
  const pinnedRoots = useMemo(
    () =>
      filteredData.filter(
        (node) => node.parentPageId === null && node.isPinned,
      ),
    [filteredData],
  );

  const showPinnedOnly = viewMode === "pinned";

  // Stable callbacks for DocTree. Without these, every parent render recreates
  // the props and tears down every row's draggable/dropTarget subscription,
  // defeating memo(DocTreeRow).
  const renderRow = useCallback(
    (rowProps: Parameters<typeof SpaceTreeRow>[0]) => (
      <SpaceTreeRow {...rowProps} readOnly={readOnly} />
    ),
    [readOnly],
  );
  const disableDragDrop = useCallback(
    (n: SpaceTreeNode) => n.canEdit === false,
    [],
  );
  const getDragLabel = useCallback(
    (n: SpaceTreeNode) => n.name || t("untitled"),
    [t],
  );

  return (
    <div className={classes.treeStack}>
      {showPinnedOnly ? (
        <div className={classes.treeFill}>
          {isDataLoaded && pinnedRoots.length === 0 && (
            <Text size="xs" c="dimmed" py="xs" px="sm">
              {t("No pinned pages yet")}
            </Text>
          )}
          {pinnedRoots.length > 0 && (
            <PinnedPagesSection
              spaceId={spaceId}
              readOnly={readOnly}
              pages={pinnedRoots}
              openIds={openIds}
              selectedId={currentPage?.id}
              onToggle={handleToggle}
              showHeader={false}
            />
          )}
        </div>
      ) : (
        <div className={classes.treeFill}>
          {isDataLoaded && filteredData.length === 0 && (
            <Text size="xs" c="dimmed" py="xs" px="sm">
              {t("No pages yet")}
            </Text>
          )}
          {isDataLoaded && filteredData.length > 0 &&
            (layoutMode === "grid" ? (
              <SpaceGridView nodes={filteredData} />
            ) : (
              <DocTree<SpaceTreeNode>
                data={filteredData}
                openIds={openIds}
                selectedId={currentPage?.id}
                renderRow={renderRow}
                onMove={handleMove}
                onToggle={handleToggle}
                readOnly={readOnly}
                disableDrag={disableDragDrop}
                disableDrop={disableDragDrop}
                getDragLabel={getDragLabel}
                aria-label={t("Pages")}
              />
            ))}
        </div>
      )}
    </div>
  );
}
