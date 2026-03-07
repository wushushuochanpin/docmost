import { useEffect, useRef, useState } from "react";
import type { ISharedPageRenderedBlock } from "@/features/share/types/share.types.ts";
import { useShareTranslation } from "@/features/share/share-translations.ts";
import contentClasses from "./shared-page-html-content.module.css";

interface SharedPageHtmlContentProps {
  title: string;
  html: string;
  interactiveBlocks: ISharedPageRenderedBlock[];
}

const PAGE_HEADER_HEIGHT_PX = 45;
const EMBED_DEFAULT_HEIGHT_PX = 480;
const EMBED_MIN_HEIGHT_PX = 240;
const EMBED_MAX_HEIGHT_PX = 720;
const EMBED_PREFETCH_ROOT_MARGIN = "320px 0px";

let embedRuntimePromise:
  | Promise<{
      getEmbedUrlAndProvider: (
        src: string,
      ) => { embedUrl: string; provider: string };
      sanitizeUrl: (url: string | undefined) => string;
    }>
  | null = null;

const parseCssLengthToPx = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return Number.NaN;
  }

  if (trimmed.endsWith("px")) {
    return Number.parseFloat(trimmed);
  }

  if (trimmed.endsWith("rem")) {
    const rootFontSize = Number.parseFloat(
      window.getComputedStyle(document.documentElement).fontSize,
    );
    return Number.parseFloat(trimmed) * (Number.isFinite(rootFontSize) ? rootFontSize : 16);
  }

  return Number.parseFloat(trimmed);
};

const scheduleFrame = (callback: FrameRequestCallback) => {
  if (typeof window.requestAnimationFrame === "function") {
    return window.requestAnimationFrame(callback);
  }

  return window.setTimeout(() => callback(Date.now()), 16);
};

const cancelScheduledFrame = (id: number) => {
  if (typeof window.cancelAnimationFrame === "function") {
    window.cancelAnimationFrame(id);
    return;
  }

  window.clearTimeout(id);
};

const scrollWindowTo = (top: number, behavior: ScrollBehavior = "auto") => {
  try {
    window.scrollTo({ top, behavior });
  } catch {
    window.scrollTo(0, top);
  }
};

const removeAllChildren = (element: Element) => {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
};

const appendChildNodes = (parent: Element, nodes: Node[]) => {
  for (const node of nodes) {
    parent.appendChild(node);
  }
};

const replaceChildNodes = (parent: Element, nodes: Node[]) => {
  removeAllChildren(parent);
  appendChildNodes(parent, nodes);
};

const getStickyOffset = () => {
  const rootStyles = window.getComputedStyle(document.documentElement);
  const rawHeaderOffset = rootStyles.getPropertyValue("--app-shell-header-offset");
  const rawHeaderHeight = rootStyles.getPropertyValue("--app-shell-header-height");
  const headerOffsetPx = parseCssLengthToPx(rawHeaderOffset);
  const headerHeightPx = parseCssLengthToPx(rawHeaderHeight);
  const resolvedHeaderOffset = Number.isFinite(headerOffsetPx)
    ? headerOffsetPx
    : Number.isFinite(headerHeightPx)
      ? headerHeightPx
      : PAGE_HEADER_HEIGHT_PX;

  return resolvedHeaderOffset + PAGE_HEADER_HEIGHT_PX;
};

const getClampedEmbedHeight = (value: string | null) => {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) {
    return EMBED_DEFAULT_HEIGHT_PX;
  }

  return Math.min(EMBED_MAX_HEIGHT_PX, Math.max(EMBED_MIN_HEIGHT_PX, parsed));
};

