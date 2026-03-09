import {
  ActionIcon,
  Group,
  Menu,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconArrowRight,
  IconArrowsHorizontal,
  IconChevronDown,
  IconChevronUp,
  IconDots,
  IconFileExport,
  IconHistory,
  IconLink,
  IconMarkdown,
  IconMessage,
  IconPrinter,
  IconTrash,
  IconWifiOff,
  IconWorld,
} from "@tabler/icons-react";
import React, { useEffect, useRef, useState } from "react";
import useToggleAside from "@/hooks/use-toggle-aside.tsx";
import { useAtom, useAtomValue } from "jotai";
import { historyAtoms } from "@/features/page-history/atoms/history-atoms.ts";
import { useDisclosure, useHotkeys } from "@mantine/hooks";
import { useClipboard } from "@/hooks/use-clipboard";
import { useParams } from "react-router-dom";
import { usePageQuery } from "@/features/page/queries/page-query.ts";
import { useLatestPageHistoryQuery } from "@/features/page-history/queries/page-history-query.ts";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { notifications } from "@mantine/notifications";
import { getAppUrl } from "@/lib/config.ts";
import { extractPageSlugId } from "@/lib";
import { treeApiAtom } from "@/features/page/tree/atoms/tree-api-atom.ts";
import { useDeletePageModal } from "@/features/page/hooks/use-delete-page-modal.tsx";
import { PageWidthToggle } from "@/features/user/components/page-width-pref.tsx";
import { Trans, useTranslation } from "react-i18next";
import ExportModal from "@/components/common/export-modal";
import { htmlToMarkdown } from "@docmost/editor-ext";
import {
  pageEditorAtom,
  yjsConnectionStatusAtom,
} from "@/features/editor/atoms/editor-atoms.ts";
import { formattedDate } from "@/lib/time.ts";
import { PageStateSegmentedControl } from "@/features/user/components/page-state-pref.tsx";
import { EditorFontSizeSegmentedControl } from "@/features/editor/components/editor-font-size-control.tsx";
import MovePageModal from "@/features/page/components/move-page-modal.tsx";
import { useTimeAgo } from "@/hooks/use-time-ago.tsx";
import { ShareMenuContent } from "@/features/share/components/share-modal.tsx";

interface PageHeaderMenuProps {
  readOnly?: boolean;
  pageId?: string;
}
export default function PageHeaderMenu({
  readOnly,
  pageId,
}: PageHeaderMenuProps) {
  useHotkeys(
    [
      [
        "mod+F",
        () => {
          const event = new CustomEvent("openFindDialogFromEditor", {});
          document.dispatchEvent(event);
        },
      ],
      [
        "Escape",
        () => {
          const event = new CustomEvent("closeFindDialogFromEditor", {});
          document.dispatchEvent(event);
        },
        { preventDefault: false },
      ],
    ],
    [],
  );

  return (
    <Group wrap="nowrap" gap={14}>
      <HeaderMeta pageId={pageId} />
      <ConnectionWarning />

      {!readOnly && <PageStateSegmentedControl size="xs" />}
      <EditorFontSizeSegmentedControl size="xs" />

      <PageActionMenu readOnly={readOnly} pageId={pageId} />
    </Group>
  );
}

