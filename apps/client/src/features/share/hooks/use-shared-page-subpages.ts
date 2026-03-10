import { useMemo } from "react";
import { useAtomValue } from "jotai";
import { sharedTreeDataAtom } from "@/features/share/atoms/shared-page-atom";
import {
  findSharedPageSubpages,
  SharedPageTreeNode,
} from "@/features/share/utils";

export function useSharedPageSubpages(pageId: string | undefined) {
  const treeData = useAtomValue(sharedTreeDataAtom);

  return useMemo(() => {
    if (!treeData || !pageId) return [];

    return findSharedPageSubpages(treeData, pageId);
  }, [treeData, pageId]);
}
