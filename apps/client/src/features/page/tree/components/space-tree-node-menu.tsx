import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { ActionIcon, Menu, rem } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconArrowRight,
  IconCategory2,
  IconCheck,
  IconCopy,
  IconDotsVertical,
  IconFileExport,
  IconLink,
  IconPin,
  IconPinnedOff,
  IconStar,
  IconStarFilled,
  IconTrash,
} from "@tabler/icons-react";

import ExportModal from "@/components/common/export-modal";
import MovePageModal from "@/features/page/components/move-page-modal.tsx";
import CopyPageModal from "@/features/page/components/copy-page-modal.tsx";
import { useDeletePageModal } from "@/features/page/hooks/use-delete-page-modal.tsx";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import {
  assignSidebarCategory,
  duplicatePage,
  pinPage,
  unpinPage,
} from "@/features/page/services/page-service.ts";
import { invalidateRootSidebarQueries } from "@/features/page/queries/page-query.ts";
import { useClipboard } from "@/hooks/use-clipboard";
import { getAppUrl } from "@/lib/config.ts";
import { useQueryEmit } from "@/features/websocket/use-query-emit.ts";
import {
  useFavoriteIds,
  useAddFavoriteMutation,
  useRemoveFavoriteMutation,
} from "@/features/favorite/queries/favorite-query";
import { useSidebarCategoriesQuery } from "@/features/space/queries/space-query.ts";
import { SidebarCategoryManageModal } from "./sidebar-category-manage-modal.tsx";

import { treeDataAtom } from "@/features/page/tree/atoms/tree-data-atom.ts";
import { treeModel } from "@/features/page/tree/model/tree-model";
import { useTreeMutation } from "@/features/page/tree/hooks/use-tree-mutation.ts";
import type { SpaceTreeNode } from "@/features/page/tree/types.ts";

export interface NodeMenuProps {
  node: SpaceTreeNode;
  canEdit: boolean;
}