const toProviderLabel = (provider: string | null) => {
  if (!provider) {
    return "Embedded content";
  }

  return provider
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const loadEmbedRuntime = async () => {
  if (!embedRuntimePromise) {
    embedRuntimePromise = Promise.all([
      import("@docmost/editor-ext/src/lib/embed-provider.ts"),
      import("@docmost/editor-ext/src/lib/utils.ts"),
    ]).then(([providerModule, utilsModule]) => ({
      getEmbedUrlAndProvider: providerModule.getEmbedUrlAndProvider,
      sanitizeUrl: utilsModule.sanitizeUrl,
    }));
  }

  return embedRuntimePromise;
};

export default function SharedPageHtmlContent({
  title,
  html,
  interactiveBlocks,
}: SharedPageHtmlContentProps) {
  const { t } = useShareTranslation();
  const articleRef = useRef<HTMLElement | null>(null);
  const [previewImage, setPreviewImage] = useState<{
    src: string;
    alt: string;
  } | null>(null);

  useEffect(() => {
    const hash = window.location.hash?.slice(1);
    if (!hash) {
      return;
    }

    const frame = scheduleFrame(() => {
      const target = document.getElementById(hash);
      if (!target) {
        return;
      }

      const top =
        target.getBoundingClientRect().top + window.scrollY - getStickyOffset();
      scrollWindowTo(top, "auto");
    });

    return () => {
      cancelScheduledFrame(frame);
    };
  }, [html]);

  useEffect(() => {
    if (!previewImage) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreviewImage(null);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [previewImage]);

  useEffect(() => {
    if (!interactiveBlocks.length) {
      return;
    }

    const article = articleRef.current;
    if (!article) {
      return;
    }

    let cancelled = false;
    let embedObserver: IntersectionObserver | null = null;
    const cleanups: Array<() => void> = [];
    const embedBlocks = Array.from(
      article.querySelectorAll<HTMLElement>('[data-share-block="embed"]'),
    );
    const previewBlocks = Array.from(
      article.querySelectorAll<HTMLElement>(
        '[data-share-block="drawio"], [data-share-block="excalidraw"]',
      ),
    );

    const prefetchEmbedRuntime = () => {
      void loadEmbedRuntime();
    };

    const mountEmbedBlock = async (block: HTMLElement) => {
      if (
        cancelled ||
        block.dataset.shareEmbedMounted === "true" ||
        block.dataset.shareEmbedMounting === "true"
      ) {
        return;
      }

      const src =
        block.getAttribute("data-src") ||
        block.querySelector<HTMLAnchorElement>("a")?.href ||
        "";

      if (!src) {
        return;
      }

      block.dataset.shareEmbedMounting = "true";

      try {
        const { getEmbedUrlAndProvider, sanitizeUrl } = await loadEmbedRuntime();
        if (cancelled) {
          return;
        }

        const embedInfo = getEmbedUrlAndProvider(src);
        const embedUrl = embedInfo?.embedUrl
          ? sanitizeUrl(embedInfo.embedUrl)
          : null;

        if (!embedUrl) {
          delete block.dataset.shareEmbedMounting;
          return;
        }

        const iframe = document.createElement("iframe");
        iframe.className = contentClasses.embedFrame;
        iframe.src = embedUrl;
        iframe.allow = "encrypted-media";
        iframe.setAttribute(
          "sandbox",
          "allow-scripts allow-same-origin allow-forms allow-popups",
        );
        iframe.allowFullscreen = true;
        iframe.frameBorder = "0";
        iframe.loading = "lazy";
        iframe.style.height = `${getClampedEmbedHeight(
          block.getAttribute("data-height"),
        )}px`;

        replaceChildNodes(block, [iframe]);
        block.dataset.shareEmbedMounted = "true";
      } finally {
        delete block.dataset.shareEmbedMounting;
      }
    };

    for (const block of previewBlocks) {
      const image = block.querySelector<HTMLImageElement>("img");
      if (!image?.src) {
        continue;
      }

      block.classList.add(contentClasses.interactivePreviewTrigger);
      block.setAttribute("role", "button");
      block.setAttribute("aria-label", t("Open preview"));
      block.tabIndex = 0;
      block.dataset.sharePreviewLabel = t("Open preview");

      const openPreview = () => {
        setPreviewImage({
          src: image.currentSrc || image.src,
          alt: image.alt || title,
        });
      };

      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openPreview();
        }
      };

      block.addEventListener("click", openPreview);
      block.addEventListener("keydown", onKeyDown);
      cleanups.push(() => {
        block.removeEventListener("click", openPreview);
        block.removeEventListener("keydown", onKeyDown);
      });
    }

    for (const block of embedBlocks) {
      if (block.dataset.shareEmbedMounted === "true") {
        continue;
      }

      const sourceUrl =
        block.getAttribute("data-src") ||
        block.querySelector<HTMLAnchorElement>("a")?.href ||
        "";
      const providerLabel = toProviderLabel(block.getAttribute("data-provider"));
      const safeHref =
        block.querySelector<HTMLAnchorElement>("a")?.href || sourceUrl;

      const placeholder = document.createElement("div");
      placeholder.className = contentClasses.embedPlaceholder;

      const titleNode = document.createElement("div");
      titleNode.className = contentClasses.embedPlaceholderTitle;
      titleNode.textContent = t("Load {{provider}} preview", {
        provider: providerLabel,
      });

      const metaNode = document.createElement("p");
      metaNode.className = contentClasses.embedPlaceholderMeta;
      metaNode.textContent =
        safeHref || t("Preview is unavailable for this embed.");

      const actions = document.createElement("div");
      actions.className = contentClasses.embedPlaceholderActions;

      const loadButton = document.createElement("button");
      loadButton.type = "button";
      loadButton.className = contentClasses.embedLoadButton;
      loadButton.textContent = t("Load preview");

      actions.appendChild(loadButton);

      if (safeHref) {
        const openLink = document.createElement("a");
        openLink.className = contentClasses.embedOpenLink;
        openLink.target = "_blank";
        openLink.rel = "noopener noreferrer";
        openLink.href = safeHref;
        openLink.textContent = t("Open original");
        actions.appendChild(openLink);
      }

      appendChildNodes(placeholder, [titleNode, metaNode, actions]);
      replaceChildNodes(block, [placeholder]);

      const onLoadPreview = () => {
        void mountEmbedBlock(block);
      };

      loadButton.addEventListener("click", onLoadPreview);
      cleanups.push(() => {
        loadButton.removeEventListener("click", onLoadPreview);
      });
    }

    if (embedBlocks.length && typeof window.IntersectionObserver === "function") {
      embedObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) {
              continue;
            }

            prefetchEmbedRuntime();
            embedObserver?.unobserve(entry.target);
          }
        },
        { rootMargin: EMBED_PREFETCH_ROOT_MARGIN },
      );

      for (const block of embedBlocks) {
        embedObserver.observe(block);
      }
    } else if (embedBlocks.length) {
      prefetchEmbedRuntime();
    }

    return () => {
      cancelled = true;
      embedObserver?.disconnect();
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [html, interactiveBlocks, t, title]);

  return (
    <>
      <section className={contentClasses.docLayout}>
        <header className={contentClasses.titleSection}>
          <h1 className={contentClasses.pageTitle}>{title}</h1>
        </header>

        <article
          ref={articleRef}
          className={contentClasses.article}
          dangerouslySetInnerHTML={{ __html: html }}
        />

        <div className={contentClasses.bottomSpacer} />
      </section>

      {previewImage && (
        <div
          className={contentClasses.previewOverlay}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className={contentClasses.previewBackdrop}
            aria-label={t("Close preview")}
            onClick={() => setPreviewImage(null)}
          />

          <div className={contentClasses.previewDialog}>
            <button
              type="button"
              className={contentClasses.previewCloseButton}
              onClick={() => setPreviewImage(null)}
            >
              {t("Close preview")}
            </button>

            <figure className={contentClasses.previewFigure}>
              <img
                className={contentClasses.previewImage}
                src={previewImage.src}
                alt={previewImage.alt}
              />
              <figcaption className={contentClasses.previewCaption}>
                {previewImage.alt}
              </figcaption>
            </figure>
          </div>
        </div>
      )}
    </>
  );
}