interface PageActionMenuProps {
  readOnly?: boolean;
  pageId?: string;
}
function PageActionMenu({ readOnly, pageId }: PageActionMenuProps) {
  const { t } = useTranslation();
  const toggleAside = useToggleAside();
  const [, setHistoryModalOpen] = useAtom(historyAtoms);
  const clipboard = useClipboard({ timeout: 500 });
  const { pageSlug, spaceSlug } = useParams();
  const resolvedPageId = pageId ?? extractPageSlugId(pageSlug);
  const { data: page } = usePageQuery({
    pageId: resolvedPageId,
  });
  const { openDeleteModal } = useDeletePageModal();
  const [tree] = useAtom(treeApiAtom);
  const [exportOpened, { open: openExportModal, close: closeExportModal }] =
    useDisclosure(false);
  const [
    movePageModalOpened,
    { open: openMovePageModal, close: closeMoveSpaceModal },
  ] = useDisclosure(false);
  const [menuOpened, setMenuOpened] = useState(false);
  const [shareExpanded, setShareExpanded] = useState(false);
  const [pageEditor] = useAtom(pageEditorAtom);
  const pageUpdatedAt = useTimeAgo(page?.updatedAt ?? null);

  if (!page) {
    return null;
  }

  const handleCopyLink = () => {
    const pageUrl =
      getAppUrl() + buildPageUrl(spaceSlug, page.slugId, page.title);

    clipboard.copy(pageUrl);
    notifications.show({ message: t("Link copied") });
  };

  const handleCopyAsMarkdown = () => {
    if (!pageEditor) return;
    const html = pageEditor.getHTML();
    const markdown = htmlToMarkdown(html);
    const title = page?.title ? `# ${page.title}\n\n` : "";
    clipboard.copy(`${title}${markdown}`);
    notifications.show({ message: t("Copied") });
  };

  const handlePrint = () => {
    setTimeout(() => {
      window.print();
    }, 250);
  };

  const openHistoryModal = () => {
    setHistoryModalOpen(true);
  };

  const handleDeletePage = () => {
    openDeleteModal({ onConfirm: () => tree?.delete(page.id) });
  };

  const toggleSharePanel = () => {
    setShareExpanded((previous) => !previous);
  };

  return (
    <>
      <Menu
        shadow="xl"
        position="bottom-end"
        offset={20}
        width={360}
        withArrow
        arrowPosition="center"
        opened={menuOpened}
        onChange={(opened) => {
          setMenuOpened(opened);
          if (!opened) {
            setShareExpanded(false);
          }
        }}
      >
        <Menu.Target>
          <ActionIcon variant="subtle">
            <IconDots size={18} stroke={1.75} />
          </ActionIcon>
        </Menu.Target>

        <Menu.Dropdown>
          <Menu.Item
            leftSection={<IconWorld size={16} />}
            rightSection={
              shareExpanded ? (
                <IconChevronUp size={14} />
              ) : (
                <IconChevronDown size={14} />
              )
            }
            closeMenuOnClick={false}
            onClick={toggleSharePanel}
          >
            {t("Share")}
          </Menu.Item>

          {shareExpanded && (
            <div
              style={{
                padding: "0.25rem 0.75rem 0.75rem",
                borderBottom: "1px solid var(--ui-border-default)",
              }}
            >
              <ShareMenuContent readOnly={readOnly} />
            </div>
          )}

          <Menu.Item
            leftSection={<IconMessage size={16} />}
            onClick={() => toggleAside("comments")}
          >
            {t("Comments")}
          </Menu.Item>

          <Menu.Divider />

          <Menu.Item
            leftSection={<IconLink size={16} />}
            onClick={handleCopyLink}
          >
            {t("Copy link")}
          </Menu.Item>

          <Menu.Item
            leftSection={<IconMarkdown size={16} />}
            onClick={handleCopyAsMarkdown}
          >
            {t("Copy as Markdown")}
          </Menu.Item>
          <Menu.Divider />

          <Menu.Item leftSection={<IconArrowsHorizontal size={16} />}>
            <Group wrap="nowrap">
              <PageWidthToggle label={t("Full width")} />
            </Group>
          </Menu.Item>

          <Menu.Item
            leftSection={<IconHistory size={16} />}
            onClick={openHistoryModal}
          >
            {t("Page history")}
          </Menu.Item>

          <Menu.Divider />

          {!readOnly && (
            <Menu.Item
              leftSection={<IconArrowRight size={16} />}
              onClick={openMovePageModal}
            >
              {t("Move")}
            </Menu.Item>
          )}

          <Menu.Item
            leftSection={<IconFileExport size={16} />}
            onClick={openExportModal}
          >
            {t("Export")}
          </Menu.Item>

          <Menu.Item
            leftSection={<IconPrinter size={16} />}
            onClick={handlePrint}
          >
            {t("Print PDF")}
          </Menu.Item>

          {!readOnly && (
            <>
              <Menu.Divider />
              <Menu.Item
                color={"red"}
                leftSection={<IconTrash size={16} />}
                onClick={handleDeletePage}
              >
                {t("Move to trash")}
              </Menu.Item>
            </>
          )}

          <Menu.Divider />

          <>
            <Group px="sm" wrap="nowrap" style={{ cursor: "pointer" }}>
              <Tooltip
                label={t("Edited by {{name}} {{time}}", {
                  name: page.lastUpdatedBy?.name ?? page.creator?.name ?? "-",
                  time: pageUpdatedAt,
                })}
                position="left-start"
              >
                <div style={{ width: 210 }}>
                  <Text size="xs" c="dimmed" truncate="end">
                    {t("Word count: {{wordCount}}", {
                      wordCount: pageEditor?.storage?.characterCount?.words(),
                    })}
                  </Text>

                  <Text size="xs" c="dimmed" lineClamp={1}>
                    <Trans
                      defaults="Created by: <b>{{creatorName}}</b>"
                      values={{ creatorName: page?.creator?.name }}
                      components={{ b: <Text span fw={500} /> }}
                    />
                  </Text>
                  <Text size="xs" c="dimmed" truncate="end">
                    {t("Created at: {{time}}", {
                      time: formattedDate(page.createdAt),
                    })}
                  </Text>
                </div>
              </Tooltip>
            </Group>
          </>
        </Menu.Dropdown>
      </Menu>

      <ExportModal
        type="page"
        id={page.id}
        open={exportOpened}
        onClose={closeExportModal}
      />

      <MovePageModal
        pageId={page.id}
        slugId={page.slugId}
        currentSpaceSlug={spaceSlug}
        onClose={closeMoveSpaceModal}
        open={movePageModalOpened}
      />
    </>
  );
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

function HeaderMeta({ pageId }: { pageId?: string }) {
  const { t, i18n } = useTranslation();
  const { pageSlug } = useParams();
  const [documentCharCount, setDocumentCharCount] = useState(0);
  const [relativeUpdatedAt, setRelativeUpdatedAt] = useState("");
  const pageEditor = useAtomValue(pageEditorAtom);
  const resolvedPageId = pageId ?? extractPageSlugId(pageSlug);
  const { data: currentPage } = usePageQuery({ pageId: resolvedPageId });
  const { data: latestPageHistory } = useLatestPageHistoryQuery(
    currentPage?.id || resolvedPageId || "",
  );
  const sourceUpdatedAt = latestPageHistory?.createdAt ?? currentPage?.updatedAt;
  const sourceUpdatedAtTimestamp = sourceUpdatedAt
    ? new Date(sourceUpdatedAt).getTime()
    : NaN;

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

  if (!relativeUpdatedAt && documentCharCount === 0) {
    return null;
  }

  return (
    <Group gap={6} wrap="nowrap">
      <Text size="xs" c="dimmed">
        {t("Character count: {{characterCount}}", {
          characterCount: documentCharCount,
        })}
      </Text>
      {relativeUpdatedAt && (
        <>
          <Text size="xs" c="dimmed">
            |
          </Text>
          <Text size="xs" c="dimmed">
            {relativeUpdatedAt}
          </Text>
        </>
      )}
    </Group>
  );
}

function ConnectionWarning() {
  const { t } = useTranslation();
  const yjsConnectionStatus = useAtomValue(yjsConnectionStatusAtom);
  const [showWarning, setShowWarning] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const isDisconnected = ["disconnected", "connecting"].includes(
      yjsConnectionStatus,
    );

    if (isDisconnected) {
      if (!timeoutRef.current) {
        timeoutRef.current = setTimeout(() => setShowWarning(true), 5000);
      }
    } else {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setShowWarning(false);
    }
  }, [yjsConnectionStatus]);

  // Cleanup only on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  if (!showWarning) return null;

  return (
    <Tooltip
      label={t("Real-time editor connection lost. Retrying...")}
      openDelay={250}
      withArrow
    >
      <ActionIcon variant="subtle" c="red">
        <IconWifiOff size={18} stroke={1.75} />
      </ActionIcon>
    </Tooltip>
  );
}