export function NodeMenu({ node, canEdit }: NodeMenuProps) {
  const { t } = useTranslation();
  const clipboard = useClipboard({ timeout: 500 });
  const { spaceSlug } = useParams();
  const { openDeleteModal } = useDeletePageModal();
  const { handleDelete } = useTreeMutation(node.spaceId);
  const [data, setData] = useAtom(treeDataAtom);
  const emit = useQueryEmit();
  const [exportOpened, { open: openExportModal, close: closeExportModal }] =
    useDisclosure(false);
  const [
    movePageModalOpened,
    { open: openMovePageModal, close: closeMoveSpaceModal },
  ] = useDisclosure(false);
  const [
    copyPageModalOpened,
    { open: openCopyPageModal, close: closeCopySpaceModal },
  ] = useDisclosure(false);
  const [
    categoryModalOpened,
    { open: openCategoryModal, close: closeCategoryModal },
  ] = useDisclosure(false);
  const favoriteIds = useFavoriteIds("page", node.spaceId);
  const addFavorite = useAddFavoriteMutation();
  const removeFavorite = useRemoveFavoriteMutation();
  const isFavorited = favoriteIds.has(node.id);
  const { data: categoriesData } = useSidebarCategoriesQuery(node.spaceId);
  const sidebarCategories = categoriesData ?? [];

  const handleTogglePin = async () => {
    try {
      const result = node.isPinned
        ? await unpinPage(node.id)
        : await pinPage(node.id);
      setData((prev) =>
        treeModel.update(prev, node.id, {
          isPinned: result.isPinned,
          pinnedAt: result.pinnedAt,
        } as Partial<SpaceTreeNode>),
      );
      invalidateRootSidebarQueries(node.spaceId);
      notifications.show({
        message: result.isPinned ? t("Pinned") : t("Unpinned"),
      });
    } catch (err: any) {
      notifications.show({
        message: err?.response?.data?.message || t("Failed to update pin status"),
        color: "red",
      });
    }
  };

  const handleAssignCategory = async (categoryId: string | null) => {
    try {
      const result = await assignSidebarCategory({ pageId: node.id, categoryId });
      setData((prev) =>
        treeModel.update(prev, node.id, {
          sidebarCategoryId: result.sidebarCategoryId,
        } as Partial<SpaceTreeNode>),
      );
      invalidateRootSidebarQueries(node.spaceId);
      notifications.show({
        message: categoryId ? t("Category updated") : t("Category cleared"),
      });
    } catch (err: any) {
      notifications.show({
        message: err?.response?.data?.message || t("Failed to update category"),
        color: "red",
      });
    }
  };

  const handleCopyLink = () => {
    const pageUrl =
      getAppUrl() + buildPageUrl(spaceSlug, node.slugId, node.name);
    clipboard.copy(pageUrl);
    notifications.show({ message: t("Link copied") });
  };

  const handleDuplicatePage = async () => {
    try {
      const duplicatedPage = await duplicatePage({ pageId: node.id });

      // figure out parent + insertion index
      const siblings = treeModel.siblingsOf(data, node.id);
      const parentId = siblings?.parentId ?? null;
      const currentIndex = siblings?.index ?? 0;
      const newIndex = currentIndex + 1;

      const treeNodeData: SpaceTreeNode = {
        id: duplicatedPage.id,
        slugId: duplicatedPage.slugId,
        name: duplicatedPage.title,
        position: duplicatedPage.position,
        spaceId: duplicatedPage.spaceId,
        parentPageId: duplicatedPage.parentPageId,
        icon: duplicatedPage.icon,
        hasChildren: duplicatedPage.hasChildren,
        canEdit: true,
        children: [],
      };

      setData((prev) =>
        treeModel.insert(prev, parentId, treeNodeData, newIndex),
      );

      setTimeout(() => {
        emit({
          operation: "addTreeNode",
          spaceId: node.spaceId,
          payload: {
            parentId,
            index: newIndex,
            data: treeNodeData,
          },
        });
      }, 50);

      notifications.show({ message: t("Page duplicated successfully") });
    } catch (err: any) {
      notifications.show({
        message: err?.response?.data?.message || "An error occurred",
        color: "red",
      });
    }
  };

  return (
    <>
      <Menu shadow="md" width={200}>
        <Menu.Target>
          <ActionIcon
            variant="transparent"
            c="gray"
            aria-label={t("Page menu for {{name}}", { name: node.name || t("untitled") })}
            tabIndex={-1}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <IconDotsVertical
              style={{ width: rem(20), height: rem(20) }}
              stroke={2}
            />
          </ActionIcon>
        </Menu.Target>

        <Menu.Dropdown>
          <Menu.Item
            leftSection={<IconLink size={16} />}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleCopyLink();
            }}
          >
            {t("Copy link")}
          </Menu.Item>

          <Menu.Item
            leftSection={
              isFavorited ? <IconStarFilled size={16} /> : <IconStar size={16} />
            }
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (isFavorited) {
                removeFavorite.mutate({ type: "page", pageId: node.id });
              } else {
                addFavorite.mutate({ type: "page", pageId: node.id });
              }
            }}
          >
            {isFavorited ? t("Remove from favorites") : t("Add to favorites")}
          </Menu.Item>

          {!node.parentPageId && (
            <Menu.Item
              leftSection={node.isPinned ? <IconPinnedOff size={16} /> : <IconPin size={16} />}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleTogglePin();
              }}
            >
              {node.isPinned ? t("Unpin") : t("Pin to top")}
            </Menu.Item>
          )}

          {!node.parentPageId && sidebarCategories.length > 0 && (
            <Menu.Sub>
              <Menu.Sub.Target>
                <Menu.Item leftSection={<IconCategory2 size={16} />}>
                  {t("Category")}
                </Menu.Item>
              </Menu.Sub.Target>
              <Menu.Sub.Dropdown>
                <Menu.Item
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAssignCategory(null); }}
                  rightSection={!node.sidebarCategoryId ? <IconCheck size={14} stroke={1.8} /> : null}
                >
                  {t("None")}
                </Menu.Item>
                {sidebarCategories.map((category) => (
                  <Menu.Item
                    key={category.id}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAssignCategory(category.id); }}
                    rightSection={node.sidebarCategoryId === category.id ? <IconCheck size={14} stroke={1.8} /> : null}
                  >
                    {category.name}
                  </Menu.Item>
                ))}
                <Menu.Divider />
                <Menu.Item onClick={(e) => { e.preventDefault(); e.stopPropagation(); openCategoryModal(); }}>
                  {t("Manage categories")}
                </Menu.Item>
              </Menu.Sub.Dropdown>
            </Menu.Sub>
          )}

          <Menu.Item
            leftSection={<IconFileExport size={16} />}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openExportModal();
            }}
          >
            {t("Export page")}
          </Menu.Item>

          {canEdit && (
            <>
              <Menu.Item
                leftSection={<IconCopy size={16} />}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDuplicatePage();
                }}
              >
                {t("Duplicate")}
              </Menu.Item>

              <Menu.Item
                leftSection={<IconArrowRight size={16} />}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openMovePageModal();
                }}
              >
                {t("Move")}
              </Menu.Item>

              <Menu.Item
                leftSection={<IconCopy size={16} />}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openCopyPageModal();
                }}
              >
                {t("Copy to space")}
              </Menu.Item>

              <Menu.Divider />
              <Menu.Item
                c="red"
                leftSection={<IconTrash size={16} />}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openDeleteModal({
                    onConfirm: () => handleDelete(node.id),
                  });
                }}
              >
                {t("Move to trash")}
              </Menu.Item>
            </>
          )}
        </Menu.Dropdown>
      </Menu>

      <MovePageModal
        pageId={node.id}
        slugId={node.slugId}
        currentSpaceSlug={spaceSlug}
        onClose={closeMoveSpaceModal}
        open={movePageModalOpened}
      />

      <CopyPageModal
        pageId={node.id}
        currentSpaceSlug={spaceSlug}
        onClose={closeCopySpaceModal}
        open={copyPageModalOpened}
      />

      <ExportModal
        type="page"
        id={node.id}
        open={exportOpened}
        onClose={closeExportModal}
      />

      <SidebarCategoryManageModal
        spaceId={node.spaceId}
        opened={categoryModalOpened}
        onClose={closeCategoryModal}
        categories={sidebarCategories}
      />
    </>
  );
}
