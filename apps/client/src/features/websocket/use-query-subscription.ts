import React from "react";
import { socketAtom } from "@/features/websocket/atoms/socket-atom.ts";
import { useAtom } from "jotai";
import { InfiniteData, useQueryClient } from "@tanstack/react-query";
import { WebSocketEvent } from "@/features/websocket/types";
import { IPagination } from "@/lib/types";
import {
  invalidateRootSidebarQueries,
  invalidateOnCreatePage,
  invalidateOnDeletePage,
  updateCacheOnMovePage,
  invalidateOnUpdatePage,
  patchPageInQueryCache,
} from "../page/queries/page-query";
import { RQ_KEY } from "../comment/queries/comment-query";
import { IComment } from "@/features/comment/types/comment.types";

export const useQuerySubscription = () => {
  const queryClient = useQueryClient();
  const [socket] = useAtom(socketAtom);

  React.useEffect(() => {
    const updateInfiniteComments = (
      pageId: string,
      updater: (comment: IComment) => IComment | null,
    ) => {
      const cache = queryClient.getQueryData(RQ_KEY(pageId)) as
        | InfiniteData<IPagination<IComment>>
        | undefined;

      if (!cache) {
        return false;
      }

      queryClient.setQueryData(RQ_KEY(pageId), {
        ...cache,
        pages: cache.pages.map((page) => ({
          ...page,
          items: page.items
            .map((comment) => updater(comment))
            .filter(Boolean) as IComment[],
        })),
      });

      return true;
    };

    const updateFlatComments = (
      pageId: string,
      updater: (comment: IComment) => IComment | null,
    ) => {
      const cache = queryClient.getQueryData(RQ_KEY(pageId)) as
        | IPagination<IComment>
        | undefined;

      if (!cache?.items) {
        return;
      }

      queryClient.setQueryData(RQ_KEY(pageId), {
        ...cache,
        items: cache.items
          .map((comment) => updater(comment))
          .filter(Boolean) as IComment[],
      });
    };

    socket?.on("message", (event) => {
      const data: WebSocketEvent = event;

      let entity = null;
      let queryKeyId = null;

      switch (data.operation) {
        case "invalidate":
          queryClient.invalidateQueries({
            queryKey: [...data.entity, data.id].filter(Boolean),
          });
          break;
        case "commentCreated": {
          const createCache = queryClient.getQueryData(RQ_KEY(data.pageId)) as
            | InfiniteData<IPagination<IComment>>
            | undefined;

          if (createCache && createCache.pages.length > 0) {
            const alreadyExists = createCache.pages.some((page) =>
              page.items.some((comment) => comment.id === data.comment.id),
            );
            if (alreadyExists) {
              break;
            }

            const lastIdx = createCache.pages.length - 1;
            queryClient.setQueryData(RQ_KEY(data.pageId), {
              ...createCache,
              pages: createCache.pages.map((page, i) =>
                i === lastIdx
                  ? { ...page, items: [...page.items, data.comment] }
                  : page,
              ),
            });
          }
          break;
        }
        case "commentUpdated":
        case "commentResolved": {
          const didUpdateInfinite = updateInfiniteComments(
            data.pageId,
            (comment) =>
              comment.id === data.comment.id ? data.comment : comment,
          );

          if (!didUpdateInfinite) {
            updateFlatComments(data.pageId, (comment) =>
              comment.id === data.comment.id ? data.comment : comment,
            );
          }
          break;
        }
        case "commentDeleted": {
          const didUpdateInfinite = updateInfiniteComments(
            data.pageId,
            (comment) => (comment.id === data.commentId ? null : comment),
          );

          if (!didUpdateInfinite) {
            updateFlatComments(data.pageId, (comment) =>
              comment.id === data.commentId ? null : comment,
            );
          }
          break;
        }
        case "addTreeNode":
          invalidateOnCreatePage(data.payload.data);
          break;
        case "moveTreeNode":
          updateCacheOnMovePage(
            data.spaceId,
            data.payload.id,
            data.payload.oldParentId,
            data.payload.parentId,
            data.payload.pageData,
          );
          break;
        case "deleteTreeNode":
          invalidateOnDeletePage(data.payload.node.id);
          break;
        case "updateOne":
          entity = data.entity[0];
          if (entity === "pages") {
            patchPageInQueryCache({
              id: data.id,
              slugId: data.payload.slugId,
              ...data.payload,
            });
            invalidateOnUpdatePage(
              data.spaceId,
              data.payload.parentPageId,
              data.id,
              data.payload.title,
              data.payload.icon,
            );
            break;
          }

          queryKeyId = data.id;

          // only update if data was already in cache
          if (queryClient.getQueryData([...data.entity, queryKeyId])) {
            queryClient.setQueryData([...data.entity, queryKeyId], {
              ...queryClient.getQueryData([...data.entity, queryKeyId]),
              ...data.payload,
            });
          }

          /*
          queryClient.setQueriesData(
            { queryKey: [data.entity, data.id] },
            (oldData: any) => {
              const update = (entity: Record<string, unknown>) =>
                entity.id === data.id ? { ...entity, ...data.payload } : entity;
              return Array.isArray(oldData)
                ? oldData.map(update)
                : update(oldData as Record<string, unknown>);
            },
          );
      */
          break;
        case "refetchRootTreeNodeEvent": {
          const spaceId = data.spaceId;
          invalidateRootSidebarQueries(spaceId);

          queryClient.invalidateQueries({
            queryKey: ["recent-changes", spaceId],
          });
          break;
        }
        case "verificationUpdated":
          queryClient.invalidateQueries({
            queryKey: ["page-verification-info", data.pageId],
          });
          break;
        case "workspaceCollaborationUpdated":
          queryClient.setQueryData(["currentUser"], (currentUser: any) => {
            if (!currentUser?.workspace) {
              return currentUser;
            }

            return {
              ...currentUser,
              workspace: {
                ...currentUser.workspace,
                settings: {
                  ...(currentUser.workspace.settings ?? {}),
                  collaboration: {
                    ...(currentUser.workspace.settings?.collaboration ?? {}),
                    enabled: data.enabled,
                  },
                },
              },
            };
          });
          queryClient.invalidateQueries({ queryKey: ["currentUser"] });
          queryClient.invalidateQueries({ queryKey: ["collab-token"] });
          queryClient.invalidateQueries({ queryKey: ["workspace"] });
          break;
      }
    });
  }, [queryClient, socket]);
};
