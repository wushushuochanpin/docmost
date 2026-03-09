import { useEffect, useRef, useState } from "react";
import type {
  ISharedPageRendered,
  ISharedPageRenderedBlock,
  ISharedPageRenderedSegment,
} from "@/features/share/types/share.types.ts";
import { useShareTranslation } from "@/features/share/share-translations.ts";
import {
  SHARE_SCROLL_TO_HEADING_EVENT,
  type ShareScrollToHeadingDetail,
  notifyShareContentUpdated,
} from "@/features/share/share-navigation.ts";
import contentClasses from "./rendered-html-document.module.css";

export interface RenderedHtmlDocumentClassNames {
  layout?: string;
  titleSection?: string;
  title?: string;
  article?: string;
  segmentStatus?: string;
}

interface RenderedHtmlDocumentProps {
  title: string;
  rendered: ISharedPageRendered;
  loadSegment?: (cursor: string) => Promise<ISharedPageRenderedSegment>;
  fontScale?: string | number;
  classNames?: RenderedHtmlDocumentClassNames;
}

interface HtmlSegmentState {
  key: string;
  html: string;
  interactiveBlocks: ISharedPageRenderedBlock[];
  segmentIndex: number;
}

const PAGE_HEADER_HEIGHT_PX = 45;
const EMBED_DEFAULT_HEIGHT_PX = 480;
const EMBED_MIN_HEIGHT_PX = 240;
const EMBED_MAX_HEIGHT_PX = 720;
const EMBED_PREFETCH_ROOT_MARGIN = "320px 0px";
const SEGMENT_PREFETCH_ROOT_MARGIN = "1400px 0px";
const SEGMENT_IDLE_PREFETCH_DELAY_MS = 360;

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

const createInitialSegments = (
  rendered: ISharedPageRendered,
): HtmlSegmentState[] => {
  const initialHtml = rendered.deliveryMode === "segmented"
    ? rendered.headHtml || rendered.html || ""
    : rendered.html || rendered.headHtml || "";

  if (!initialHtml) {
    return [];
  }

  return [
    {
      key: `${rendered.contentHash}:0`,
      html: initialHtml,
      interactiveBlocks: rendered.interactiveBlocks ?? [],
      segmentIndex: 0,
    },
  ];
};

const getNextLoadedSegmentIndex = (segments: HtmlSegmentState[]) => {
  if (!segments.length) {
    return 0;
  }

  return segments[segments.length - 1].segmentIndex;
};

