import { ActionIcon, Group, Loader, Menu, Text, ThemeIcon, Tooltip } from "@mantine/core";
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
  IconWifi,
  IconWifiOff,
  IconWorld,
} from "@tabler/icons-react";
import React, { Suspense, useEffect, useRef, useState } from "react";
import useToggleAside from "@/hooks/use-toggle-aside.tsx";
import { useAsideTriggerProps } from "@/hooks/use-toggle-aside.tsx";
import { useAtom, useAtomValue } from "jotai";
import { historyAtoms } from "@/features/page-history/atoms/history-atoms.ts";
import { useDisclosure, useHotkeys } from "@mantine/hooks";
import { useClipboard } from "@/hooks/use-clipboard";
import { useNavigate, useParams } from "react-router-dom";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { notifications } from "@mantine/notifications";
import { getAppUrl, isCollaborationEnabled } from "@/lib/config.ts";
import APP_ROUTE from "@/lib/app-route.ts";
import { extractPageSlugId } from "@/lib";
import { useTreeMutation } from "@/features/page/tree/hooks/use-tree-mutation.ts";
import { useDeletePageModal } from "@/features/page/hooks/use-delete-page-modal.tsx";
import { PageWidthToggle } from "@/features/user/components/page-width-pref.tsx";
import { Trans, useTranslation } from "react-i18next";
import {
  pageEditorAtom,
  pageEditorCollaborationStatusAtom,
  readOnlyEditorAtom,
} from "@/features/editor/atoms/editor-atoms.ts";
import { formattedDate } from "@/lib/time.ts";
import { PageStateSegmentedControl } from "@/features/user/components/page-state-pref.tsx";
import { EditorFontSizeSegmentedControl } from "@/features/editor/components/editor-font-size-control.tsx";
import { PageEditModeToggle } from "@/features/user/components/page-state-pref.tsx";
import { useTimeAgo } from "@/hooks/use-time-ago.tsx";
import { IPage } from "@/features/page/types/page.types.ts";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom.ts";
import { canUseStaticRenderedHtml } from "@/features/share/rendered-utils.ts";

const LazyExportModal = React.lazy(
  () => import("@/components/common/export-modal"),
);
const LazyMovePageModal = React.lazy(
  () => import("@/features/page/components/move-page-modal.tsx"),
);
const LazyMoveToModal = React.lazy(
  () => import("@/features/page/components/move-to-modal.tsx"),
);
const LazyShareMenuContent = React.lazy(async () => {
  const module = await import("@/features/share/components/share-modal.tsx");

  return { default: module.ShareMenuContent };
});

interface PageHeaderMenuProps {
  readOnly?: boolean;
  pageId?: string;
  page: IPage;
}
export default function PageHeaderMenu({
  readOnly,
  pageId,
  page,
}: PageHeaderMenuProps) {
  const { t } = useTranslation();
  const isDeleted = !!page?.deletedAt;

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

  if (isDeleted) {
    return null;
  }

  return (
    <Group wrap="nowrap" gap={14}>
      <HeaderMeta page={page} pageId={pageId} />
      <CollaborationStatusIndicator readOnly={readOnly} />

      {!readOnly && <PageStateSegmentedControl size="xs" />}
      <EditorFontSizeSegmentedControl size="xs" />

      <PageActionMenu readOnly={readOnly} page={page} />
    </Group>
  );
}

function getCharacterCountFromText(text?: string | null) {
  if (!text) {
    return 0;
  }

  return text.replace(/\s+/g, "").length;
}

function getWordCountFromText(text?: string | null) {
  if (!text) {
    return 0;
  }

  const normalized = text.trim();
  if (!normalized) {
    return 0;
  }

  const cjkMatches = normalized.match(/[㐀-鿿豈-﫿]/g) ?? [];
  const remainingText = normalized.replace(
    /[㐀-鿿豈-﫿]/g,
    " ",
  );
  const wordMatches = remainingText.match(/[^\s]+/g) ?? [];

  return cjkMatches.length + wordMatches.length;
}

