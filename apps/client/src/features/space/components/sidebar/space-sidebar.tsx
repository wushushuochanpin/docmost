import { ActionIcon, Group, Menu, Tooltip } from "@mantine/core";
import {
  IconArrowDown,
  IconDots,
  IconFileExport,
  IconFolder,
  IconLayoutGrid,
  IconList,
  IconSettings,
  IconStar,
  IconStarFilled,
  IconTemplate,
  IconTrash,
} from "@tabler/icons-react";
import classes from "./space-sidebar.module.css";
import React, { useCallback, useState } from "react";
import { useAtom } from "jotai";
import { useTreeMutation } from "@/features/page/tree/hooks/use-tree-mutation.ts";
import { Link, useLocation, useParams } from "react-router-dom";
import clsx from "clsx";
import { useDisclosure } from "@mantine/hooks";
import SpaceSettingsModal from "@/features/space/components/settings-modal.tsx";
import { useGetSpaceBySlugQuery } from "@/features/space/queries/space-query.ts";
import SpaceTree from "@/features/page/tree/components/space-tree.tsx";
import { SidebarViewTabs } from "@/features/page/tree/components/sidebar-view-tabs";
import { RecentVisitsRail } from "@/features/page/tree/components/recent-visits-rail";
import type { SidebarViewSelection } from "@/features/page/tree/components/sidebar-view-tabs";
import type { SidebarViewMode } from "@/features/page/types/page.types";
import { useSpaceAbility } from "@/features/space/permissions/use-space-ability.ts";
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from "@/features/space/permissions/permissions.type.ts";
import PageImportModal from "@/features/page/components/page-import-modal.tsx";
import { useTranslation } from "react-i18next";
import { SwitchSpace } from "./switch-space";
import ExportModal from "@/components/common/export-modal";
import {
  useFavoriteIds,
  useAddFavoriteMutation,
  useRemoveFavoriteMutation,
} from "@/features/favorite/queries/favorite-query";
import { mobileSidebarAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom.ts";
import { useToggleSidebar } from "@/components/layouts/global/hooks/hooks/use-toggle-sidebar.ts";
import { searchSpotlight } from "@/features/search/constants";
import TemplatePickerModal from "@/ee/template/components/template-picker-modal";
import { useHasFeature } from "@/ee/hooks/use-feature";
import { useUpgradeLabel } from "@/ee/hooks/use-upgrade-label";
import { Feature } from "@/ee/features";
import { ErrorBoundary } from "react-error-boundary";

const SIDEBAR_VIEW_STORAGE_PREFIX = "docmost:sidebar-view:";
const SIDEBAR_LAYOUT_STORAGE_PREFIX = "docmost:sidebar-layout:";

type SidebarLayoutMode = "list" | "grid";

function readStoredSidebarView(spaceId: string): SidebarViewMode {
  try {
    const stored = localStorage.getItem(SIDEBAR_VIEW_STORAGE_PREFIX + spaceId);
    return stored === "pinned" ? "pinned" : "all";
  } catch {
    return "all";
  }
}

function readStoredSidebarLayout(spaceId: string): SidebarLayoutMode {
  try {
    const stored = localStorage.getItem(SIDEBAR_LAYOUT_STORAGE_PREFIX + spaceId);
    return stored === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}

export function SpaceSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const [opened, { open: openSettings, close: closeSettings }] =
    useDisclosure(false);

  const { spaceSlug } = useParams();
  const { data: space } = useGetSpaceBySlugQuery(spaceSlug);

  const spaceRules = space?.membership?.permissions;
  const spaceAbility = useSpaceAbility(spaceRules);
  const { handleCreate } = useTreeMutation(space?.id ?? "");

  const [sidebarView, setSidebarView] = useState<SidebarViewMode>(() =>
    space?.id ? readStoredSidebarView(space.id) : "all",
  );
  const [sidebarLayout, setSidebarLayout] = useState<SidebarLayoutMode>(() =>
    space?.id ? readStoredSidebarLayout(space.id) : "list",
  );

  // When switching spaces, adopt the stored view for that space (or default
  // back to "all"). The lazy initializer above only runs on first mount, so
  // sync here too.
  React.useEffect(() => {
    if (space?.id) {
      setSidebarView(readStoredSidebarView(space.id));
      setSidebarLayout(readStoredSidebarLayout(space.id));
    }
  }, [space?.id]);

  const toggleLayout = useCallback(() => {
    setSidebarLayout((prev) => {
      const next: SidebarLayoutMode = prev === "grid" ? "list" : "grid";
      if (space?.id) {
        try {
          localStorage.setItem(
            SIDEBAR_LAYOUT_STORAGE_PREFIX + space.id,
            next,
          );
        } catch {
          // ignore
        }
      }
      return next;
    });
  }, [space?.id]);

  const handleViewChange = useCallback(
    (selection: SidebarViewSelection) => {
      // Categories are not wired into the sidebar yet; treat them as "all".
      const next: SidebarViewMode =
        selection.viewMode === "pinned" ? "pinned" : "all";
      setSidebarView(next);
      if (space?.id) {
        try {
          localStorage.setItem(
            SIDEBAR_VIEW_STORAGE_PREFIX + space.id,
            next,
          );
        } catch {
          // localStorage unavailable — view resets on reload, which is fine.
        }
      }
    },
    [space?.id],
  );

  if (!space) {
    return <></>;
  }

  function handleCreateFolder() {
    handleCreate(null, { nodeType: "folder" });
  }

  const canManagePages = spaceAbility.can(
    SpaceCaslAction.Manage,
    SpaceCaslSubject.Page,
  );

  return (
    <>
      <div className={classes.navbar}>
        <div
          className={classes.section}
          style={{
            border: "none",
            marginTop: 2,
            marginBottom: 3,
          }}
        >
          <SwitchSpace
            spaceName={space?.name}
            spaceSlug={space?.slug}
            spaceIcon={space?.logo}
          />
        </div>

        <div className={clsx(classes.section, classes.sectionPages)}>
          <div className={clsx(classes.pagesHeader, classes.pagesHeaderTabs)}>
            <div className={classes.tabsSpacer}>
              <SidebarViewTabs
                categories={[]}
                value={sidebarView}
                canManageCategories={false}
                onChange={handleViewChange}
              />
            </div>

            {canManagePages && (
              <Group gap="xs" className={classes.headerActions}>
                {sidebarView === "all" && (
                  <Tooltip
                    label={
                      sidebarLayout === "grid"
                        ? t("Switch to list")
                        : t("Switch to grid")
                    }
                    withArrow
                    position="top"
                  >
                    <ActionIcon
                      variant="subtle"
                      size={20}
                      onClick={toggleLayout}
                      aria-label={t("Toggle layout")}
                    >
                      {sidebarLayout === "grid" ? (
                        <IconList size={16} stroke={1.75} />
                      ) : (
                        <IconLayoutGrid size={16} stroke={1.75} />
                      )}
                    </ActionIcon>
                  </Tooltip>
                )}

                <SpaceMenu
                  spaceId={space.id}
                  canManagePages={canManagePages}
                  onSpaceSettings={openSettings}
                />

                <Tooltip label={t("Create folder")} withArrow position="right">
                  <ActionIcon
                    variant="subtle"
                    size={20}
                    onClick={handleCreateFolder}
                    aria-label={t("Create folder")}
                  >
                    <IconFolder size={16} stroke={1.75} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            )}
          </div>

          <div className={classes.pages}>
            <SpaceTree
              spaceId={space.id}
              readOnly={!canManagePages}
              viewMode={sidebarView}
              layoutMode={sidebarLayout}
            />
            <RecentVisitsRail spaceId={space.id} />
          </div>
        </div>
      </div>

      <SpaceSettingsModal
        opened={opened}
        onClose={closeSettings}
        spaceId={space?.slug}
      />
    </>
  );
}

interface SpaceMenuProps {
  spaceId: string;
  canManagePages: boolean;
  onSpaceSettings: () => void;
}
function SpaceMenu({
  spaceId,
  canManagePages,
  onSpaceSettings,
}: SpaceMenuProps) {
  const { t } = useTranslation();
  const { spaceSlug } = useParams();
  const [importOpened, { open: openImportModal, close: closeImportModal }] =
    useDisclosure(false);
  const [exportOpened, { open: openExportModal, close: closeExportModal }] =
    useDisclosure(false);
  const [
    templatePickerOpened,
    { open: openTemplatePicker, close: closeTemplatePicker },
  ] = useDisclosure(false);
  const hasTemplates = useHasFeature(Feature.TEMPLATES);
  const upgradeLabel = useUpgradeLabel();

  const favoriteIds = useFavoriteIds("space");
  const addFavoriteMutation = useAddFavoriteMutation();
  const removeFavoriteMutation = useRemoveFavoriteMutation();
  const isFavorited = favoriteIds.has(spaceId);

  const handleToggleFavorite = () => {
    const params = { type: "space" as const, spaceId };
    if (isFavorited) {
      removeFavoriteMutation.mutate(params);
    } else {
      addFavoriteMutation.mutate(params);
    }
  };

  return (
    <>
      <Menu width={200} shadow="md" withArrow>
        <Menu.Target>
          <Tooltip
            label={t("Import pages & space settings")}
            withArrow
            position="top"
          >
            <ActionIcon variant="subtle" size={20} aria-label={t("Space menu")}>
              <IconDots size={16} stroke={1.75} />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>

        <Menu.Dropdown>
          <Menu.Item
            onClick={handleToggleFavorite}
            leftSection={
              isFavorited ? (
                <IconStarFilled
                  size={16}
                  color="var(--mantine-color-yellow-filled)"
                />
              ) : (
                <IconStar size={16} />
              )
            }
          >
            {isFavorited ? t("Remove from favorites") : t("Add to favorites")}
          </Menu.Item>

          {canManagePages && (
            <>
              <Menu.Divider />
              <Tooltip
                label={upgradeLabel}
                disabled={hasTemplates}
                position="right"
                withArrow
              >
                <Menu.Item
                  onClick={hasTemplates ? openTemplatePicker : undefined}
                  leftSection={<IconTemplate size={16} />}
                  data-disabled={!hasTemplates || undefined}
                  aria-disabled={!hasTemplates || undefined}
                >
                  {t("Templates")}
                </Menu.Item>
              </Tooltip>
            </>
          )}

          {canManagePages && (
            <>
              <Menu.Divider />

              <Menu.Item
                onClick={openImportModal}
                leftSection={<IconArrowDown size={16} />}
              >
                {t("Import pages")}
              </Menu.Item>

              <Menu.Item
                onClick={openExportModal}
                leftSection={<IconFileExport size={16} />}
              >
                {t("Export space")}
              </Menu.Item>

              <Menu.Divider />

              <Menu.Item
                onClick={onSpaceSettings}
                leftSection={<IconSettings size={16} />}
              >
                {t("Space settings")}
              </Menu.Item>

              <Menu.Item
                component={Link}
                to={`/s/${spaceSlug}/trash`}
                leftSection={<IconTrash size={16} />}
              >
                {t("Trash")}
              </Menu.Item>
            </>
          )}
        </Menu.Dropdown>
      </Menu>

      {canManagePages && (
        <>
          <PageImportModal
            spaceId={spaceId}
            open={importOpened}
            onClose={closeImportModal}
          />

          <ExportModal
            type="space"
            id={spaceId}
            open={exportOpened}
            onClose={closeExportModal}
          />
        </>
      )}

      {hasTemplates && templatePickerOpened && (
        <ErrorBoundary fallbackRender={() => null}>
          <TemplatePickerModal
            opened={templatePickerOpened}
            onClose={closeTemplatePicker}
            initialSpaceId={spaceId}
          />
        </ErrorBoundary>
      )}
    </>
  );
}