export default function RenderedHtmlDocument({
  title,
  rendered,
  loadSegment,
  fontScale,
  classNames,
}: RenderedHtmlDocumentProps) {
  const { t } = useShareTranslation();
  const articleRef = useRef<HTMLElement | null>(null);
  const segmentSentinelRef = useRef<HTMLDivElement | null>(null);
  const nextCursorRef = useRef<string | null>(rendered.nextCursor ?? null);
  const contentHashRef = useRef(rendered.contentHash);
  const loadedSegmentIndexRef = useRef(0);
  const isLoadingSegmentRef = useRef(false);
  const notifiedSegmentIndexRef = useRef(0);
  const activeSegmentRequestRef = useRef<Promise<boolean> | null>(null);
  const [previewImage, setPreviewImage] = useState<{
    src: string;
    alt: string;
  } | null>(null);
  const [segments, setSegments] = useState<HtmlSegmentState[]>(() =>
    createInitialSegments(rendered),
  );
  const [nextCursor, setNextCursor] = useState<string | null>(
    rendered.nextCursor ?? null,
  );
  const [isLoadingSegment, setIsLoadingSegment] = useState(false);
  const [segmentLoadFailed, setSegmentLoadFailed] = useState(false);
  const isSegmented = rendered.deliveryMode === "segmented";
  const loadedInteractiveBlocks = segments.flatMap((segment) => segment.interactiveBlocks);
  const interactiveBlockCount = loadedInteractiveBlocks.length;

  useEffect(() => {
    const nextSegments = createInitialSegments(rendered);
    const nextLoadedSegmentIndex = getNextLoadedSegmentIndex(nextSegments);

    setSegments(nextSegments);
    setNextCursor(rendered.nextCursor ?? null);
    setIsLoadingSegment(false);
    setSegmentLoadFailed(false);
    contentHashRef.current = rendered.contentHash;
    nextCursorRef.current = rendered.nextCursor ?? null;
    loadedSegmentIndexRef.current = nextLoadedSegmentIndex;
    isLoadingSegmentRef.current = false;
    notifiedSegmentIndexRef.current = nextLoadedSegmentIndex;
    activeSegmentRequestRef.current = null;
  }, [
    rendered.contentHash,
    rendered.deliveryMode,
    rendered.headHtml,
    rendered.html,
    rendered.interactiveBlocks,
    rendered.nextCursor,
  ]);

  useEffect(() => {
    nextCursorRef.current = nextCursor;
  }, [nextCursor]);

  useEffect(() => {
    loadedSegmentIndexRef.current = getNextLoadedSegmentIndex(segments);
  }, [segments]);

  useEffect(() => {
    const latestSegmentIndex = getNextLoadedSegmentIndex(segments);
    if (latestSegmentIndex <= notifiedSegmentIndexRef.current) {
      return;
    }

    notifiedSegmentIndexRef.current = latestSegmentIndex;
    notifyShareContentUpdated({
      contentHash: rendered.contentHash,
      segmentIndex: latestSegmentIndex,
    });
  }, [segments, rendered.contentHash]);

  const appendRenderedSegment = (segment: ISharedPageRenderedSegment) => {
    setSegments((prev) => {
      if (prev.some((item) => item.segmentIndex === segment.segmentIndex)) {
        return prev;
      }

      return [...prev, {
        key: `${rendered.contentHash}:${segment.segmentIndex}`,
        html: segment.html,
        interactiveBlocks: segment.interactiveBlocks,
        segmentIndex: segment.segmentIndex,
      }].sort((left, right) => left.segmentIndex - right.segmentIndex);
    });

    const resolvedNextCursor = segment.nextCursor ?? null;
    loadedSegmentIndexRef.current = Math.max(
      loadedSegmentIndexRef.current,
      segment.segmentIndex,
    );
    nextCursorRef.current = resolvedNextCursor;
    setNextCursor(resolvedNextCursor);
    setSegmentLoadFailed(false);
  };

  const loadNextSegment = async (cursorOverride?: string) => {
    if (activeSegmentRequestRef.current) {
      return activeSegmentRequestRef.current;
    }

    const cursor = cursorOverride ?? nextCursorRef.current;
    if (!isSegmented || !cursor || isLoadingSegmentRef.current) {
      return false;
    }

    const requestPromise = (async () => {
      const requestContentHash = contentHashRef.current;
      isLoadingSegmentRef.current = true;
      setIsLoadingSegment(true);

      try {
        if (!loadSegment) {
          setSegmentLoadFailed(true);
          return false;
        }

        const segment = await loadSegment(cursor);
        if (contentHashRef.current !== requestContentHash) {
          return false;
        }
        appendRenderedSegment(segment);
        return true;
      } catch {
        setSegmentLoadFailed(true);
        return false;
      } finally {
        isLoadingSegmentRef.current = false;
        setIsLoadingSegment(false);
        activeSegmentRequestRef.current = null;
      }
    })();

    activeSegmentRequestRef.current = requestPromise;
    return requestPromise;
  };

  const ensureSegmentsThrough = async (targetSegmentIndex: number) => {
    let safetyCounter = 0;

    while (
      loadedSegmentIndexRef.current < targetSegmentIndex &&
      nextCursorRef.current &&
      safetyCounter < 64
    ) {
      const loaded = await loadNextSegment(nextCursorRef.current);
      if (!loaded) {
        break;
      }

      safetyCounter += 1;
    }

    return loadedSegmentIndexRef.current >= targetSegmentIndex;
  };

  const scrollToHeadingIfPresent = (
    id: string,
    behavior: ScrollBehavior = "auto",
  ) => {
    const target = document.getElementById(id);
    if (!target) {
      return false;
    }

    const top =
      target.getBoundingClientRect().top + window.scrollY - getStickyOffset();
    scrollWindowTo(top, behavior);
    if (typeof window.history?.replaceState === "function") {
      window.history.replaceState(null, "", `#${id}`);
    }

    return true;
  };

  const ensureHeadingVisible = async (
    id: string,
    behavior: ScrollBehavior = "auto",
    segmentIndex?: number,
  ) => {
    if (scrollToHeadingIfPresent(id, behavior)) {
      return true;
    }

    const targetSegmentIndex =
      typeof segmentIndex === "number"
        ? segmentIndex
        : rendered.toc.find((item) => item.id === id)?.segmentIndex;

    if (typeof targetSegmentIndex !== "number") {
      return false;
    }

    const loaded = await ensureSegmentsThrough(targetSegmentIndex);
    if (!loaded) {
      return false;
    }

    await new Promise<void>((resolve) => {
      const frame = scheduleFrame(() => {
        scrollToHeadingIfPresent(id, behavior);
        resolve();
      });

      if (typeof frame === "number") {
        void frame;
      }
    });

    return true;
  };

  useEffect(() => {
    const hash = window.location.hash?.slice(1);
    if (hash) {
      void ensureHeadingVisible(hash, "auto");
    }

    const onHashChange = () => {
      const nextHash = window.location.hash?.slice(1);
      if (!nextHash) {
        return;
      }

      void ensureHeadingVisible(nextHash, "auto");
    };

    const onShareScrollRequest = (event: Event) => {
      const detail = (event as CustomEvent<ShareScrollToHeadingDetail>).detail;
      if (!detail?.id) {
        return;
      }

      void ensureHeadingVisible(
        detail.id,
        detail.behavior ?? "smooth",
        detail.segmentIndex,
      );
    };

    window.addEventListener("hashchange", onHashChange);
    window.addEventListener(
      SHARE_SCROLL_TO_HEADING_EVENT,
      onShareScrollRequest as EventListener,
    );

    return () => {
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener(
        SHARE_SCROLL_TO_HEADING_EVENT,
        onShareScrollRequest as EventListener,
      );
    };
  }, [loadSegment, rendered.contentHash, rendered.toc]);

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
    if (!loadedInteractiveBlocks.length) {
      return;
    }

    const article = articleRef.current;
    if (!article) {
      return;
    }

    let cancelled = false;
    let embedObserver: IntersectionObserver | null = null;
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
      if (block.dataset.sharePreviewBound === "true") {
        continue;
      }

      const image = block.querySelector<HTMLImageElement>("img");
      if (!image?.src) {
        continue;
      }

      block.dataset.sharePreviewBound = "true";
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
    }

    for (const block of embedBlocks) {
      if (
        block.dataset.shareEmbedMounted === "true" ||
        block.dataset.shareEmbedPrepared === "true"
      ) {
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
      block.dataset.shareEmbedPrepared = "true";

      loadButton.addEventListener(
        "click",
        () => {
          void mountEmbedBlock(block);
        },
        { once: true },
      );
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
    };
  }, [interactiveBlockCount, rendered.contentHash, t, title]);

  useEffect(() => {
    if (!isSegmented || !nextCursor || segments.length > 1) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadNextSegment();
    }, SEGMENT_IDLE_PREFETCH_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isSegmented, nextCursor, segments.length, rendered.contentHash]);

  useEffect(() => {
    if (!isSegmented || !nextCursor) {
      return;
    }

    const sentinel = segmentSentinelRef.current;
    if (!sentinel) {
      return;
    }

    if (typeof window.IntersectionObserver !== "function") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            continue;
          }

          void loadNextSegment();
        }
      },
      { rootMargin: SEGMENT_PREFETCH_ROOT_MARGIN },
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [isSegmented, nextCursor, segments.length, rendered.contentHash]);

  return (
    <>
      <section
        className={[contentClasses.docLayout, classNames?.layout].filter(Boolean).join(" ")}
        style={
          fontScale
            ? ({ "--editor-font-scale": `${fontScale}` } as React.CSSProperties)
            : undefined
        }
      >
        <header className={classNames?.titleSection}>
          <h1
            className={[contentClasses.pageTitle, classNames?.title]
              .filter(Boolean)
              .join(" ")}
          >
            {title}
          </h1>
        </header>

        <article
          ref={articleRef}
          className={[contentClasses.article, classNames?.article].filter(Boolean).join(" ")}
        >
          {segments.map((segment) => (
            <div
              key={segment.key}
              className={contentClasses.segment}
              data-share-segment={segment.segmentIndex}
              dangerouslySetInnerHTML={{ __html: segment.html }}
            />
          ))}
        </article>

        {isSegmented && (
          <div
            ref={segmentSentinelRef}
            className={[contentClasses.segmentStatus, classNames?.segmentStatus]
              .filter(Boolean)
              .join(" ")}
            aria-live="polite"
          >
            {isLoadingSegment && (
              <div className={contentClasses.segmentLoader}>
                {t("Loading remaining content...")}
              </div>
            )}

            {!isLoadingSegment && segmentLoadFailed && (
              <div className={contentClasses.segmentError}>
                <span>{t("Error fetching page data.")}</span>
                <button
                  type="button"
                  className={contentClasses.segmentRetryButton}
                  onClick={() => {
                    void loadNextSegment();
                  }}
                >
                  {t("Reload")}
                </button>
              </div>
            )}
          </div>
        )}

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
