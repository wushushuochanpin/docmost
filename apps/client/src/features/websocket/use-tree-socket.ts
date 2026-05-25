import { useEffect } from "react";
import { socketAtom } from "@/features/websocket/atoms/socket-atom.ts";
import { useAtom } from "jotai";
import { treeDataAtom } from "@/features/page/tree/atoms/tree-data-atom.ts";
import { WebSocketEvent } from "@/features/websocket/types";
import { SpaceTreeNode } from "@/features/page/tree/types.ts";
import { useQueryClient } from "@tanstack/react-query";
import { treeModel } from "@/features/page/tree/model/tree-model";
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

  if (!treeModel.find(current, event.id)) {
    return current;
  }

  let result = current;
  if (event.payload?.title !== undefined) {
    result = treeModel.update(result, event.id, { name: event.payload.title ?? "" });
  }

  if (event.payload?.icon !== undefined) {
    result = treeModel.update(result, event.id, { icon: event.payload.icon });
  }

  return result;
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
            if (treeModel.find(current, event.payload.data.id)) {
              return current;
            }
            return treeModel.insert(current, event.payload.parentId, event.payload.data, event.payload.index);
          });
          break;
        case "moveTreeNode":
          setTreeData((current) => {
            if (!treeModel.find(current, event.payload.id)) {
              return current;
            }
            const moved = treeModel.place(current, event.payload.id, {
              parentId: event.payload.parentId,
              index: event.payload.index,
            });
            return treeModel.update(moved, event.payload.id, { position: event.payload.position });
          });
          break;
        case "deleteTreeNode":
          setTreeData((current) => {
            if (!treeModel.find(current, event.payload.node.id)) {
              return current;
            }
            queryClient.invalidateQueries({
              queryKey: ["pages", event.payload.node.slugId].filter(Boolean),
            });
            return treeModel.remove(current, event.payload.node.id);
          });
          break;
      }
    });
  }, [queryClient, setTreeData, socket]);
};
