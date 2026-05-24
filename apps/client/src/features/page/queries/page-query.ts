import {
  InfiniteData,
  QueryKey,
  useInfiniteQuery,
  UseInfiniteQueryResult,
  useMutation,
  useQuery,
  UseQueryResult,
  keepPreviousData,
} from "@tanstack/react-query";
import {
  createPage,
  deletePage,
  getPageById,
  getPageRenderedSegment,
  getSidebarPages,
  updatePage,
  movePage,
  getPageBreadcrumbs,
  getRecentChanges,
  getCreatedByPages,
  getAllSidebarPages,
  getDeletedPages,
  restorePage,
} from "@/features/page/services/page-service";
import {
  IMovePage,
  IPage,
  IPageInput,
  IPageRenderSegmentInput,
  IPageRenderedSegment,
  SidebarViewMode,
  SidebarPagesParams,
} from "@/features/page/types/page.types";
import { notifications } from "@mantine/notifications";
import { IPagination, QueryParams } from "@/lib/types.ts";
import { queryClient } from "@/query-client.ts";
import { buildTree } from "@/features/page/tree/utils";
import { useEffect } from "react";
import { validate as isValidUuid } from "uuid";
import { useTranslation } from "react-i18next";
import { useAtom } from "jotai";
import { treeDataAtom } from "@/features/page/tree/atoms/tree-data-atom";
import { treeModel } from "@/features/page/tree/model/tree-model";
import { SpaceTreeNode } from "@/features/page/tree/types";
import { useQueryEmit } from "@/features/websocket/use-query-emit";

type RootSidebarQueryParams = {
  spaceId: string;
  viewMode?: SidebarViewMode;
  categoryId?: string | null;
};

function normalizeRootSidebarQueryParams(
  data: RootSidebarQueryParams,
): Required<Pick<RootSidebarQueryParams, "spaceId" | "viewMode">> & {
  categoryId: string | null;
} {
  const viewMode = data.viewMode ?? "all";
  return {
    spaceId: data.spaceId,
    viewMode,
    categoryId: viewMode === "category" ? (data.categoryId ?? null) : null,
  };
}

export function buildRootSidebarQueryKey(
  data: RootSidebarQueryParams,
): QueryKey {
  return ["root-sidebar-pages", normalizeRootSidebarQueryParams(data)];
}

export function isRootSidebarQueryForSpace(
  queryKey: QueryKey,
  spaceId?: string,
): boolean {
  if (queryKey[0] !== "root-sidebar-pages") {
    return false;
  }

  if (!spaceId) {
    return true;
  }

  const params = queryKey[1] as RootSidebarQueryParams | undefined;
  return params?.spaceId === spaceId;
}

export function invalidateRootSidebarQueries(spaceId: string) {
  return queryClient.invalidateQueries({
    predicate: (query) => isRootSidebarQueryForSpace(query.queryKey, spaceId),
  });
}

function buildPageQueryKey(pageInput: Partial<IPageInput>): QueryKey {
  if (
    pageInput.includeContent === undefined &&
    pageInput.includeRendered === undefined &&
    pageInput.preferStaticReadonly === undefined &&
    pageInput.format === undefined
  ) {
    return ["pages", pageInput.pageId];
  }

  return [
    "pages",
    pageInput.pageId,
    {
      includeContent: pageInput.includeContent,
      includeRendered: pageInput.includeRendered,
      preferStaticReadonly: pageInput.preferStaticReadonly,
      format: pageInput.format,
    },
  ];
}

export function usePageQuery(
  pageInput: Partial<IPageInput>,
): UseQueryResult<IPage, Error> {
  const query = useQuery({
    queryKey: buildPageQueryKey(pageInput),
    queryFn: () => getPageById(pageInput),
    enabled: !!pageInput.pageId,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (query.data) {
      queryClient.setQueryData(["pages", query.data.id], (prev?: IPage) => ({
        ...prev,
        ...query.data,
      }));
      queryClient.setQueryData(
        ["pages", query.data.slugId],
        (prev?: IPage) => ({
          ...prev,
          ...query.data,
        }),
      );

      if (isValidUuid(pageInput.pageId)) {
        queryClient.setQueryData(
          buildPageQueryKey({ pageId: query.data.slugId }),
          (prev?: IPage) => ({
            ...prev,
            ...query.data,
          }),
        );
      } else {
        queryClient.setQueryData(
          buildPageQueryKey({ pageId: query.data.id }),
          (prev?: IPage) => ({
            ...prev,
            ...query.data,
          }),
        );
      }
    }
  }, [pageInput.pageId, query.data]);

  return query;
}