interface PageActionMenuProps {
  readOnly?: boolean;
  page: IPage;
}
function PageActionMenu({ readOnly, page }: PageActionMenuProps) {
  const { t } = useTranslation();
  const toggleAside = useToggleAside();
  const [, setHistoryModalOpen] = useAtom(historyAtoms);
  const clipboard = useClipboard({ timeout: 500 });
  const { spaceSlug } = useParams();
  const currentPage = page;
  const { openDeleteModal } = useDeletePageModal();
  const { handleDelete } = useTreeMutation(page?.spaceId ?? "");
  const [exportOpened, { open: openExportModal, close: closeExportModal }] =
    useDisclosure(false);
  const [
    movePageModalOpened,
    { open: openMovePageModal, close: closeMoveSpaceModal },
  ] = useDisclosure(false);
  const [
    moveToModalOpened,
    { open: openMoveToModal, close: closeMoveToModal },
  ] = useDisclosure(false);
  const [menuOpened, setMenuOpened] = useState(false);
  const [shareExpanded, setShareExpanded] = useState(false);
  const pageEditor = useAtomValue(pageEditorAtom);
  const readOnlyEditor = useAtomValue(readOnlyEditorAtom);
  const activeEditor =
    pageEditor && !pageEditor.isDestroyed
      ? pageEditor
      : readOnlyEditor && !readOnlyEditor.isDestroyed
        ? readOnlyEditor
        : null;
  const pageUpdatedAt = useTimeAgo(currentPage?.updatedAt ?? null);

  if (!currentPage) {
    return null;
  }

  const handleCopyLink = () => {
    const pageUrl =
      getAppUrl() +
      buildPageUrl(spaceSlug, currentPage.slugId, currentPage.title);

    clipboard.copy(pageUrl);
    notifications.show({ message: t("Link copied") });
  };

  const handleCopyAsMarkdown = async () => {
    const staticHtml =
      currentPage.rendered?.deliveryMode === "full" &&
      canUseStaticRenderedHtml(currentPage.rendered)
        ? (currentPage.rendered.html ?? currentPage.rendered.headHtml ?? "")
        : "";
    const html = activeEditor ? activeEditor.getHTML() : staticHtml;

    if (!html) return;

    const { htmlToMarkdown } = await import("@docmost/editor-ext");
    const markdown = htmlToMarkdown(html);
    const title = currentPage.title ? `# ${currentPage.title}\n\n` : "";
    clipboard.copy(`${title}${markdown}`);
    notifications.show({ message: t("Copied") });
  };

  const handlePrint = () => {
    window.open(`/print/${currentPage.id}`, "_blank");
  };

  const openHistoryModal = () => {
    setHistoryModalOpen(true);
  };

  const handleDeletePage = () => {
    openDeleteModal({ onConfirm: () => handleDelete(page.id) });
  };

  const wordCount =
    activeEditor?.storage?.characterCount?.words?.() ??
    getWordCountFromText(currentPage.textContent);
  const canCopyAsMarkdown = Boolean(
    activeEditor ||
    (currentPage.rendered?.deliveryMode === "full" &&
      canUseStaticRenderedHtml(currentPage.rendered)),
  );

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
          <ActionIcon
            variant="subtle"
            color="dark"
            aria-label={t("Page actions")}
          >
            <IconDots size={20} />
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
              <Suspense
                fallback={
                  <Text size="xs" c="dimmed">
                    {t("Loading...")}
                  </Text>
                }
              >
                <LazyShareMenuContent readOnly={readOnly} />
              </Suspense>
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
            disabled={!canCopyAsMarkdown}
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
            <>
              <Menu.Item
                leftSection={<IconArrowRight size={16} />}
                onClick={openMoveToModal}
              >
                {t("Move to...")}
              </Menu.Item>
              <Menu.Item
                leftSection={<IconArrowRight size={16} />}
                onClick={openMovePageModal}
              >
                {t("Move to space")}
              </Menu.Item>
            </>
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
            {t("Print")}
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
                  name:
                    currentPage.lastUpdatedBy?.name ??
                    currentPage.creator?.name ??
                    "-",
                  time: pageUpdatedAt,
                })}
                position="left-start"
              >
                <div style={{ width: 210 }}>
                  <Text size="xs" c="dimmed" truncate="end">
                    {t("Word count: {{wordCount}}", {
                      wordCount,
                    })}
                  </Text>

                  <Text size="xs" c="dimmed" lineClamp={1}>
                    <Trans
                      defaults="Created by: <b>{{creatorName}}</b>"
                      values={{ creatorName: currentPage?.creator?.name }}
                      components={{ b: <Text span fw={500} /> }}
                    />
                  </Text>
                  <Text size="xs" c="dimmed" truncate="end">
                    {t("Created at: {{time}}", {
                      time: formattedDate(currentPage.createdAt),
                    })}
                  </Text>
                </div>
              </Tooltip>
            </Group>
          </>
        </Menu.Dropdown>
      </Menu>

      {exportOpened && (
        <Suspense fallback={null}>
          <LazyExportModal
            type="page"
            id={currentPage.id}
            open={exportOpened}
            onClose={closeExportModal}
          />
        </Suspense>
      )}

      {movePageModalOpened && (
        <Suspense fallback={null}>
          <LazyMovePageModal
            pageId={currentPage.id}
            slugId={currentPage.slugId}
            currentSpaceSlug={spaceSlug}
            onClose={closeMoveSpaceModal}
            open={movePageModalOpened}
          />
        </Suspense>
      )}

      {moveToModalOpened && (
        <Suspense fallback={null}>
          <LazyMoveToModal
            pageId={currentPage.id}
            pageTitle={currentPage.title}
            pageNodeType={currentPage.nodeType === "folder" ? "folder" : "file"}
            currentSpaceId={currentPage.spaceId}
            slugId={currentPage.slugId}
            recentScopeId={currentPage.workspaceId}
            onClose={closeMoveToModal}
            open={moveToModalOpened}
          />
        </Suspense>
      )}
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

