import { useAtom } from "jotai";
import { useLayoutEffect } from "react";
import {
  activeHistoryIdAtom,
  activeHistoryPrevIdAtom,
  diffCountsAtom,
} from "@/features/page-history/atoms/history-atoms";

/**
 * Reset once when a history panel opens or its page changes.
 * The responsive panel bodies must not reset a selection when they remount.
 * Clears active selection and diff counts.
 */
export function useHistoryReset(pageId: string, opened: boolean) {
  const [, setActiveHistoryId] = useAtom(activeHistoryIdAtom);
  const [, setActiveHistoryPrevId] = useAtom(activeHistoryPrevIdAtom);
  const [, setDiffCounts] = useAtom(diffCountsAtom);

  useLayoutEffect(() => {
    setActiveHistoryId("");
    setActiveHistoryPrevId("");
    // @ts-ignore
    setDiffCounts(null);
  }, [
    pageId,
    opened,
    setActiveHistoryId,
    setActiveHistoryPrevId,
    setDiffCounts,
  ]);
}