export function prefetchPage(pageInput: Partial<IPageInput>) {
  if (!pageInput.pageId) {
    return Promise.resolve(undefined);
  }

  return queryClient.prefetchQuery({
    queryKey: buildPageQueryKey(pageInput),
    queryFn: () => getPageById(pageInput),
    staleTime: 5 * 60 * 1000,
  });
}

export async function prefetchPageRenderedSegment(
  input: IPageRenderSegmentInput,
): Promise<IPageRenderedSegment> {
  return getPageRenderedSegment(input);
}

export function useCreatePageMutation() {
  const { t } = useTranslation();
  return useMutation<IPage, Error, Partial<IPage>>({
    mutationFn: (data) => createPage(data),
    onSuccess: (data, variables) => {
      const fallbackNodeType =
        variables.nodeType ?? (variables.parentPageId ? "file" : "folder");

      invalidateOnCreatePage({
        ...data,
        nodeType: data.nodeType ?? fallbackNodeType,
        isPinned: data.isPinned ?? false,
        pinnedAt: data.pinnedAt ?? null,
      });
    },
    onError: (error) => {
      notifications.show({ message: t("Failed to create page"), color: "red" });
    },
  });
}

/** Merge page fields into every react-query cache keyed by this page id or slugId. */
export function patchPageInQueryCache(
  page: Pick<IPage, "id" | "slugId"> & Partial<IPage>,
) {
  const merge = (old?: IPage) => (old ? { ...old, ...page } : old);

  queryClient.setQueriesData({ queryKey: ["pages", page.id] }, merge);
  queryClient.setQueriesData({ queryKey: ["pages", page.slugId] }, merge);
}

export function updatePageData(data: IPage) {
  patchPageInQueryCache(data);

  invalidateOnUpdatePage(
    data.spaceId,
    data.parentPageId,
    data.id,
    data.title,
    data.icon,
  );
}

export function useUpdateTitlePageMutation() {
  return useMutation<IPage, Error, Partial<IPageInput>>({
    mutationFn: (data) => updatePage(data),
  });
}

export function useUpdatePageMutation() {
  return useMutation<IPage, Error, Partial<IPageInput>>({
    mutationFn: (data) => updatePage(data),
    onSuccess: (data) => {
      updatePageData(data);
    },
  });
}

export function useRemovePageMutation() {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (pageId: string) => deletePage(pageId, false),
    onSuccess: (_, pageId) => {
      notifications.show({ message: t("Page moved to trash") });

      // Stamp deletedAt so a re-visit shows the trash banner, not stale state.
      const cached = queryClient.getQueryData<IPage>(["pages", pageId]);
      if (cached) {
        const stamped = { ...cached, deletedAt: new Date() };
        queryClient.setQueryData(["pages", cached.id], stamped);
        queryClient.setQueryData(["pages", cached.slugId], stamped);
      }

      invalidateOnDeletePage(pageId);
      queryClient.invalidateQueries({
        predicate: (item) =>
          ["trash-list"].includes(item.queryKey[0] as string),
      });
    },
    onError: (error) => {
      notifications.show({ message: t("Failed to delete page"), color: "red" });
    },
  });
}

export function useDeletePageMutation() {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (pageId: string) => deletePage(pageId, true),
    onSuccess: (data, pageId) => {
      notifications.show({ message: t("Page deleted successfully") });
      invalidateOnDeletePage(pageId);

      // Invalidate to refresh trash lists
      queryClient.invalidateQueries({
        predicate: (item) =>
          ["trash-list"].includes(item.queryKey[0] as string),
      });
    },
    onError: (error) => {
      const message =
        error["response"]?.data?.message || t("Failed to delete page");
      notifications.show({ message, color: "red" });
    },
  });
}

export function useMovePageMutation() {
  return useMutation<void, Error, IMovePage>({
    mutationFn: (data) => movePage(data),
  });
}

