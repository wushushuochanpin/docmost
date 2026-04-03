export type EditorBootstrapStage =
  | "page-data-ready"
  | "editor-shell-mounted"
  | "collab-token-ready"
  | "local-fallback-activated"
  | "yjs-synced";

type EditorBootstrapRecord = {
  startedAt: number;
  stages: Partial<Record<EditorBootstrapStage, number>>;
  meta: Partial<Record<EditorBootstrapStage, Record<string, unknown>>>;
};

declare global {
  interface Window {
    __DOCMOST_EDITOR_BOOTSTRAP__?: Record<string, EditorBootstrapRecord>;
  }
}

function getBootstrapStore() {
  if (typeof window === "undefined") return null;

  window.__DOCMOST_EDITOR_BOOTSTRAP__ ??= {};
  return window.__DOCMOST_EDITOR_BOOTSTRAP__;
}

export function markEditorBootstrapStage(
  pageId: string | undefined,
  stage: EditorBootstrapStage,
  meta?: Record<string, unknown>,
) {
  if (!pageId || typeof window === "undefined") return null;

  const store = getBootstrapStore();
  if (!store) return null;

  const now = performance.now();
  const existing = store[pageId];
  const record =
    existing ??
    ({
      startedAt: now,
      stages: {},
      meta: {},
    } satisfies EditorBootstrapRecord);

  if (record.stages[stage] != null) {
    return record.stages[stage]!;
  }

  if (stage === "page-data-ready") {
    record.startedAt = now;
  }

  const relativeMs = now - record.startedAt;
  record.stages[stage] = relativeMs;
  record.meta[stage] = meta;
  store[pageId] = record;

  performance.mark(`docmost:${pageId}:${stage}`);
  window.dispatchEvent(
    new CustomEvent("docmost:editor-bootstrap", {
      detail: {
        pageId,
        stage,
        relativeMs,
        meta,
      },
    }),
  );

  return relativeMs;
}

export function resetEditorBootstrapTrace(pageId: string | undefined) {
  if (!pageId || typeof window === "undefined") return;

  const store = getBootstrapStore();
  if (!store?.[pageId]) return;

  delete store[pageId];
}
