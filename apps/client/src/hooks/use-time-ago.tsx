import { timeAgo } from "@/lib/time.ts";
import { useMemo, useSyncExternalStore } from "react";

const TICK_INTERVAL_MS = 5_000;

let tick = 0;
let intervalId: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  if (listeners.size === 1) {
    intervalId = setInterval(() => {
      tick++;
      listeners.forEach((listener) => listener());
    }, TICK_INTERVAL_MS);
  }

  return () => {
    listeners.delete(callback);
    if (listeners.size === 0 && intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

function getSnapshot() {
  return tick;
}

function resolveTimeAgoValue(date?: Date | string | null) {
  if (!date) {
    return "";
  }

  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return timeAgo(parsedDate);
}

export function useTimeAgo(date?: Date | string | null) {
  const currentTick = useSyncExternalStore(subscribe, getSnapshot);
  return useMemo(() => resolveTimeAgoValue(date), [date, currentTick]);
}