export function useRestorePageMutation() {
  const { t } = useTranslation();
  const [treeData, setTreeData] = useAtom(treeDataAtom);
  const emit = useQueryEmit();

  return useMutation({
    mutationFn: (pageId: string) => restorePage(pageId),
    onSuccess: async (restoredPage) => {
      notifications.show({ message: t("Page restored successfully") });

      // Check if the page already exists in the tree (it shouldn't)
      if (!treeModel.find(treeData, restoredPage.id)) {
        // Create the tree node data with hasChildren from backend
        const nodeData: SpaceTreeNode = {
          id: restoredPage.id,
          slugId: restoredPage.slugId,
          name: restoredPage.title || "Untitled",
          icon: restoredPage.icon,
          position: restoredPage.position,
          spaceId: restoredPage.spaceId,
          parentPageId: restoredPage.parentPageId,
          hasChildren: restoredPage.hasChildren || false,
          nodeType:
            restoredPage.nodeType ??
            (restoredPage.parentPageId ? "file" : "folder"),
          isPinned: restoredPage.isPinned ?? false,
          pinnedAt: restoredPage.pinnedAt ?? null,
          children: [],
        };

        // Determine the parent and index
        const parentId = restoredPage.parentPageId || null;
        let index = 0;

        if (parentId) {
          const parentNode = treeModel.find(treeData, parentId);
          if (parentNode) {
            index = parentNode.children?.length || 0;
          }
        } else {
          // Root level page
          index = treeData.length;
        }

        // Add the node to the tree
        setTreeData(treeModel.insert(treeData, parentId, nodeData, index));

        // Emit websocket event to sync with other users
        setTimeout(() => {
          emit({
            operation: "addTreeNode",
            spaceId: restoredPage.spaceId,
            payload: {
              parentId,
              index,
              data: nodeData,
            },
          });
        }, 50);
      }

      //  await queryClient.invalidateQueries({ queryKey: ["sidebar-pages", restoredPage.spaceId] });

      // Also invalidate deleted pages query to refresh the trash list
      await queryClient.invalidateQueries({
        queryKey: ["trash-list", restoredPage.spaceId],
      });

      // Merge — restore endpoint returns a skinny page;
      // Replace would strip space/permissions/content and break the editor.
      const merge = (cached: IPage | undefined) =>
        cached ? { ...cached, ...restoredPage } : cached;
      queryClient.setQueryData<IPage>(["pages", restoredPage.id], merge);
      queryClient.setQueryData<IPage>(["pages", restoredPage.slugId], merge);
    },
    onError: (error) => {
      notifications.show({ message: t("Failed to restore page"), color: "red" });
    },
  });
}

