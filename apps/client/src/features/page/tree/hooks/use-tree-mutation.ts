import { useCallback, useRef } from "react";
import { useAtom, useAtomValue, useStore } from "jotai";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { isAxiosError } from "axios";
import { getDefaultStore } from "jotai";

import { treeDataAtom } from "@/features/page/tree/atoms/tree-data-atom.ts";
import { treeModel } from "@/features/page/tree/model/tree-model";
import type { DropOp } from "@/features/page/tree/model/tree-model.types";
import { dropOpToMovePayload } from "./drop-op-to-move-payload";
import { SpaceTreeNode } from "@/features/page/tree/types.ts";
import { IPage, SidebarViewMode } from "@/features/page/types/page.types.ts";
import {
  invalidateRootSidebarQueries,
  useCreatePageMutation,
  useRemovePageMutation,
  useMovePageMutation,
  useUpdatePageMutation,
  updateCacheOnMovePage,
  updatePageData,
} from "@/features/page/queries/page-query.ts";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { getSpaceUrl } from "@/lib/config.ts";
import { useQueryEmit } from "@/features/websocket/use-query-emit.ts";
import {
  assignSidebarCategory,
  pinPage,
} from "@/features/page/services/page-service.ts";
import {
  pageEditorEditSessionAtom,
  pageEditorSessionStatusAtom,
} from "@/features/editor/atoms/editor-atoms.ts";
import { currentRoutePageAtom } from "@/features/page/atoms/current-route-page-atom.ts";
import { isEditorSessionEnabled } from "@/lib/config";
import localEmitter from "@/lib/local-emitter.ts";

type TreeMutationOptions = {
  rootViewMode?: SidebarViewMode;
  rootCategoryId?: string | null;
};

export type UseTreeMutation = {
  handleMove: (sourceId: string, op: DropOp) => Promise<void>;
  handleCreate: (parentId: string | null) => Promise<void>;
  handleRename: (id: string, name: string) => void;
  handleDelete: (id: string) => Promise<void>;
};

