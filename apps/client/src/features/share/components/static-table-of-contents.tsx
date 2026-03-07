import React, { useEffect, useState } from "react";
import { ISharedPageRenderedTocItem } from "@/features/share/types/share.types.ts";
import { cx } from "@/features/share/classnames.ts";
import { useShareTranslation } from "@/features/share/share-translations.ts";
import {
  requestShareScrollToHeading,
  SHARE_CONTENT_UPDATED_EVENT,
} from "@/features/share/share-navigation.ts";
import classes from "./static-table-of-contents.module.css";

interface StaticTableOfContentsProps {
  items: ISharedPageRenderedTocItem[];
  onNavigate?: () => void;
}

const PAGE_HEADER_HEIGHT_PX = 45;

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

const scrollWindowTo = (top: number, behavior: ScrollBehavior = "smooth") => {
  try {
    window.scrollTo({ top, behavior });
  } catch {
    window.scrollTo(0, top);
  }
};

const queueAfterNavigation = (callback?: () => void) => {
  if (!callback) {
    return;
  }

  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => {
      window.setTimeout(callback, 0);
    });
    return;
  }

  window.setTimeout(callback, 0);
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

export default function StaticTableOfContents({
  items,
  onNavigate,
}: StaticTableOfContentsProps) {
  const { t } = useShareTranslation();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [contentVersion, setContentVersion] = useState(0);

  useEffect(() => {
    const onContentUpdated = () => {
      setContentVersion((prev) => prev + 1);
    };

    window.addEventListener(
      SHARE_CONTENT_UPDATED_EVENT,
      onContentUpdated as EventListener,
    );

    return () => {
      window.removeEventListener(
        SHARE_CONTENT_UPDATED_EVENT,
        onContentUpdated as EventListener,
      );
    };
  }, []);

  useEffect(() => {
    if (!items.length || typeof window.IntersectionObserver !== "function") {
      return;
    }

    const headingElements = items
      .map((item) => document.getElementById(item.id))
      .filter(Boolean) as HTMLElement[];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId((entry.target as HTMLElement).id);
          }
        }
      },
      {
        rootMargin: `-${getStickyOffset()}px 0px -85% 0px`,
        threshold: 0,
      },
    );

    for (const heading of headingElements) {
      observer.observe(heading);
    }

    return () => {
      observer.disconnect();
    };
  }, [items, contentVersion]);

  const handleScrollToHeading = (item: ISharedPageRenderedTocItem) => {
    const id = item.id;
    const scrollBehavior: ScrollBehavior = onNavigate ? "auto" : "smooth";
    const target = document.getElementById(id);
    if (!target) {
      requestShareScrollToHeading({
        id,
        segmentIndex: item.segmentIndex,
        behavior: scrollBehavior,
      });
      queueAfterNavigation(onNavigate);
      return;
    }

    const top = target.getBoundingClientRect().top + window.scrollY - getStickyOffset();
    scrollWindowTo(top, scrollBehavior);
    if (typeof window.history?.replaceState === "function") {
      window.history.replaceState(null, "", `#${id}`);
    }
    queueAfterNavigation(onNavigate);
  };

  if (!items.length) {
    return <p className={classes.empty}>{t("No table of contents.")}</p>;
  }

  return (
    <>
      <p className={classes.title}>{t("Table of contents")}</p>
      <div className={classes.list}>
        {items.map((item) => (
          <button
            type="button"
            onClick={() => handleScrollToHeading(item)}
            key={item.id}
            className={cx(classes.link, {
              [classes.active]: item.id === activeId,
            })}
            style={{
              paddingLeft: `${item.level * 16}px`,
            }}
          >
            {item.text}
          </button>
        ))}
      </div>
    </>
  );
}