export function useGetSidebarPagesQuery(
  data: SidebarPagesParams | null,
): UseInfiniteQueryResult<InfiniteData<IPagination<IPage>, unknown>> {
  return useInfiniteQuery({
    queryKey: ["sidebar-pages", data],
    enabled: !!data?.pageId || !!data?.spaceId,
    queryFn: ({ pageParam }) =>
      getSidebarPages({ ...data, cursor: pageParam, limit: 100 }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.meta?.nextCursor ?? undefined,
  });
}

export function useGetRootSidebarPagesQuery(data: SidebarPagesParams) {
  const queryKey = buildRootSidebarQueryKey({
    spaceId: data.spaceId!,
    viewMode: data.viewMode,
    categoryId: data.categoryId,
  });

  return useInfiniteQuery({
    queryKey,
    enabled: Boolean(data.spaceId),
    queryFn: async ({ pageParam }) => {
      return getSidebarPages({
        spaceId: data.spaceId,
        cursor: pageParam,
        limit: data.limit ?? 100,
        viewMode: data.viewMode,
        categoryId: data.categoryId,
      });
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.meta?.nextCursor ?? undefined,
  });
}

export function usePageBreadcrumbsQuery(
  pageId: string,
): UseQueryResult<Partial<IPage[]>, Error> {
  return useQuery({
    queryKey: ["breadcrumbs", pageId],
    queryFn: () => getPageBreadcrumbs(pageId),
    enabled: !!pageId,
  });
}

export async function fetchAllAncestorChildren(params: SidebarPagesParams) {
  // not using a hook here, so we can call it inside a useEffect hook
  const response = await queryClient.fetchQuery({
    queryKey: ["sidebar-pages", params],
    queryFn: () => getAllSidebarPages(params),
    staleTime: 30 * 60 * 1000,
  });

  const allItems = response.pages.flatMap((page) => page.items);
  return buildTree(allItems);
}

export function useRecentChangesQuery(spaceId?: string) {
  return useInfiniteQuery({
    queryKey: ["recent-changes", spaceId],
    queryFn: ({ pageParam }) =>
      getRecentChanges({ spaceId, cursor: pageParam, limit: 15 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasNextPage ? lastPage.meta.nextCursor : undefined,
    refetchOnMount: true,
  });
}

export function useCreatedByQuery(params?: {
  userId?: string;
  spaceId?: string;
}) {
  const { userId, spaceId } = params ?? {};
  return useInfiniteQuery({
    queryKey: ["pages-created-by-user", { userId, spaceId }],
    queryFn: ({ pageParam }) =>
      getCreatedByPages({ userId, spaceId, cursor: pageParam, limit: 15 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasNextPage ? lastPage.meta.nextCursor : undefined,
    refetchOnMount: true,
  });
}

export function useDeletedPagesQuery(
  spaceId: string,
  params?: QueryParams,
): UseQueryResult<IPagination<IPage>, Error> {
  return useQuery({
    queryKey: ["trash-list", spaceId, params],
    queryFn: () => getDeletedPages(spaceId, params),
    enabled: !!spaceId,
    placeholderData: keepPreviousData,
    refetchOnMount: true,
    staleTime: 0,
  });
}

export function invalidateOnCreatePage(data: Partial<IPage>) {
  if (!data.spaceId) {
    return;
  }

  const newPage: Partial<IPage> = {
    creatorId: data.creatorId,
    hasChildren: data.hasChildren,
    icon: data.icon,
    id: data.id,
    isPinned: data.isPinned,
    nodeType: data.nodeType,
    parentPageId: data.parentPageId,
    pinnedAt: data.pinnedAt,
    position: data.position,
    sidebarCategoryId: data.sidebarCategoryId ?? null,
    slugId: data.slugId,
    spaceId: data.spaceId,
    title: data.title,
  };

  const isRootNode = data.parentPageId == null;

  let queryKey: QueryKey = null;
  if (isRootNode) {
    invalidateRootSidebarQueries(data.spaceId);
  } else {
    queryKey = [
      "sidebar-pages",
      { pageId: data.parentPageId, spaceId: data.spaceId },
    ];
  }

  if (!isRootNode) {
    queryClient.setQueryData<InfiniteData<IPagination<Partial<IPage>>>>(
      queryKey,
      (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page, index) => {
            if (index === old.pages.length - 1) {
              return {
                ...page,
                items: [...page.items, newPage],
              };
            }
            return page;
          }),
        };
      },
    );
  }

  //update sidebar haschildren
  if (!isRootNode) {
    //update sub sidebar pages haschildern
    const subSideBarMatches = queryClient.getQueriesData({
      queryKey: ["sidebar-pages"],
      exact: false,
    });

    subSideBarMatches.forEach(([key, d]) => {
      queryClient.setQueryData<InfiniteData<IPagination<IPage>>>(key, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.map((sidebarPage: IPage) =>
              sidebarPage.id === data.parentPageId
                ? { ...sidebarPage, hasChildren: true }
                : sidebarPage,
            ),
          })),
        };
      });
    });

    //update root sidebar pages haschildern
    const rootSideBarMatches = queryClient.getQueriesData({
      predicate: (query) =>
        isRootSidebarQueryForSpace(query.queryKey, data.spaceId),
    });

    rootSideBarMatches.forEach(([key, d]) => {
      queryClient.setQueryData<InfiniteData<IPagination<IPage>>>(key, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.map((sidebarPage: IPage) =>
              sidebarPage.id === data.parentPageId
                ? { ...sidebarPage, hasChildren: true }
                : sidebarPage,
            ),
          })),
        };
      });
    });
  }

  //update recent changes
  queryClient.invalidateQueries({
    queryKey: ["recent-changes", data.spaceId],
  });
}

