import { NodePos, useEditor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import React, { FC, useEffect, useState } from "react";
import classes from "./table-of-contents.module.css";
import clsx from "clsx";
import { Box, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";

type TableOfContentsProps = {
  editor: ReturnType<typeof useEditor>;
  isShare?: boolean;
  onNavigate?: () => void;
};

export type HeadingLink = {
  label: string;
  level: number;
  element: HTMLElement;
  position: number;
};

const PAGE_HEADER_HEIGHT_PX = 45;

const parseCssLengthToPx = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return NaN;
  }

  if (trimmed.endsWith("px")) {
    return parseFloat(trimmed);
  }

  if (trimmed.endsWith("rem")) {
    const rootFontSize = parseFloat(
      window.getComputedStyle(document.documentElement).fontSize,
    );
    return parseFloat(trimmed) * (Number.isFinite(rootFontSize) ? rootFontSize : 16);
  }

  return parseFloat(trimmed);
};

const getEditorStickyOffset = () => {
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

const recalculateLinks = (nodePos?: NodePos[] | null) => {
  const safeNodePos = Array.isArray(nodePos) ? nodePos : [];
  const nodes: HTMLElement[] = [];

  const links: HeadingLink[] = Array.from(safeNodePos).reduce<HeadingLink[]>(
    (acc, item) => {
      const label = item.node.textContent;
      const level = Number(item.node.attrs.level);
      if (label.length && level <= 4) {
        acc.push({
          label,
          level,
          element: item.element,
          //@ts-ignore
          position: item.resolvedPos.pos,
        });
        nodes.push(item.element);
      }
      return acc;
    },
    [],
  );
  return { links, nodes };
};

export const TableOfContents: FC<TableOfContentsProps> = (props) => {
  const { t } = useTranslation();
  const [links, setLinks] = useState<HeadingLink[]>([]);
  const [headingDOMNodes, setHeadingDOMNodes] = useState<HTMLElement[]>([]);
  const [activeElement, setActiveElement] = useState<HTMLElement | null>(null);

  const handleScrollToHeading = (position: number) => {
    if (!props.editor) {
      return;
    }

    const { view } = props.editor;
    const headerOffset = getEditorStickyOffset();
    const scrollBehavior: ScrollBehavior = props.onNavigate ? "auto" : "smooth";

    const { node } = view.domAtPos(position);
    const element = node as HTMLElement;
    const scrollPosition =
      element.getBoundingClientRect().top + window.scrollY - headerOffset;

    window.scrollTo({
      top: scrollPosition,
      behavior: scrollBehavior,
    });

    const tr = view.state.tr;
    tr.setSelection(new TextSelection(tr.doc.resolve(position)));
    view.dispatch(tr);
    view.focus();
    queueAfterNavigation(props.onNavigate);
  };

  const handleUpdate = () => {
    const result = recalculateLinks(props.editor?.$nodes("heading"));

    setLinks(result.links);
    setHeadingDOMNodes(result.nodes);
  };

  useEffect(() => {
    props.editor?.on("update", handleUpdate);

    return () => {
      props.editor?.off("update", handleUpdate);
    };
  }, [props.editor]);

  useEffect(
    () => {
      handleUpdate();
    },
    props.isShare ? [props.editor] : [],
  );

  useEffect(() => {
    try {
      const headerOffset = getEditorStickyOffset();

      const observeHandler = (entries: IntersectionObserverEntry[]) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveElement(entry.target as HTMLElement);
          }
        });
      };

      const observerOptions: IntersectionObserverInit = {
        rootMargin: `-${headerOffset}px 0px -85% 0px`,
        threshold: 0,
        root: null,
      };
      const observer = new IntersectionObserver(
        observeHandler,
        observerOptions,
      );

      headingDOMNodes.forEach((heading) => {
        observer.observe(heading);
      });
      return () => {
        headingDOMNodes.forEach((heading) => {
          observer.unobserve(heading);
        });
      };
    } catch (err) {
      console.log(err);
    }
  }, [headingDOMNodes, props.editor]);

  if (!links.length) {
    return (
      <>
        {!props.isShare && (
          <Text size="sm">
            {t("Add headings (H1, H2, H3) to generate a table of contents.")}
          </Text>
        )}

        {props.isShare && (
          <Text size="sm" c="dimmed">
            {t("No table of contents.")}
          </Text>
        )}
      </>
    );
  }

  return (
    <>
      {props.isShare && (
        <Title order={2} size="h6" mb="md" fw={500}>
          {t("Table of contents")}
        </Title>
      )}
      <div className={props.isShare ? classes.leftBorder : ""}>
        {links.map((item, idx) => (
          <Box<"button">
            component="button"
            onClick={() => handleScrollToHeading(item.position)}
            key={idx}
            className={clsx(classes.link, {
              [classes.linkActive]: item.element === activeElement,
            })}
            style={{
              paddingLeft: `calc(${item.level} * var(--mantine-spacing-md))`,
            }}
          >
            {item.label}
          </Box>
        ))}
      </div>
    </>
  );
};
