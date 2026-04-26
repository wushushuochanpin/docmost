import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { notifications } from "@mantine/notifications";
import { useSetAtom } from "jotai";
import { queryClient } from "@/query-client.ts";
import { extractPageSlugId } from "@/lib";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import {
  getPageById,
  movePage,
  movePageToSpace,
} from "@/features/page/services/page-service.ts";
import { searchSuggestions } from "@/features/search/services/search-service.ts";
import { IPage } from "@/features/page/types/page.types.ts";
import { SpaceTreeNode } from "@/features/page/tree/types.ts";
import { treeDataAtom } from "@/features/page/tree/atoms/tree-data-atom.ts";
import {
  getRecentPages,
  RecentPageEntry,
  removeRecentPage,
} from "@/features/page/hooks/use-recent-pages.ts";

export type MoveToPhase =
  | "idle"
  | "searching"
  | "url_parsing"
  | "selected"
  | "cross_space"
  | "moving"
  | "done";

export interface MoveTargetPage {
  id: string;
  slugId: string;
  title: string;
  icon?: string | null;
  nodeType: "file" | "folder";
  spaceId: string;
  spaceName: string;
  spaceSlug: string;
  parentPath: string;
  canEdit: boolean;
}

interface UseMoveToOptions {
  open: boolean;
  pageId: string;
  pageTitle: string;
  pageSlugId: string;
  pageNodeType: "file" | "folder";
  currentSpaceId: string;
  recentScopeId?: string | null;
  treeData: SpaceTreeNode[];
  onClose: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

function collectDescendantIds(
  nodes: SpaceTreeNode[],
  pageId: string,
): string[] {
  const descendants: string[] = [];

  const collect = (node: SpaceTreeNode) => {
    node.children?.forEach((child) => {
      descendants.push(child.id);
      collect(child);
    });
  };

  const visit = (items: SpaceTreeNode[]): boolean => {
    for (const item of items) {
      if (item.id === pageId) {
        collect(item);
        return true;
      }
      if (visit(item.children ?? [])) {
        return true;
      }
    }
    return false;
  };

  visit(nodes);
  return descendants;
}

function looksLikeUrl(value: string) {
  return (
    /^https?:\/\//i.test(value) ||
    value.startsWith("/") ||
    value.includes("/p/")
  );
}

function extractPageSlugFromUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed || !looksLikeUrl(trimmed)) {
    return null;
  }

  try {
    const url = new URL(trimmed, window.location.origin);
    const segments = url.pathname.split("/").filter(Boolean);
    const pageSegmentIndex = segments.findIndex((segment) => segment === "p");
    const pageSlug =
      pageSegmentIndex >= 0 ? segments[pageSegmentIndex + 1] : null;
    return pageSlug ? extractPageSlugId(decodeURIComponent(pageSlug)) : null;
  } catch {
    return null;
  }
}

function pageToMoveTarget(page: IPage): MoveTargetPage {
  const spaceName = page.space?.name || page.spaceId;
  return {
    id: page.id,
    slugId: page.slugId,
    title: page.title || "Untitled",
    icon: page.icon,
    nodeType: page.nodeType === "folder" ? "folder" : "file",
    spaceId: page.spaceId,
    spaceName,
    spaceSlug: page.space?.slug || "",
    parentPath: spaceName,
    canEdit: page.permissions?.canEdit ?? page.canEdit ?? true,
  };
}

function recentEntryToTarget(entry: RecentPageEntry): MoveTargetPage {
  return {
    id: entry.pageId,
    slugId: entry.slugId,
    title: entry.title || "Untitled",
    icon: entry.icon,
    nodeType: entry.nodeType === "folder" ? "folder" : "file",
    spaceId: entry.spaceId,
    spaceName: entry.spaceName || entry.spaceId,
    spaceSlug: entry.spaceSlug,
    parentPath: entry.spaceName || entry.spaceId,
    canEdit: true,
  };
}