export function invalidateOnUpdatePage(
  spaceId: string,
  parentPageId: string | null,
  id: string,
  title: string,
  icon: string,
) {
  const updateCachedPages = (queryKey: QueryKey) => {
    queryClient.setQueryData<InfiniteData<IPagination<IPage>>>(
      queryKey,
      (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.map((sidebarPage: IPage) =>
              sidebarPage.id === id
                ? { ...sidebarPage, title: title, icon: icon }
                : sidebarPage,
            ),
          })),
        };
      },
    );
  };

  if (parentPageId === null) {
    const rootSideBarMatches = queryClient.getQueriesData({
      predicate: (query) => isRootSidebarQueryForSpace(query.queryKey, spaceId),
    });

    rootSideBarMatches.forEach(([key]) => updateCachedPages(key));
  } else {
    updateCachedPages(["sidebar-pages", { pageId: parentPageId, spaceId }]);
  }

  //update recent changes
  queryClient.invalidateQueries({
    queryKey: ["recent-changes", spaceId],
  });
}

export function updateCacheOnMovePage(
  spaceId: string,
  pageId: string,
  oldParentId: string | null,
  newParentId: string | null,
  pageData: Partial<IPage>,
) {
  const involvesRoot = oldParentId === null || newParentId === null;

  if (involvesRoot) {
    invalidateRootSidebarQueries(spaceId);
  }

  // Remove page from old parent's cache
  if (oldParentId !== null) {
    const oldQueryKey = ["sidebar-pages", { pageId: oldParentId, spaceId }];

    queryClient.setQueryData<InfiniteData<IPagination<IPage>>>(
      oldQueryKey,
      (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.filter((item) => item.id !== pageId),
          })),
        };
      },
    );
  }

  // Update old parent's hasChildren flag if it has no more children
  if (oldParentId !== null) {
    const oldParentCache = queryClient.getQueryData<
      InfiniteData<IPagination<IPage>>
    >(["sidebar-pages", { pageId: oldParentId, spaceId }]);

    const remainingChildren =
      oldParentCache?.pages.flatMap((p) => p.items).length ?? 0;

    if (remainingChildren === 0) {
      // Update hasChildren in all caches where old parent appears
      const allSideBarMatches = queryClient.getQueriesData({
        predicate: (query) =>
          isRootSidebarQueryForSpace(query.queryKey) ||
          query.queryKey[0] === "sidebar-pages",
      });

      allSideBarMatches.forEach(([key]) => {
        queryClient.setQueryData<InfiniteData<IPagination<IPage>>>(
          key,
          (old) => {
            if (!old) return old;
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                items: page.items.map((item) =>
                  item.id === oldParentId
                    ? { ...item, hasChildren: false }
                    : item,
                ),
              })),
            };
          },
        );
      });
    }
  }

  // Add page to new parent's cache
  if (newParentId !== null) {
    const newQueryKey = ["sidebar-pages", { pageId: newParentId, spaceId }];

    queryClient.setQueryData<InfiniteData<IPagination<Partial<IPage>>>>(
      newQueryKey,
      (old) => {
        if (!old) return old;

        // Check if page already exists in new location
        const exists = old.pages.some((page) =>
          page.items.some((item) => item.id === pageId),
        );
        if (exists) return old;

        return {
          ...old,
          pages: old.pages.map((page, index) => {
            if (index === old.pages.length - 1) {
              return {
                ...page,
                items: [...page.items, pageData],
              };
            }
            return page;
          }),
        };
      },
    );
  }

  // Update new parent's hasChildren flag
  if (newParentId !== null) {
    const allSideBarMatches = queryClient.getQueriesData({
      predicate: (query) =>
        isRootSidebarQueryForSpace(query.queryKey) ||
        query.queryKey[0] === "sidebar-pages",
    });

    allSideBarMatches.forEach(([key]) => {
      queryClient.setQueryData<InfiniteData<IPagination<IPage>>>(key, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.map((item) =>
              item.id === newParentId ? { ...item, hasChildren: true } : item,
            ),
          })),
        };
      });
    });
  }
}

export function invalidateOnDeletePage(pageId: string) {
  //update all sidebar pages
  const allSideBarMatches = queryClient.getQueriesData({
    predicate: (query) =>
      isRootSidebarQueryForSpace(query.queryKey) ||
      query.queryKey[0] === "sidebar-pages",
  });

  allSideBarMatches.forEach(([key, d]) => {
    queryClient.setQueryData<InfiniteData<IPagination<IPage>>>(key, (old) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          items: page.items.filter(
            (sidebarPage: IPage) => sidebarPage.id !== pageId,
          ),
        })),
      };
    });
  });

  //update recent changes
  queryClient.invalidateQueries({
    queryKey: ["recent-changes"],
  });
}
