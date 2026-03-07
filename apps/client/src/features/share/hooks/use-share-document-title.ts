import { useEffect } from "react";

export function useShareDocumentTitle(title?: string) {
  useEffect(() => {
    if (!title || typeof document === "undefined") {
      return;
    }

    document.title = title;
  }, [title]);
}

export function useShareRobotsMeta(disableIndexing?: boolean) {
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const managedSelector = 'meta[name="robots"][data-share-managed="true"]';
    const existingManagedMeta = document.head.querySelector<HTMLMetaElement>(
      managedSelector,
    );

    if (!disableIndexing) {
      existingManagedMeta?.remove();
      return;
    }

    const meta = existingManagedMeta || document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    meta.setAttribute("data-share-managed", "true");

    if (!existingManagedMeta) {
      document.head.appendChild(meta);
    }

    return () => {
      meta.remove();
    };
  }, [disableIndexing]);
}