export function useTreeMutation(
  spaceId: string,
  options?: TreeMutationOptions,
): UseTreeMutation {
  const { t } = useTranslation();
  const [, setData] = useAtom(treeDataAtom);
  // `store` reads the *current* treeDataAtom imperatively in handlers — avoids
  // stale-closure issues when the caller updates the tree (e.g. lazy-load
  // children) and then immediately invokes a handler.
  const store = useStore();
  const createPageMutation = useCreatePageMutation();
  const updatePageMutation = useUpdatePageMutation();
  const removePageMutation = useRemovePageMutation();
  const movePageMutation = useMovePageMutation();
  const navigate = useNavigate();
  const { spaceSlug, pageSlug } = useParams();
  const emit = useQueryEmit();
  const pendingFolderNavigationRef = useRef<Record<string, string>>({});
  const editSession = useAtomValue(pageEditorEditSessionAtom);
  const editorSessionStatus = useAtomValue(pageEditorSessionStatusAtom);
  const currentRoutePage = useAtomValue(currentRoutePageAtom);

  const handleMove = useCallback(
    async (sourceId: string, op: DropOp) => {
      const before = store.get(treeDataAtom);
      const { tree: after, result } = treeModel.move(before, sourceId, op);
      if (after === before) return;

      const payload = dropOpToMovePayload(before, sourceId, op);
      const source = treeModel.find(before, sourceId) as SpaceTreeNode | null;
      if (!source) return;
      const oldParentId = source.parentPageId ?? null;

      // optimistic apply with the new position from the payload
      let optimistic = treeModel.update(after, sourceId, {
        position: payload.position,
        parentPageId: payload.parentPageId,
      } as Partial<SpaceTreeNode>);

      // If the old parent has no children left, mark hasChildren: false so the
      // chevron disappears.
      if (oldParentId) {
        const oldParent = treeModel.find(optimistic, oldParentId);
        if (!oldParent?.children?.length) {
          optimistic = treeModel.update(optimistic, oldParentId, {
            hasChildren: false,
          } as Partial<SpaceTreeNode>);
        }
      }

      // For make-child onto a previously-childless target: flip hasChildren on.
      if (op.kind === "make-child") {
        optimistic = treeModel.update(optimistic, op.targetId, {
          hasChildren: true,
        } as Partial<SpaceTreeNode>);
      }

      setData(optimistic);

      try {
        await movePageMutation.mutateAsync(payload);
      } catch {
        setData(before);
        notifications.show({
          message: t("Failed to move page"),
          color: "red",
        });
        return;
      }

      const pageData: Partial<IPage> = {
        id: source.id,
        slugId: source.slugId,
        title: source.name,
        icon: source.icon,
        position: payload.position,
        spaceId: source.spaceId,
        parentPageId: payload.parentPageId,
        hasChildren: source.hasChildren,
      };

      updateCacheOnMovePage(
        spaceId,
        sourceId,
        oldParentId,
        payload.parentPageId,
        pageData,
      );

      if (oldParentId === null || payload.parentPageId === null) {
        invalidateRootSidebarQueries(spaceId);
      }

      setTimeout(() => {
        emit({
          operation: "moveTreeNode",
          spaceId: spaceId,
          payload: {
            id: sourceId,
            parentId: payload.parentPageId,
            oldParentId,
            index: result.index,
            position: payload.position,
            pageData,
          },
        });
      }, 50);
    },
    [setData, store, movePageMutation, spaceId, emit, t],
  );

  const handleCreate = useCallback(
    async (parentId: string | null) => {
      const payload: { spaceId: string; parentPageId?: string } = { spaceId };
      if (parentId) payload.parentPageId = parentId;

      let createdPage: IPage;
      try {
        createdPage = await createPageMutation.mutateAsync(payload);

        // Auto-pin if creating at root in pinned view mode
        if (parentId === null && options?.rootViewMode === "pinned") {
          const pinResult = await pinPage(createdPage.id);
          createdPage = {
            ...createdPage,
            isPinned: pinResult.isPinned,
            pinnedAt: pinResult.pinnedAt,
          };
        }

        // Auto-assign category if creating at root in category view mode
        if (
          parentId === null &&
          options?.rootViewMode === "category" &&
          options.rootCategoryId
        ) {
          const categoryResult = await assignSidebarCategory({
            pageId: createdPage.id,
            categoryId: options.rootCategoryId,
          });
          createdPage = {
            ...createdPage,
            sidebarCategoryId: categoryResult.sidebarCategoryId,
          };
        }
      } catch {
        throw new Error("Failed to create page");
      }

      const newNode: SpaceTreeNode = {
        id: createdPage.id,
        slugId: createdPage.slugId,
        name: "",
        position: createdPage.position,
        spaceId: createdPage.spaceId,
        parentPageId: createdPage.parentPageId,
        hasChildren: false,
        isPinned: createdPage.isPinned ?? false,
        pinnedAt: createdPage.pinnedAt ?? null,
        sidebarCategoryId: createdPage.sidebarCategoryId ?? null,
        children: [],
      };

      // Read latest tree at call time to avoid stale closure.
      const current = store.get(treeDataAtom);
      let lastIndex: number;
      if (parentId === null) {
        lastIndex = current.length;
      } else {
        const parent = treeModel.find(current, parentId);
        lastIndex = parent?.children?.length ?? 0;
      }

      setData((prev) => treeModel.insert(prev, parentId, newNode, lastIndex));

      setTimeout(() => {
        emit({
          operation: "addTreeNode",
          spaceId,
          payload: {
            parentId,
            index: lastIndex,
            data: newNode,
          },
        });
      }, 50);

      const pageUrl = buildPageUrl(
        spaceSlug,
        createdPage.slugId,
        createdPage.title,
      );
      navigate(pageUrl);
      if (!parentId) {
        // Track root-level pages so onRename can update URL after user sets a name.
        pendingFolderNavigationRef.current[createdPage.id] = createdPage.slugId;
      }
    },
    [spaceId, options, createPageMutation, setData, store, emit, navigate, spaceSlug],
  );

  const handleRename = useCallback(
    (id: string, name: string) => {
      const isCurrentRoutePage = currentRoutePage?.id === id;
      const hasActiveEditorSession =
        Boolean(editSession) &&
        (!isEditorSessionEnabled() || editorSessionStatus === "active");
      const sessionForRename =
        isCurrentRoutePage && hasActiveEditorSession ? editSession : undefined;

      if (isEditorSessionEnabled() && !sessionForRename) {
        notifications.show({
          color: "yellow",
          message: isCurrentRoutePage
            ? t(
                "Wait for this page to finish loading editing before renaming it in the sidebar.",
              )
            : t(
                "Open this page and wait for editing to start before renaming it in the sidebar.",
              ),
        });
        return;
      }

      setData((prev) =>
        treeModel.update(prev, id, { name } as Partial<SpaceTreeNode>),
      );

      updatePageMutation
        .mutateAsync({
          pageId: id,
          title: name,
          editSession: sessionForRename,
          writeIntent: "normal",
        })
        .then((page) => {
          updatePageData(page);

          const updateEvent = {
            operation: "updateOne" as const,
            spaceId: page.spaceId,
            entity: ["pages"] as ["pages"],
            id: page.id,
            payload: {
              title: page.title,
              slugId: page.slugId,
              parentPageId: page.parentPageId,
              icon: page.icon,
            },
          };
          localEmitter.emit("message", updateEvent);
          emit(updateEvent);

          if (isCurrentRoutePage) {
            getDefaultStore().set(currentRoutePageAtom as any, page);
            if (spaceSlug) {
              navigate(buildPageUrl(spaceSlug, page.slugId, page.title), {
                replace: true,
              });
            }
          }

          const createdFolderSlugId = pendingFolderNavigationRef.current[id];
          if (!createdFolderSlugId) return;
          delete pendingFolderNavigationRef.current[id];
          navigate(buildPageUrl(spaceSlug, createdFolderSlugId, name));
        })
        .catch((error) => {
          const message = isAxiosError(error)
            ? error.response?.data?.message
            : undefined;
          notifications.show({
            color: "red",
            message:
              message ||
              t("Failed to save page title. Please try again in a moment."),
          });
          console.error("Error updating page title:", error);
        });
    },
    [
      currentRoutePage,
      editSession,
      editorSessionStatus,
      updatePageMutation,
      setData,
      emit,
      navigate,
      spaceSlug,
      t,
    ],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const node = treeModel.find(
        store.get(treeDataAtom),
        id,
      ) as SpaceTreeNode | null;
      const parentPageId = node?.parentPageId ?? null;
      try {
        await removePageMutation.mutateAsync(id);
        setData((prev) => {
          let next = treeModel.remove(prev, id);
          if (parentPageId) {
            const parent = treeModel.find(next, parentPageId);
            if (!parent?.children?.length) {
              next = treeModel.update(next, parentPageId, {
                hasChildren: false,
              } as Partial<SpaceTreeNode>);
            }
          }
          return next;
        });

        if (
          node &&
          pageSlug &&
          (node.slugId === pageSlug.split("-")[1] ||
            isPageInNode(node, pageSlug.split("-")[1]))
        ) {
          navigate(getSpaceUrl(spaceSlug));
        }

        setTimeout(() => {
          if (!node) return;
          emit({
            operation: "deleteTreeNode",
            spaceId,
            payload: { node },
          });
        }, 50);
      } catch (error) {
        console.error("Failed to delete page:", error);
      }
    },
    [removePageMutation, setData, store, pageSlug, navigate, spaceSlug, emit, spaceId],
  );

  return { handleMove, handleCreate, handleRename, handleDelete };
}

function isPageInNode(node: SpaceTreeNode, pageSlug: string): boolean {
  if (node.slugId === pageSlug) return true;
  if (!node.children) return false;
  for (const child of node.children) {
    if (isPageInNode(child, pageSlug)) return true;
  }
  return false;
}