export function useMoveTo(options: UseMoveToOptions) {
  const {
    open,
    pageId,
    pageTitle,
    pageSlugId,
    pageNodeType,
    currentSpaceId,
    recentScopeId,
    treeData,
    onClose,
    t,
  } = options;
  const navigate = useNavigate();
  const setTreeData = useSetAtom(treeDataAtom);
  const requestIdRef = useRef(0);
  const [phase, setPhase] = useState<MoveToPhase>("idle");
  const [query, setQuery] = useState("");
  const [targetPage, setTargetPage] = useState<MoveTargetPage | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<MoveTargetPage[]>([]);
  const [recentPages, setRecentPages] = useState<MoveTargetPage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const descendantIds = useMemo(
    () => collectDescendantIds(treeData, pageId),
    [pageId, treeData],
  );
  const descendantIdSet = useMemo(
    () => new Set(descendantIds),
    [descendantIds],
  );
  const isLoading =
    phase === "searching" || phase === "url_parsing" || phase === "moving";

  const hydratePage = useCallback(async (idOrSlug: string) => {
    const page = await getPageById({
      pageId: idOrSlug,
      includeContent: false,
      includeSpace: true,
    });
    return pageToMoveTarget(page);
  }, []);

  useEffect(() => {
    if (!open) {
      setPhase("idle");
      setQuery("");
      setTargetPage(null);
      setUrlError(null);
      setSearchResults([]);
      setRecentPages([]);
      setError(null);
      return;
    }

    const entries = getRecentPages(recentScopeId, pageId, descendantIds);
    setRecentPages(entries.map(recentEntryToTarget));
  }, [descendantIds, open, pageId, recentScopeId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const trimmed = query.trim();
    const currentRequestId = ++requestIdRef.current;
    setUrlError(null);
    setError(null);

    if (!trimmed) {
      setSearchResults([]);
      setTargetPage(null);
      setPhase("idle");
      return;
    }

    const slugFromUrl = extractPageSlugFromUrl(trimmed);
    if (slugFromUrl) {
      setPhase("url_parsing");
      hydratePage(slugFromUrl)
        .then((target) => {
          if (requestIdRef.current !== currentRequestId) return;
          setTargetPage(target);
          setSearchResults([]);
          setPhase("selected");
        })
        .catch(() => {
          if (requestIdRef.current !== currentRequestId) return;
          setUrlError(t("Page not found"));
          setTargetPage(null);
          setPhase("idle");
        });
      return;
    }

    if (looksLikeUrl(trimmed)) {
      setUrlError(t("Invalid page URL"));
      setSearchResults([]);
      setTargetPage(null);
      setPhase("idle");
      return;
    }

    const timeout = window.setTimeout(() => {
      setPhase("searching");
      searchSuggestions({ query: trimmed, includePages: true, limit: 8 })
        .then(async (result) => {
          const pages = result.pages ?? [];
          const hydrated = await Promise.allSettled(
            pages
              .filter((page) => page?.slugId || page?.id)
              .map((page) => hydratePage(page.slugId || page.id)),
          );
          if (requestIdRef.current !== currentRequestId) return;
          setSearchResults(
            hydrated
              .filter(
                (item): item is PromiseFulfilledResult<MoveTargetPage> =>
                  item.status === "fulfilled",
              )
              .map((item) => item.value),
          );
          setPhase("idle");
        })
        .catch(() => {
          if (requestIdRef.current !== currentRequestId) return;
          setError(t("Failed to search pages"));
          setSearchResults([]);
          setPhase("idle");
        });
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [hydratePage, open, query, t]);

  const getDisabledReason = useCallback(
    (page: MoveTargetPage) => {
      if (page.id === pageId) {
        return t("Cannot move a page to itself");
      }

      if (descendantIdSet.has(page.id)) {
        return t("Cannot move a page into its own child");
      }

      if (pageNodeType === "folder" && page.nodeType !== "folder") {
        return t("Folders can only be placed inside folders");
      }

      if (page.canEdit === false) {
        return t("No access to this location");
      }

      return null;
    },
    [descendantIdSet, pageId, pageNodeType, t],
  );

  const selectTarget = useCallback(
    (page: MoveTargetPage) => {
      if (getDisabledReason(page)) {
        return;
      }

      setTargetPage((current) => (current?.id === page.id ? null : page));
      setPhase("selected");
    },
    [getDisabledReason],
  );

  const resetSelection = useCallback(() => {
    setTargetPage(null);
    setPhase("idle");
  }, []);

  const backToSelected = useCallback(() => {
    setPhase("selected");
  }, []);

  const refreshMovedPageState = useCallback(() => {
    queryClient.removeQueries({
      predicate: (item) =>
        ["pages", "sidebar-pages", "root-sidebar-pages"].includes(
          item.queryKey[0] as string,
        ),
    });
    setTreeData([]);
  }, [setTreeData]);

  const closeAndReset = useCallback(() => {
    onClose();
    setPhase("done");
    setQuery("");
    setTargetPage(null);
  }, [onClose]);

  const submitMove = useCallback(async () => {
    if (!targetPage || getDisabledReason(targetPage)) {
      return;
    }

    if (targetPage.spaceId !== currentSpaceId && phase !== "cross_space") {
      setPhase("cross_space");
      return;
    }

    setPhase("moving");
    let movedToTargetSpace = false;
    try {
      if (targetPage.spaceId !== currentSpaceId) {
        await movePageToSpace({ pageId, spaceId: targetPage.spaceId });
        movedToTargetSpace = true;
      }

      await movePage({
        pageId,
        parentPageId: targetPage.id,
        position: null,
      });

      refreshMovedPageState();
      notifications.show({ message: t("Page moved successfully") });

      if (targetPage.spaceId !== currentSpaceId) {
        navigate(buildPageUrl(targetPage.spaceSlug, pageSlugId, pageTitle));
      }

      closeAndReset();
    } catch (err) {
      const message = err.response?.data?.message || t("Failed to move page");
      refreshMovedPageState();

      if (movedToTargetSpace) {
        notifications.show({
          message: t(
            "Moved to space but failed to set location. Page is now at root of {{spaceName}}.",
            {
              spaceName: targetPage.spaceName,
            },
          ),
          color: "red",
        });
        navigate(buildPageUrl(targetPage.spaceSlug, pageSlugId, pageTitle));
        closeAndReset();
        return;
      }

      if (
        message === "Target parent page not found" ||
        message === "Page not found"
      ) {
        removeRecentPage(recentScopeId, targetPage.id);
      }

      notifications.show({ message, color: "red" });
      setPhase("selected");
    }
  }, [
    closeAndReset,
    currentSpaceId,
    getDisabledReason,
    navigate,
    pageId,
    pageSlugId,
    pageTitle,
    phase,
    recentScopeId,
    refreshMovedPageState,
    t,
    targetPage,
  ]);

  return {
    phase,
    query,
    setQuery,
    targetPage,
    urlError,
    searchResults,
    recentPages,
    isLoading,
    error,
    isCrossSpace: Boolean(targetPage && targetPage.spaceId !== currentSpaceId),
    getDisabledReason,
    selectTarget,
    resetSelection,
    backToSelected,
    submitMove,
  };
}
