import { useEffect } from "react";
import { socketAtom } from "@/features/websocket/atoms/socket-atom.ts";
import { useAtom } from "jotai";
import { treeDataAtom } from "@/features/page/tree/atoms/tree-data-atom.ts";
import { WebSocketEvent } from "@/features/websocket/types";
import { SpaceTreeNode } from "@/features/page/tree/types.ts";
import { useQueryClient } from "@tanstack/react-query";
import { SimpleTree } from "react-arborist";
import localEmitter from "@/lib/local-emitter.ts";

function applyPageUpdateToTree(
  current: SpaceTreeNode[],
  event: {
    id?: string;
    payload?: {
      title?: string | null;
      icon?: string | null;
    };
  },
) {
  if (!event.id) {
    return current;
  }

  const treeApi = new SimpleTree<SpaceTreeNode>(current);
  if (!treeApi.find(event.id)) {
    return current;
  }

  if (event.payload?.title !== undefined) {
    treeApi.update({
      id: event.id,
      changes: { name: event.payload.title ?? "" },
    });
  }

  if (event.payload?.icon !== undefined) {
    treeApi.update({
      id: event.id,
      changes: { icon: event.payload.icon },
    });
  }

  return treeApi.data;
}

export const useTreeSocket = () => {
  const [socket] = useAtom(socketAtom);
  const [, setTreeData] = useAtom(treeDataAtom);
  const queryClient = useQueryClient();

  useEffect(() => {
    const updateNodeName = (event: {
      id?: string;
      payload?: { title?: string | null; icon?: string | null };
    }) => {
      setTreeData((current) => applyPageUpdateToTree(current, event));
    };

    localEmitter.on("message", updateNodeName);
    return () => {
      localEmitter.off("message", updateNodeName);
    };
  }, [setTreeData]);

  useEffect(() => {
    socket?.on("message", (event: WebSocketEvent) => {
      switch (event.operation) {
        case "updateOne":
          if (event.entity[0] === "pages") {
            setTreeData((current) => applyPageUpdateToTree(current, event));
          }
          break;
        case "addTreeNode":
          setTreeData((current) => {
            const treeApi = new SimpleTree<SpaceTreeNode>(current);
            if (treeApi.find(event.payload.data.id)) {
              return current;
            }

            treeApi.create({
              parentId: event.payload.parentId,
              index: event.payload.index,
              data: event.payload.data,
            });
            return treeApi.data;
          });
          break;
        case "moveTreeNode":
          setTreeData((current) => {
            const treeApi = new SimpleTree<SpaceTreeNode>(current);
            if (!treeApi.find(event.payload.id)) {
              return current;
            }

            treeApi.move({
              id: event.payload.id,
              parentId: event.payload.parentId,
              index: event.payload.index,
            });
            treeApi.update({
              id: event.payload.id,
              changes: {
                position: event.payload.position,
              },
            });
            return treeApi.data;
          });
          break;
        case "deleteTreeNode":
          setTreeData((current) => {
            const treeApi = new SimpleTree<SpaceTreeNode>(current);
            if (!treeApi.find(event.payload.node.id)) {
              return current;
            }

            treeApi.drop({ id: event.payload.node.id });
            queryClient.invalidateQueries({
              queryKey: ["pages", event.payload.node.slugId].filter(Boolean),
            });
            return treeApi.data;
          });
          break;
      }
    });
  }, [queryClient, setTreeData, socket]);
};
