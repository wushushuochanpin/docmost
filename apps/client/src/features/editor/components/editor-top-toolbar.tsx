import { Group, Text } from "@mantine/core";
import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEditorState } from "@tiptap/react";
import clsx from "clsx";
import { pageEditorAtom } from "@/features/editor/atoms/editor-atoms.ts";
import { EditorStickyToolbar } from "@/features/editor/components/bubble-menu/editor-sticky-toolbar.tsx";
import { usePageQuery } from "@/features/page/queries/page-query.ts";
import { useLatestPageHistoryQuery } from "@/features/page-history/queries/page-history-query.ts";
import classes from "./editor-top-toolbar.module.css";

interface EditorTopToolbarProps {
  pageId: string;
  editable: boolean;
}

function formatAbsoluteDate(date: Date, locale: string) {
  const normalizedLocale = locale || "en-US";

  if (normalizedLocale.startsWith("zh")) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    const hour = `${date.getHours()}`.padStart(2, "0");
    const minute = `${date.getMinutes()}`.padStart(2, "0");
    const second = `${date.getSeconds()}`.padStart(2, "0");

    return `${year}年${month}月${day}日${hour}:${minute}:${second}`;
  }

  return new Intl.DateTimeFormat(normalizedLocale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatUpdatedAt(date: Date, locale: string) {
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const diffMs = Date.now() - date.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const normalizedLocale = locale || "en-US";

  if (Math.abs(diffMs) <= dayMs) {
    const formatter = new Intl.RelativeTimeFormat(normalizedLocale, {
      numeric: "auto",
    });
    const absSeconds = Math.abs(Math.round(diffMs / 1000));

    if (absSeconds < 60) {
      return formatter.format(-Math.round(diffMs / 1000), "second");
    }

    if (absSeconds < 3600) {
      return formatter.format(-Math.round(diffMs / (60 * 1000)), "minute");
    }

    return formatter.format(-Math.round(diffMs / (60 * 60 * 1000)), "hour");
  }

  return formatAbsoluteDate(date, normalizedLocale);
}

export function EditorTopToolbar({ pageId, editable }: EditorTopToolbarProps) {
  const { i18n, t } = useTranslation();
  const pageEditor = useAtomValue(pageEditorAtom);
  const [documentCharCount, setDocumentCharCount] = useState(0);
  const [relativeUpdatedAt, setRelativeUpdatedAt] = useState("");
  const { data: currentPage } = usePageQuery({ pageId: pageId ?? "" });
  const { data: latestPageHistory } = useLatestPageHistoryQuery(
    currentPage?.id || pageId || "",
  );
  const sourceUpdatedAt = latestPageHistory?.createdAt ?? currentPage?.updatedAt;
  const sourceUpdatedAtTimestamp = sourceUpdatedAt
    ? new Date(sourceUpdatedAt).getTime()
    : NaN;

  const editorIsEditable = useEditorState({
    editor: pageEditor,
    selector: (ctx) => ctx.editor?.isEditable ?? false,
  });

  const showToolbar =
    Boolean(pageEditor) &&
    !pageEditor?.isDestroyed &&
    Boolean(editorIsEditable) &&
    editable;

  useEffect(() => {
    if (!pageEditor) {
      setDocumentCharCount(0);
      return;
    }

    const updateDocumentCharCount = () => {
      const count = pageEditor.storage?.characterCount?.characters?.();
      if (typeof count === "number") {
        setDocumentCharCount(count);
      }
    };

    updateDocumentCharCount();
    pageEditor.on("update", updateDocumentCharCount);

    return () => {
      pageEditor.off("update", updateDocumentCharCount);
    };
  }, [pageEditor]);

  useEffect(() => {
    if (Number.isNaN(sourceUpdatedAtTimestamp)) {
      setRelativeUpdatedAt("");
      return;
    }

    const updateLabel = () => {
      setRelativeUpdatedAt(
        formatUpdatedAt(new Date(sourceUpdatedAtTimestamp), i18n.language),
      );
    };

    updateLabel();
    const timer = setInterval(updateLabel, 60 * 1000);
    return () => clearInterval(timer);
  }, [i18n.language, sourceUpdatedAtTimestamp]);

  if (!showToolbar && !relativeUpdatedAt && documentCharCount === 0) {
    return null;
  }

  return (
    <div className={classes.topToolbar} id="page-toolbar-anchor">
      <div className={classes.scrollViewport}>
        <div
          className={clsx(classes.toolbarRail, {
            [classes.metaOnlyRail]: !showToolbar,
          })}
        >
          {showToolbar && (
            <div className={classes.toolbarTrack}>
              <EditorStickyToolbar editor={pageEditor} />
            </div>
          )}

          <Group
            gap={6}
            wrap="nowrap"
            className={clsx(classes.meta, {
              [classes.metaNoDivider]: !showToolbar,
            })}
          >
            <Text size="xs" c="dimmed" className={classes.metaItem}>
              {t("Character count: {{characterCount}}", {
                characterCount: documentCharCount,
              })}
            </Text>

            {relativeUpdatedAt && (
              <>
                <Text size="xs" c="dimmed" className={classes.separator}>
                  |
                </Text>
                <Text size="xs" c="dimmed" className={classes.metaItem}>
                  {relativeUpdatedAt}
                </Text>
              </>
            )}
          </Group>
        </div>
      </div>
    </div>
  );
}
