export const RECENT_PAGES_STORAGE_KEY_PREFIX = "docmost:recent-pages";

const MAX_ENTRIES = 10;

export interface RecentPageEntry {
  pageId: string;
  slugId: string;
  title: string;
  icon?: string | null;
  nodeType?: "file" | "folder";
  spaceId: string;
  spaceName: string;
  spaceSlug: string;
  workspaceId?: string;
  visitedAt: number;
}

function getStorageKey(scopeId?: string | null) {
  return `${RECENT_PAGES_STORAGE_KEY_PREFIX}:${scopeId || "global"}`;
}

function readRecentPages(scopeId?: string | null): RecentPageEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(getStorageKey(scopeId));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRecentPages(
  scopeId: string | null | undefined,
  entries: RecentPageEntry[],
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      getStorageKey(scopeId),
      JSON.stringify(entries),
    );
  } catch {
    // Recent pages are a convenience cache; storage failures must not block page rendering.
  }
}

export function recordRecentPage(
  entry: Omit<RecentPageEntry, "visitedAt">,
  scopeId?: string | null,
) {
  if (!entry.pageId || !entry.slugId || !entry.spaceId) {
    return;
  }

  const storageScope = scopeId ?? entry.workspaceId;
  const current = readRecentPages(storageScope);
  const nextEntry: RecentPageEntry = {
    ...entry,
    title: entry.title || "Untitled",
    visitedAt: Date.now(),
  };

  const deduped = current.filter((item) => item.pageId !== entry.pageId);
  writeRecentPages(storageScope, [nextEntry, ...deduped].slice(0, MAX_ENTRIES));
}

export function getRecentPages(
  scopeId: string | null | undefined,
  excludePageId: string,
  excludeDescendantIds: string[] = [],
) {
  const excluded = new Set([excludePageId, ...excludeDescendantIds]);
  return readRecentPages(scopeId)
    .filter((entry) => entry.pageId && !excluded.has(entry.pageId))
    .sort((a, b) => b.visitedAt - a.visitedAt)
    .slice(0, 6);
}

export function removeRecentPage(
  scopeId: string | null | undefined,
  pageId: string,
) {
  const entries = readRecentPages(scopeId).filter(
    (entry) => entry.pageId !== pageId,
  );
  writeRecentPages(scopeId, entries);
}

export function clearRecentPages() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith(`${RECENT_PAGES_STORAGE_KEY_PREFIX}:`))
      .forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Ignore cleanup failures during logout.
  }
}