function HeaderMeta({ page, pageId }: { page: IPage; pageId?: string }) {
  const { t, i18n } = useTranslation();
  const [documentCharCount, setDocumentCharCount] = useState(0);
  const [relativeUpdatedAt, setRelativeUpdatedAt] = useState("");
  const pageEditor = useAtomValue(pageEditorAtom);
  const readOnlyEditor = useAtomValue(readOnlyEditorAtom);
  const activeEditor =
    pageEditor && !pageEditor.isDestroyed
      ? pageEditor
      : readOnlyEditor && !readOnlyEditor.isDestroyed
        ? readOnlyEditor
        : null;
  const sourceUpdatedAt = page.updatedAt;
  const sourceUpdatedAtTimestamp = sourceUpdatedAt
    ? new Date(sourceUpdatedAt).getTime()
    : NaN;

  useEffect(() => {
    if (!activeEditor) {
      setDocumentCharCount(getCharacterCountFromText(page.textContent));
      return;
    }

    const updateDocumentCharCount = () => {
      const count = activeEditor.storage?.characterCount?.characters?.();
      if (typeof count === "number") {
        setDocumentCharCount(count);
      }
    };

    updateDocumentCharCount();
    activeEditor.on("update", updateDocumentCharCount);

    return () => {
      activeEditor.off("update", updateDocumentCharCount);
    };
  }, [activeEditor, page.textContent]);

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

function CollaborationStatusIndicator({ readOnly }: { readOnly?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pageEditor = useAtomValue(pageEditorAtom);
  const collaborationStatus = useAtomValue(pageEditorCollaborationStatusAtom);
  const currentUser = useAtomValue(currentUserAtom);
  const hasActivePageEditor = Boolean(pageEditor && !pageEditor.isDestroyed);
  const workspaceCollaborationEnabled =
    currentUser?.workspace?.settings?.collaboration?.enabled !== false;
  const collaborationConfiguredOff =
    !isCollaborationEnabled() || !workspaceCollaborationEnabled;

  if (readOnly) return null;

  if (!hasActivePageEditor && !collaborationConfiguredOff) {
    return null;
  }

  const effectiveStatus =
    !hasActivePageEditor && collaborationConfiguredOff
      ? "disabled"
      : collaborationStatus;

  const statusConfig = {
    connected: {
      label: t("Live collaboration is connected"),
      color: "teal",
      icon: <IconWifi size={18} stroke={1.75} />,
    },
    connecting: {
      label: t("Connecting live collaboration"),
      color: "blue",
      icon: <Loader size={14} />,
    },
    reconnecting: {
      label: t("Live collaboration connection lost. Retrying..."),
      color: "red",
      icon: <IconWifiOff size={18} stroke={1.75} />,
    },
    local: {
      label: t("Collaboration is unavailable. Saving changes locally."),
      color: "yellow.7",
      icon: <IconWifiOff size={18} stroke={1.75} />,
    },
    disabled: {
      label: t("Live collaboration is off. Changes are saved locally."),
      color: "gray",
      icon: <IconWifiOff size={18} stroke={1.75} />,
    },
    error: {
      label: t("Live collaboration is unavailable"),
      color: "red",
      icon: <IconWifiOff size={18} stroke={1.75} />,
    },
  }[effectiveStatus];

  if (!statusConfig) {
    return null;
  }

  const tooltipLabel = `${statusConfig.label}. ${t(
    "Click to open Workspace settings.",
  )}`;

  return (
    <Tooltip label={tooltipLabel} openDelay={250} withArrow>
      <ActionIcon
        variant="subtle"
        c={statusConfig.color}
        aria-label={tooltipLabel}
        onClick={() => navigate(APP_ROUTE.SETTINGS.WORKSPACE.GENERAL)}
      >
        {statusConfig.icon}
      </ActionIcon>
    </Tooltip>
  );
}
