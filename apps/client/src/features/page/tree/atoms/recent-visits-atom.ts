import { atom } from "jotai";

export type RecentVisit = {
  id: string;
  slugId: string;
  name: string;
  icon?: string;
  spaceId: string;
  visitedAt: number;
};

const STORAGE_KEY = "docmost:recent-visits";
const MAX_VISITS = 20;

function readFromStorage(): RecentVisit[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is RecentVisit =>
        v && typeof v.id === "string" && typeof v.slugId === "string",
    );
  } catch {
    return [];
  }
}

function writeToStorage(visits: RecentVisit[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(visits.slice(0, MAX_VISITS)));
  } catch {
    // localStorage unavailable — visits are session-only.
  }
}

export const recentVisitsAtom = atom<RecentVisit[]>(readFromStorage());

/**
 * Record a page visit: move it to the front (dedupe by id), keep at most
 * MAX_VISITS, and persist to localStorage. Called from the tree whenever the
 * current page changes.
 */
export function recordRecentVisit(
  prev: RecentVisit[],
  page: Pick<RecentVisit, "id" | "slugId" | "name" | "icon" | "spaceId">,
): RecentVisit[] {
  const now = Date.now();
  const filtered = prev.filter((v) => v.id !== page.id);
  const next: RecentVisit[] = [
    { ...page, visitedAt: now },
    ...filtered,
  ].slice(0, MAX_VISITS);
  writeToStorage(next);
  return next;
}
