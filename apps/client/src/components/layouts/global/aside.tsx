import { ActionIcon, Box, Group, ScrollArea, Text } from "@mantine/core";
import CommentListWithTabs from "@/features/comment/components/comment-list-with-tabs.tsx";
import React, { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { TableOfContents } from "@/features/editor/components/table-of-contents/table-of-contents.tsx";
import { useAtomValue } from "jotai";
import {
  pageEditorAtom,
  readOnlyEditorAtom,
} from "@/features/editor/atoms/editor-atoms.ts";
import { IconX } from "@tabler/icons-react";
import { pageStaticTocAtom } from "@/features/page/atoms/page-static-render-atom.ts";
import StaticTableOfContents from "@/features/share/components/static-table-of-contents.tsx";

type AsideTab = "comments" | "toc";

interface AsideProps {
  tab: AsideTab;
  onClose: () => void;
}

export default function Aside({ tab, onClose }: AsideProps) {
  const { t } = useTranslation();
  const pageEditor = useAtomValue(pageEditorAtom);
  const readOnlyEditor = useAtomValue(readOnlyEditorAtom);
  const pageStaticToc = useAtomValue(pageStaticTocAtom);
  const activeEditor =
    pageEditor && !pageEditor.isDestroyed
      ? pageEditor
      : readOnlyEditor && !readOnlyEditor.isDestroyed
        ? readOnlyEditor
        : null;
  const isTocTab = tab === "toc";

  let title: string;
  let content: ReactNode;

  switch (tab) {
    case "comments":
      content = <CommentListWithTabs />;
      title = "Comments";
      break;
    case "toc":
      content =
        activeEditor ? (
          <TableOfContents editor={activeEditor} />
        ) : pageStaticToc.length ? (
          <StaticTableOfContents items={pageStaticToc} />
        ) : (
          <Text size="sm" c="dimmed">
            {t("Editor is loading...")}
          </Text>
        );
      title = "Table of contents";
      break;
    default:
      content = null;
      title = "";
  }

  return (
    <Box p={isTocTab ? 0 : "md"}>
      {!isTocTab && (
        <Group justify="space-between" align="center" mb="md" wrap="nowrap">
          <Text fw={500}>{t(title)}</Text>
          <ActionIcon
            variant="subtle"
            aria-label={t("Close panel")}
            onClick={onClose}
          >
            <IconX size={18} stroke={1.75} />
          </ActionIcon>
        </Group>
      )}

      {isTocTab ? (
        <ScrollArea
          style={{ height: "calc(100vh - 90px)" }}
          scrollbarSize={5}
          type="auto"
        >
          <div
            style={{
              minWidth: "max-content",
              paddingInline: "12px",
              paddingTop: "8px",
              paddingBottom: "200px",
            }}
          >
            {content}
          </div>
        </ScrollArea>
      ) : (
        <div
          style={{
            height: "calc(100vh - 150px)",
            overflowY: "auto",
            overflowX: "auto",
          }}
        >
          <div style={{ minWidth: "max-content", paddingBottom: "200px" }}>
            {content}
          </div>
        </div>
      )}
    </Box>
  );
}
