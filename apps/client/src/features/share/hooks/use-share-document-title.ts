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

type SharePreviewMetaInput = {
  title?: string;
  description?: string;
  canonicalUrl?: string;
};

export function useSharePreviewMeta(input?: SharePreviewMetaInput) {
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const managedNodes: Element[] = [];
    const upsertMeta = (
      attr: "name" | "property",
      key: string,
      content?: string,
    ) => {
      const selector = `meta[${attr}="${key}"][data-share-managed="true"]`;
      const existing = document.head.querySelector<HTMLMetaElement>(selector);

      if (!content) {
        existing?.remove();
        return;
      }

      const meta = existing || document.createElement("meta");
      meta.setAttribute(attr, key);
      meta.setAttribute("content", content);
      meta.setAttribute("data-share-managed", "true");
      if (!existing) {
        document.head.appendChild(meta);
      }
      managedNodes.push(meta);
    };

    const upsertCanonical = (href?: string) => {
      const selector = 'link[rel="canonical"][data-share-managed="true"]';
      const existing = document.head.querySelector<HTMLLinkElement>(selector);

      if (!href) {
        existing?.remove();
        return;
      }

      const link = existing || document.createElement("link");
      link.setAttribute("rel", "canonical");
      link.setAttribute("href", href);
      link.setAttribute("data-share-managed", "true");
      if (!existing) {
        document.head.appendChild(link);
      }
      managedNodes.push(link);
    };

    upsertMeta("name", "description", input?.description);
    upsertMeta("property", "og:title", input?.title);
    upsertMeta("property", "og:description", input?.description);
    upsertMeta("property", "og:url", input?.canonicalUrl);
    upsertMeta("name", "twitter:title", input?.title);
    upsertMeta("name", "twitter:description", input?.description);
    upsertCanonical(input?.canonicalUrl);

    return () => {
      managedNodes.forEach((node) => node.remove());
    };
  }, [input?.canonicalUrl, input?.description, input?.title]);
}
