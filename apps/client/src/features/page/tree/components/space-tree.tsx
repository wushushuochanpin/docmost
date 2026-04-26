import {
  NodeApi,
  NodeRendererProps,
  Tree,
  TreeApi,
  SimpleTree,
} from "react-arborist";
import { atom, useAtom, useSetAtom } from "jotai";
import { treeApiAtom } from "@/features/page/tree/atoms/tree-api-atom.ts";
import {
  invalidateRootSidebarQueries,
  fetchAllAncestorChildren,
  useGetRootSidebarPagesQuery,
  useUpdatePageMutation,
} from "@/features/page/queries/page-query.ts";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import classes from "@/features/page/tree/styles/tree.module.css";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Menu,
  Modal,
  Text,
  TextInput,
  rem,
} from "@mantine/core";
import {
  IconCategory2,
  IconArrowRight,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconDotsVertical,
  IconFileText,
  IconFileExport,
  IconFolder,
  IconLink,
  IconPencil,
  IconPlus,
  IconPin,
  IconPinnedOff,
  IconPointFilled,
  IconTrash,
} from "@tabler/icons-react";
import {
  appendNodeChildrenAtom,
  treeDataAtom,
} from "@/features/page/tree/atoms/tree-data-atom.ts";
import clsx from "clsx";
import EmojiPicker from "@/components/ui/emoji-picker.tsx";
import { useTreeMutation } from "@/features/page/tree/hooks/use-tree-mutation.ts";
import {
  appendNodeChildren,
  buildTree,
  buildTreeWithChildren,
  reconcileRootTrees,
  updateTreeNodePinnedState,
  updateTreeNodeIcon,
} from "@/features/page/tree/utils/utils.ts";
import { SpaceTreeNode } from "@/features/page/tree/types.ts";
import {
  assignSidebarCategory,
  batchMovePages,
  pinPage,
  unpinPage,
  getPageBreadcrumbs,
} from "@/features/page/services/page-service.ts";
import {
  IPage,
  SidebarPagesParams,
  SidebarViewMode,
} from "@/features/page/types/page.types.ts";
import { queryClient } from "@/query-client.ts";
import { OpenMap } from "react-arborist/dist/main/state/open-slice";
import { useDisclosure, useElementSize, useMergedRef } from "@mantine/hooks";
import { useClipboard } from "@/hooks/use-clipboard";
import { dfs } from "react-arborist/dist/module/utils";
import { useQueryEmit } from "@/features/websocket/use-query-emit.ts";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { notifications } from "@mantine/notifications";
import { getAppUrl } from "@/lib/config.ts";
import { extractPageSlugId } from "@/lib";
import { useDeletePageModal } from "@/features/page/hooks/use-delete-page-modal.tsx";
import { useTranslation } from "react-i18next";
import ExportModal from "@/components/common/export-modal";
import MovePageModal from "../../components/move-page-modal.tsx";
import MoveToModal from "../../components/move-to-modal.tsx";
import { mobileSidebarAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom.ts";
import { useToggleSidebar } from "@/components/layouts/global/hooks/hooks/use-toggle-sidebar.ts";
import CopyPageModal from "../../components/copy-page-modal.tsx";
import { duplicatePage } from "../../services/page-service.ts";
import { AutoTooltipText } from "@/components/ui/auto-tooltip-text.tsx";
import { useAtomValue } from "jotai";
import { currentRoutePageAtom } from "@/features/page/atoms/current-route-page-atom.ts";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { useSidebarCategoriesQuery } from "@/features/space/queries/space-query.ts";
import { ISidebarCategory } from "@/features/space/types/sidebar-category.types.ts";
import { SidebarViewSelection, SidebarViewTabs } from "./sidebar-view-tabs.tsx";
import { SidebarCategoryManageModal } from "./sidebar-category-manage-modal.tsx";

interface SpaceTreeProps {
  spaceId: string;
  readOnly: boolean;
  canManageCategories?: boolean;
}

const openTreeNodesAtom = atom<OpenMap>({});

const DEFAULT_SIDEBAR_VIEW_KEY = "all";

function getSidebarViewStorageKey(spaceId: string) {
  return `docmost:sidebar-view:${spaceId}`;
}

function readStoredSidebarView(spaceId: string): string {
  if (typeof window === "undefined") {
    return DEFAULT_SIDEBAR_VIEW_KEY;
  }

  return (
    window.localStorage.getItem(getSidebarViewStorageKey(spaceId)) ??
    DEFAULT_SIDEBAR_VIEW_KEY
  );
}

function writeStoredSidebarView(spaceId: string, key: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getSidebarViewStorageKey(spaceId), key);
}

function parseSidebarViewSelection(
  key: string,
  categories: ISidebarCategory[],
  t: (value: string) => string,
): SidebarViewSelection {
  if (key === "pinned") {
    return {
      key,
      label: t("Pinned"),
      viewMode: "pinned",
      categoryId: null,
    };
  }

  if (key.startsWith("category:")) {
    const categoryId = key.slice("category:".length);
    const category = categories.find((item) => item.id === categoryId);
    if (category) {
      return {
        key,
        label: category.name,
        viewMode: "category",
        categoryId: category.id,
      };
    }
  }

  return {
    key: DEFAULT_SIDEBAR_VIEW_KEY,
    label: t("All"),
    viewMode: "all",
    categoryId: null,
  };
}

export default function SpaceTree({
  spaceId,
  readOnly,
  canManageCategories,
}: SpaceTreeProps) {
  const { t } = useTranslation();
  const { pageSlug } = useParams();
  const currentRoutePage = useAtomValue(currentRoutePageAtom);
  const [selectedViewKey, setSelectedViewKey] = useState(() =>
    readStoredSidebarView(spaceId),
  );
  const [
    manageCategoriesOpened,
    { open: openManageCategories, close: closeManageCategories },
  ] = useDisclosure(false);
  const {
    data: sidebarCategories = [],
    isFetched: areSidebarCategoriesLoaded,
  } = useSidebarCategoriesQuery(spaceId);
  const currentView = useMemo(
    () => parseSidebarViewSelection(selectedViewKey, sidebarCategories, t),
    [selectedViewKey, sidebarCategories, t],
  );
  const { data, setData, controllers } = useTreeMutation<SpaceTreeNode>(
    spaceId,
    {
      rootViewMode: currentView.viewMode,
      rootCategoryId: currentView.categoryId,
    },
  );
  const {
    data: pagesData,
    hasNextPage,
    fetchNextPage,
    isFetching,
  } = useGetRootSidebarPagesQuery({
    spaceId,
    viewMode: currentView.viewMode,
    categoryId: currentView.categoryId,
  });
  const [, setTreeApi] = useAtom<TreeApi<SpaceTreeNode>>(treeApiAtom);
  const treeApiRef = useRef<TreeApi<SpaceTreeNode>>();
  const [openTreeNodes, setOpenTreeNodes] = useAtom<OpenMap>(openTreeNodesAtom);
  const rootElement = useRef<HTMLDivElement>();
  const [isRootReady, setIsRootReady] = useState(false);
  const { ref: sizeRef, width, height } = useElementSize();
  const mergedRef = useMergedRef((element) => {
    rootElement.current = element;
    if (element && !isRootReady) {
      setIsRootReady(true);
    }
  }, sizeRef);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const spaceIdRef = useRef(spaceId);
  spaceIdRef.current = spaceId;
  const currentPage =
    currentRoutePage &&
    String(currentRoutePage.slugId) === String(extractPageSlugId(pageSlug))
      ? currentRoutePage
      : null;

  useEffect(() => {
    setSelectedViewKey(readStoredSidebarView(spaceId));
    setIsDataLoaded(false);
    setData([]);
    setOpenTreeNodes({});
  }, [setData, setOpenTreeNodes, spaceId]);

  useEffect(() => {
    writeStoredSidebarView(spaceId, currentView.key);
  }, [currentView.key, spaceId]);

  useEffect(() => {
    if (
      areSidebarCategoriesLoaded &&
      currentView.viewMode === "category" &&
      currentView.categoryId &&
      !sidebarCategories.some((item) => item.id === currentView.categoryId)
    ) {
      setSelectedViewKey(DEFAULT_SIDEBAR_VIEW_KEY);
    }
  }, [
    areSidebarCategoriesLoaded,
    currentView.categoryId,
    currentView.viewMode,
    sidebarCategories,
  ]);

  useEffect(() => {
    setIsDataLoaded(false);
    setData([]);
    setOpenTreeNodes({});
  }, [currentView.key, setData, setOpenTreeNodes]);

  useEffect(() => {
    if (hasNextPage && !isFetching) {
      fetchNextPage();
    }
  }, [currentView.key, fetchNextPage, hasNextPage, isFetching, spaceId]);

  useEffect(() => {
    if (!pagesData?.pages) {
      return;
    }

    const allItems = pagesData.pages.flatMap((page) => page.items);
    const treeData = buildTree(allItems);

    setData((prev) => {
      return reconcileRootTrees(
        prev.filter((item) => item?.spaceId === spaceId),
        treeData,
      );
    });

    if (!isDataLoaded) {
      setIsDataLoaded(true);
    }
  }, [currentView.key, isDataLoaded, pagesData, setData, spaceId]);

  useEffect(() => {
    const effectSpaceId = spaceId;

    const fetchData = async () => {
      if (isDataLoaded && currentPage) {
        // check if pageId node is present in the tree
        const node = dfs(treeApiRef.current?.root, currentPage.id);
        if (node) {
          // if node is found, no need to traverse its ancestors
          return;
        }

        // if not found, fetch and build its ancestors and their children
        if (!currentPage.id) return;
        const ancestors = await getPageBreadcrumbs(currentPage.id);

        if (spaceIdRef.current !== effectSpaceId) return;

        if (ancestors && ancestors?.length > 1) {
          let flatTreeItems = [...buildTree(ancestors)];

          const fetchAndUpdateChildren = async (ancestor: IPage) => {
            // we don't want to fetch the children of the opened page
            if (ancestor.id === currentPage.id) {
              return;
            }
            const children = await fetchAllAncestorChildren({
              pageId: ancestor.id,
              spaceId: ancestor.spaceId,
            });

            flatTreeItems = [
              ...flatTreeItems,
              ...children.filter(
                (child) => !flatTreeItems.some((item) => item.id === child.id),
              ),
            ];
          };

          const fetchPromises = ancestors.map((ancestor) =>
            fetchAndUpdateChildren(ancestor),
          );

          // Wait for all fetch operations to complete
          Promise.all(fetchPromises).then(() => {
            if (spaceIdRef.current !== effectSpaceId) return;

            // build tree with children
            const ancestorsTree = buildTreeWithChildren(flatTreeItems);
            // child of root page we're attaching the built ancestors to
            const rootChild = ancestorsTree[0];
            const rootExistsInCurrentView = data.some(
              (item) => item.id === rootChild.id,
            );

            if (!rootExistsInCurrentView && currentView.viewMode !== "all") {
              setSelectedViewKey(DEFAULT_SIDEBAR_VIEW_KEY);
              return;
            }

            // attach built ancestors to tree using functional updater
            // to avoid stale closure overwriting the current tree data
            setData((currentData) =>
              appendNodeChildren(currentData, rootChild.id, rootChild.children),
            );

            setTimeout(() => {
              // focus on node and open all parents
              treeApiRef.current?.select(currentPage.id);
            }, 100);
          });
        }
      }
    };

    fetchData();
  }, [currentPage?.id, currentView.viewMode, data, isDataLoaded, setData]);

  useEffect(() => {
    if (currentPage?.id) {
      setTimeout(() => {
        // focus on node and open all parents
        treeApiRef.current?.select(currentPage.id, { align: "auto" });
      }, 200);
    } else {
      treeApiRef.current?.deselectAll();
    }
  }, [currentPage?.id]);

  // Clean up tree API on unmount
  useEffect(() => {
    return () => {
      // @ts-ignore
      setTreeApi(null);
    };
  }, [setTreeApi]);

  const filteredData = data.filter((node) => node?.spaceId === spaceId);

  return (
    <div className={classes.treeContainer}>
      <SidebarViewTabs
        categories={sidebarCategories}
        value={currentView.key}
        canManageCategories={canManageCategories}
        onChange={(view) => setSelectedViewKey(view.key)}
        onManageCategories={openManageCategories}
      />

      {isDataLoaded && filteredData.length === 0 && (
        <Text size="xs" c="dimmed" py="xs" px="sm">
          {currentView.viewMode === "category"
            ? t("No pages in this category yet")
            : currentView.viewMode === "pinned"
              ? t("No pinned pages yet")
              : t("No pages yet")}
        </Text>
      )}
      <div ref={mergedRef} className={classes.treeViewport}>
        {isRootReady && rootElement.current && (
          <Tree
            data={filteredData}
            disableDrag={
              readOnly
                ? true
                : (data) => {
                    return data.canEdit === false;
                  }
            }
            disableDrop={(args) => {
              if (readOnly) {
                return true;
              }

              if (args.parentNode?.data?.canEdit === false) {
                return true;
              }

              const isRootTarget =
                args.parentNode.id === "__REACT_ARBORIST_INTERNAL_ROOT__";

              if (isRootTarget) {
                return args.dragNodes.some(
                  (dragNode) => dragNode.data?.nodeType !== "folder",
                );
              }

              const parentNodeType =
                args.parentNode.data?.nodeType === "folder" ? "folder" : "file";

              if (parentNodeType === "folder") {
                return false;
              }

              return args.dragNodes.some(
                (dragNode) => dragNode.data?.nodeType === "folder",
              );
            }}
            disableEdit={readOnly ? true : (data) => data.canEdit === false}
            {...controllers}
            width={width}
            height={height}
            ref={(ref) => {
              treeApiRef.current = ref;
              if (ref) {
                //@ts-ignore
                setTreeApi(ref);
              }
            }}
            openByDefault={false}
            disableMultiSelection={readOnly}
            className={classes.tree}
            rowClassName={classes.row}
            rowHeight={34}
            overscanCount={10}
            dndRootElement={rootElement.current}
            onToggle={() => {
              setOpenTreeNodes(treeApiRef.current?.openState);
            }}
            initialOpenState={openTreeNodes}
          >
            {(props) => (
              <Node
                {...props}
                sidebarCategories={sidebarCategories}
                canManageCategories={canManageCategories}
                currentViewMode={currentView.viewMode}
                onManageCategories={openManageCategories}
              />
            )}
          </Tree>
        )}
      </div>

      <SidebarCategoryManageModal
        opened={manageCategoriesOpened}
        onClose={closeManageCategories}
        spaceId={spaceId}
        categories={sidebarCategories}
      />
    </div>
  );
}

interface TreeNodeRendererProps extends NodeRendererProps<SpaceTreeNode> {
  sidebarCategories: ISidebarCategory[];
  canManageCategories?: boolean;
  currentViewMode: SidebarViewMode;
  onManageCategories?: () => void;
}

function Node({
  node,
  style,
  dragHandle,
  tree,
  sidebarCategories,
  canManageCategories,
  currentViewMode,
  onManageCategories,
}: TreeNodeRendererProps) {
  const { t } = useTranslation();
  const updatePageMutation = useUpdatePageMutation();
  const setTreeData = useSetAtom(treeDataAtom);
  const appendChildren = useSetAtom(appendNodeChildrenAtom);
  const emit = useQueryEmit();
  const { spaceSlug } = useParams();
  const isLoadingChildrenRef = useRef(false);
  const [mobileSidebarOpened] = useAtom(mobileSidebarAtom);
  const toggleMobileSidebar = useToggleSidebar(mobileSidebarAtom);

  async function handleLoadChildren(node: NodeApi<SpaceTreeNode>) {
    if (!node.data.hasChildren) return;
    if (node.children.length > 0 || isLoadingChildrenRef.current) return;
    // in conflict with use-query-subscription.ts => case "addTreeNode","moveTreeNode" etc with websocket
    // if (node.data.children && node.data.children.length > 0) {
    //   return;
    // }

    isLoadingChildrenRef.current = true;
    try {
      const params: SidebarPagesParams = {
        pageId: node.data.id,
        spaceId: node.data.spaceId,
      };

      const childrenTree = await fetchAllAncestorChildren(params);

      appendChildren({
        parentId: node.data.id,
        children: childrenTree,
      });
    } catch (error) {
      console.error("Failed to fetch children:", error);
    } finally {
      isLoadingChildrenRef.current = false;
    }
  }

  const handleUpdateNodeIcon = (nodeId: string, newIcon: string) => {
    const updatedTree = updateTreeNodeIcon(
      tree.props.data as SpaceTreeNode[],
      nodeId,
      newIcon,
    );
    setTreeData(updatedTree);
  };

  const handleEmojiIconClick = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleEmojiSelect = (emoji: { native: string }) => {
    handleUpdateNodeIcon(node.id, emoji.native);
    updatePageMutation
      .mutateAsync({ pageId: node.id, icon: emoji.native })
      .then((data) => {
        setTimeout(() => {
          emit({
            operation: "updateOne",
            spaceId: node.data.spaceId,
            entity: ["pages"],
            id: node.id,
            payload: { icon: emoji.native, parentPageId: data.parentPageId },
          });
        }, 50);
      });
  };

  const handleRemoveEmoji = () => {
    handleUpdateNodeIcon(node.id, null);
    updatePageMutation.mutateAsync({ pageId: node.id, icon: null });

    setTimeout(() => {
      emit({
        operation: "updateOne",
        spaceId: node.data.spaceId,
        entity: ["pages"],
        id: node.id,
        payload: { icon: null },
      });
    }, 50);
  };

  if (
    node.willReceiveDrop &&
    node.isClosed &&
    (node.children.length > 0 || node.data.hasChildren)
  ) {
    handleLoadChildren(node);
    setTimeout(() => {
      if (node.state.willReceiveDrop) {
        node.open();
      }
    }, 650);
  }

  const pageUrl = buildPageUrl(spaceSlug, node.data.slugId, node.data.name);
  const directChildCount = node.data.directChildCount ?? 0;
  const descendantTotalCount = node.data.descendantTotalCount ?? 0;
  const nodeReadOnly =
    tree.props.disableEdit === true || node.data.canEdit === false;

  const buildSubmittedName = (value: string) => value.trim() || t("untitled");

  if (node.isEditing) {
    return (
      <Box style={style} className={clsx(classes.node, node.state)}>
        <PageArrow node={node} onExpandTree={() => handleLoadChildren(node)} />

        <div onClick={handleEmojiIconClick} className={classes.nodeIcon}>
          <EmojiPicker
            onEmojiSelect={handleEmojiSelect}
            icon={
              node.data.icon ? (
                node.data.icon
              ) : node.data.nodeType === "folder" ? (
                <IconFolder size={16} stroke={1.75} />
              ) : (
                <IconFileText size={16} stroke={1.75} />
              )
            }
            readOnly={nodeReadOnly}
            removeEmojiAction={handleRemoveEmoji}
          />
        </div>

        <TextInput
          size="xs"
          variant="unstyled"
          autoFocus
          defaultValue={node.data.name || ""}
          className={classes.text}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onBlur={(e) => {
            node.submit(buildSubmittedName(e.currentTarget.value));
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              node.submit(buildSubmittedName(e.currentTarget.value));
            }
            if (e.key === "Escape") {
              e.preventDefault();
              node.reset();
            }
          }}
        />
      </Box>
    );
  }

  return (
    <>
      <Box
        style={style}
        className={clsx(classes.node, node.state)}
        component={Link}
        to={pageUrl}
        // @ts-ignore
        ref={dragHandle}
        onClick={() => {
          if (node.data.nodeType === "folder" && !node.isOpen) {
            node.open();
            if (node.data.hasChildren && node.children.length === 0) {
              handleLoadChildren(node);
            }
          }
          if (mobileSidebarOpened) {
            toggleMobileSidebar();
          }
        }}
      >
        <PageArrow node={node} onExpandTree={() => handleLoadChildren(node)} />

        <div onClick={handleEmojiIconClick} className={classes.nodeIcon}>
          <EmojiPicker
            onEmojiSelect={handleEmojiSelect}
            icon={
              node.data.icon ? (
                node.data.icon
              ) : node.data.nodeType === "folder" ? (
                <IconFolder size={16} stroke={1.75} />
              ) : (
                <IconFileText size={16} stroke={1.75} />
              )
            }
            readOnly={nodeReadOnly}
            removeEmojiAction={handleRemoveEmoji}
          />
        </div>

        <AutoTooltipText
          className={classes.text}
          tooltipProps={{
            openDelay: 50,
            withArrow: true,
            position: "right",
          }}
          lineClamp={1}
        >
          {node.data.name || t("untitled")}
        </AutoTooltipText>
        {node.data.isPinned ? (
          <span className={classes.pinnedBadge} title={t("Pinned")}>
            <IconPin size={11} stroke={1.85} />
            {node.data.nodeType === "folder" ? (
              <IconFolder size={11} stroke={1.85} />
            ) : (
              <IconFileText size={11} stroke={1.85} />
            )}
          </span>
        ) : null}
        <span
          className={classes.counts}
          title={t(
            "Direct children (1 level): {{directChildCount}} · All descendants: {{descendantTotalCount}}",
            {
              directChildCount,
              descendantTotalCount,
            },
          )}
        >
          {directChildCount} · {descendantTotalCount}
        </span>

        <div className={classes.actions}>
          <NodeMenu
            node={node}
            treeApi={tree}
            spaceId={node.data.spaceId}
            sidebarCategories={sidebarCategories}
            canManageCategories={canManageCategories}
            currentViewMode={currentViewMode}
            onManageCategories={onManageCategories}
          />

          {!nodeReadOnly && (
            <CreateNode
              node={node}
              treeApi={tree}
              onExpandTree={() => handleLoadChildren(node)}
            />
          )}
        </div>
      </Box>
    </>
  );
}

interface CreateNodeProps {
  node: NodeApi<SpaceTreeNode>;
  treeApi: TreeApi<SpaceTreeNode>;
  onExpandTree?: () => void;
}

function CreateNode({ node, treeApi, onExpandTree }: CreateNodeProps) {
  const { t } = useTranslation();
  const isFolderNode = node.data.nodeType === "folder";

  function handleCreate(type: "leaf" | "internal") {
    if (node.data.hasChildren && node.children.length === 0) {
      node.toggle();
      onExpandTree();

      setTimeout(() => {
        treeApi?.create({ type, parentId: node.id, index: 0 });
      }, 500);
    } else {
      treeApi?.create({ type, parentId: node.id });
    }
  }

  if (!isFolderNode) {
    return (
      <ActionIcon
        variant="subtle"
        c="gray"
        size={20}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleCreate("leaf");
        }}
      >
        <IconPlus style={{ width: rem(16), height: rem(16) }} stroke={1.75} />
      </ActionIcon>
    );
  }

  return (
    <Menu shadow="md" width={180}>
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          c="gray"
          size={20}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <IconPlus style={{ width: rem(16), height: rem(16) }} stroke={1.75} />
        </ActionIcon>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Item
          leftSection={<IconFileText size={16} stroke={1.75} />}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleCreate("leaf");
          }}
        >
          {t("New file")}
        </Menu.Item>
        <Menu.Item
          leftSection={<IconFolder size={16} stroke={1.75} />}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleCreate("internal");
          }}
        >
          {t("New folder")}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

interface NodeMenuProps {
  node: NodeApi<SpaceTreeNode>;
  treeApi: TreeApi<SpaceTreeNode>;
  spaceId: string;
  sidebarCategories: ISidebarCategory[];
  canManageCategories?: boolean;
  currentViewMode: SidebarViewMode;
  onManageCategories?: () => void;
}

function NodeMenu({
  node,
  treeApi,
  spaceId,
  sidebarCategories,
  canManageCategories,
  currentViewMode,
  onManageCategories,
}: NodeMenuProps) {
  const { t } = useTranslation();
  const clipboard = useClipboard({ timeout: 500 });
  const { spaceSlug } = useParams();
  const workspace = useAtomValue(workspaceAtom);
  const { openDeleteModal } = useDeletePageModal();
  const setData = useSetAtom(treeDataAtom);
  const emit = useQueryEmit();
  const [filteredKeyword, setFilteredKeyword] = useState("");
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
  const [
    copyPageModalOpened,
    { open: openCopyPageModal, close: closeCopySpaceModal },
  ] = useDisclosure(false);
  const [
    filteredMoveOpened,
    { open: openFilteredMoveModal, close: closeFilteredMoveModal },
  ] = useDisclosure(false);

  const isFolder = node.data.nodeType === "folder";
  const isRootNode = node.data.parentPageId == null;
  const canEdit =
    treeApi.props.disableEdit !== true && node.data.canEdit !== false;
  const selectedPageIds = Array.from(treeApi.selectedIds ?? []);
  const selectedMovableIds = selectedPageIds.filter((id) => id !== node.id);
  const canBatchMoveSelected =
    canEdit && isFolder && selectedMovableIds.length > 0;
  const getCurrentTreeData = () =>
    (treeApi.props.data as SpaceTreeNode[]) ?? [];

  const refreshSidebarTree = () => {
    invalidateRootSidebarQueries(spaceId);
    queryClient.removeQueries({
      predicate: (item) =>
        ["root-sidebar-pages", "sidebar-pages"].includes(
          item.queryKey[0] as string,
        ),
    });
    setData([]);
    treeApi.deselectAll();
  };

  const handleCopyLink = () => {
    const pageUrl =
      getAppUrl() + buildPageUrl(spaceSlug, node.data.slugId, node.data.name);
    clipboard.copy(pageUrl);
    notifications.show({ message: t("Link copied") });
  };

  const handleDuplicatePage = async () => {
    try {
      const duplicatedPage = await duplicatePage({
        pageId: node.id,
      });

      // Find the index of the current node
      const parentId =
        node.parent?.id === "__REACT_ARBORIST_INTERNAL_ROOT__"
          ? null
          : node.parent?.id;
      const siblings = parentId ? node.parent.children : treeApi?.props.data;
      const currentIndex =
        siblings?.findIndex((sibling) => sibling.id === node.id) || 0;
      const newIndex = currentIndex + 1;

      // Add the duplicated page to the tree
      const treeNodeData: SpaceTreeNode = {
        id: duplicatedPage.id,
        slugId: duplicatedPage.slugId,
        name: duplicatedPage.title,
        position: duplicatedPage.position,
        spaceId: duplicatedPage.spaceId,
        parentPageId: duplicatedPage.parentPageId,
        icon: duplicatedPage.icon,
        hasChildren: duplicatedPage.hasChildren,
        nodeType: duplicatedPage.nodeType ?? node.data.nodeType ?? "file",
        isPinned: duplicatedPage.isPinned ?? false,
        pinnedAt: duplicatedPage.pinnedAt ?? null,
        sidebarCategoryId: duplicatedPage.sidebarCategoryId ?? null,
        directChildCount:
          duplicatedPage.directChildCount ??
          duplicatedPage.directChildFolderCount ??
          0,
        directChildFolderCount: duplicatedPage.directChildFolderCount ?? 0,
        descendantFolderCount: duplicatedPage.descendantFolderCount ?? 0,
        descendantFileCount: duplicatedPage.descendantFileCount ?? 0,
        descendantTotalCount: duplicatedPage.descendantTotalCount ?? 0,
        canEdit: true,
        children: [],
      };

      const shouldRenderLocally =
        currentViewMode !== "pinned" ||
        Boolean(duplicatedPage.isPinned ?? false) ||
        parentId !== null;

      if (shouldRenderLocally) {
        const simpleTree = new SimpleTree(getCurrentTreeData());
        simpleTree.create({
          parentId,
          index: newIndex,
          data: treeNodeData,
        });
        setData(simpleTree.data);
      }

      invalidateRootSidebarQueries(spaceId);

      // Emit socket event
      setTimeout(() => {
        emit({
          operation: "addTreeNode",
          spaceId: spaceId,
          payload: {
            parentId,
            index: newIndex,
            data: treeNodeData,
          },
        });
      }, 50);

      notifications.show({
        message: t("Page duplicated successfully"),
      });
    } catch (err) {
      notifications.show({
        message: err.response?.data.message || "An error occurred",
        color: "red",
      });
    }
  };

  const handleTogglePin = async () => {
    try {
      const result = node.data.isPinned
        ? await unpinPage(node.id)
        : await pinPage(node.id);
      const updatedTree = updateTreeNodePinnedState(
        getCurrentTreeData(),
        node.id,
        result.isPinned,
        result.pinnedAt,
      );
      setData(updatedTree);
      invalidateRootSidebarQueries(spaceId);
      notifications.show({
        message: result.isPinned ? t("Pinned") : t("Unpinned"),
      });
    } catch (err) {
      notifications.show({
        message: err.response?.data.message || t("Failed to update pin status"),
        color: "red",
      });
    }
  };

  const handleAssignCategory = async (categoryId: string | null) => {
    try {
      const result = await assignSidebarCategory({
        pageId: node.id,
        categoryId,
      });

      const simpleTree = new SimpleTree(getCurrentTreeData());
      simpleTree.update({
        id: node.id,
        changes: { sidebarCategoryId: result.sidebarCategoryId } as any,
      });
      setData(simpleTree.data);
      invalidateRootSidebarQueries(spaceId);

      notifications.show({
        message: categoryId ? t("Category updated") : t("Category cleared"),
      });
    } catch (err) {
      notifications.show({
        message: err.response?.data?.message || t("Failed to update category"),
        color: "red",
      });
    }
  };

  const handleBatchMoveSelectedHere = async () => {
    if (!canBatchMoveSelected) {
      return;
    }

    try {
      const result = await batchMovePages({
        spaceId,
        selectionMode: "ids",
        pageIds: selectedMovableIds,
        targetFolderId: node.id,
      });
      notifications.show({
        message:
          result.failedCount > 0
            ? t("Moved {{movedCount}}, failed {{failedCount}}", {
                movedCount: result.movedCount,
                failedCount: result.failedCount,
              })
            : t("Moved {{count}} pages", {
                count: result.movedCount,
              }),
      });
      refreshSidebarTree();
    } catch (err) {
      notifications.show({
        message: err.response?.data.message || t("Batch move failed"),
        color: "red",
      });
    }
  };

  const handleBatchMoveFilteredHere = async () => {
    const keyword = filteredKeyword.trim();
    if (!keyword) {
      notifications.show({
        message: t("Please enter a filter keyword"),
        color: "yellow",
      });
      return;
    }

    try {
      const result = await batchMovePages({
        spaceId,
        selectionMode: "filtered",
        titleContains: keyword,
        targetFolderId: node.id,
      });
      notifications.show({
        message:
          result.failedCount > 0
            ? t("Moved {{movedCount}}, failed {{failedCount}}", {
                movedCount: result.movedCount,
                failedCount: result.failedCount,
              })
            : t("Moved {{count}} pages", {
                count: result.movedCount,
              }),
      });
      closeFilteredMoveModal();
      setFilteredKeyword("");
      refreshSidebarTree();
    } catch (err) {
      notifications.show({
        message: err.response?.data.message || t("Filtered batch move failed"),
        color: "red",
      });
    }
  };

  return (
    <>
      <Menu shadow="md" width={200}>
        <Menu.Target>
          <ActionIcon
            variant="subtle"
            c="gray"
            size={20}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <IconDotsVertical
              style={{ width: rem(16), height: rem(16) }}
              stroke={1.75}
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
                leftSection={<IconPencil size={16} />}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  treeApi.edit(node.id);
                }}
              >
                {t("Rename")}
              </Menu.Item>

              <Menu.Item
                leftSection={<IconFileText size={16} stroke={1.75} />}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  treeApi.create({ type: "leaf", parentId: node.id });
                }}
              >
                {t("New file")}
              </Menu.Item>

              {isFolder && (
                <Menu.Item
                  leftSection={<IconFolder size={16} stroke={1.75} />}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    treeApi.create({ type: "internal", parentId: node.id });
                  }}
                >
                  {t("New folder")}
                </Menu.Item>
              )}

              <Menu.Item
                leftSection={
                  node.data.isPinned ? (
                    <IconPinnedOff size={16} />
                  ) : (
                    <IconPin size={16} />
                  )
                }
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleTogglePin();
                }}
              >
                {node.data.isPinned ? t("Unpin") : t("Pin to top")}
              </Menu.Item>

              {isRootNode && (
                <Menu.Sub>
                  <Menu.Sub.Target>
                    <Menu.Sub.Item
                      leftSection={<IconCategory2 size={16} stroke={1.75} />}
                    >
                      {t("Set category")}
                    </Menu.Sub.Item>
                  </Menu.Sub.Target>

                  <Menu.Sub.Dropdown>
                    <Menu.Item
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleAssignCategory(null);
                      }}
                      rightSection={
                        !node.data.sidebarCategoryId ? (
                          <IconCheck size={14} stroke={1.8} />
                        ) : null
                      }
                    >
                      {t("None")}
                    </Menu.Item>

                    {sidebarCategories.map((category) => (
                      <Menu.Item
                        key={category.id}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleAssignCategory(category.id);
                        }}
                        rightSection={
                          node.data.sidebarCategoryId === category.id ? (
                            <IconCheck size={14} stroke={1.8} />
                          ) : null
                        }
                      >
                        {category.name}
                      </Menu.Item>
                    ))}

                    {canManageCategories && onManageCategories ? (
                      <>
                        <Menu.Divider />
                        <Menu.Item
                          leftSection={<IconPencil size={16} stroke={1.75} />}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onManageCategories();
                          }}
                        >
                          {t("Manage categories")}
                        </Menu.Item>
                      </>
                    ) : null}
                  </Menu.Sub.Dropdown>
                </Menu.Sub>
              )}

              {isFolder && (
                <Menu.Item
                  leftSection={<IconArrowRight size={16} />}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openFilteredMoveModal();
                  }}
                >
                  {t("Move filtered pages here")}
                </Menu.Item>
              )}

              {canBatchMoveSelected && (
                <Menu.Item
                  leftSection={<IconArrowRight size={16} />}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleBatchMoveSelectedHere();
                  }}
                >
                  {t("Move selected here ({{count}})", {
                    count: selectedMovableIds.length,
                  })}
                </Menu.Item>
              )}

              <Menu.Item
                leftSection={<IconArrowRight size={16} />}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openMoveToModal();
                }}
              >
                {t("Move to...")}
              </Menu.Item>

              <Menu.Item
                leftSection={<IconArrowRight size={16} />}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openMovePageModal();
                }}
              >
                {t("Move to space")}
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
                  openDeleteModal({ onConfirm: () => treeApi?.delete(node) });
                }}
              >
                {t("Move to trash")}
              </Menu.Item>
            </>
          )}
        </Menu.Dropdown>
      </Menu>

      <Modal.Root
        opened={filteredMoveOpened}
        onClose={closeFilteredMoveModal}
        size={500}
        padding="xl"
        yOffset="10vh"
        xOffset={0}
        mah={400}
      >
        <Modal.Overlay blur={1} />
        <Modal.Content style={{ overflow: "hidden" }}>
          <Modal.Header py={0}>
            <Modal.Title fw={500}>{t("Move filtered pages here")}</Modal.Title>
            <Modal.CloseButton />
          </Modal.Header>
          <Modal.Body>
            <Text mb="xs" c="dimmed" size="sm">
              {t(
                "Move all matched pages in this space to the selected folder.",
              )}
            </Text>

            <TextInput
              label={t("Title contains")}
              placeholder={t("e.g. PRD")}
              value={filteredKeyword}
              onChange={(event) =>
                setFilteredKeyword(event.currentTarget.value)
              }
            />

            <Group justify="end" mt="md" gap="xs">
              <Button variant="subtle" onClick={closeFilteredMoveModal}>
                {t("Cancel")}
              </Button>
              <Button onClick={handleBatchMoveFilteredHere}>{t("Move")}</Button>
            </Group>
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>

      <MovePageModal
        pageId={node.id}
        slugId={node.data.slugId}
        currentSpaceSlug={spaceSlug}
        onClose={closeMoveSpaceModal}
        open={movePageModalOpened}
      />

      <MoveToModal
        pageId={node.id}
        pageTitle={node.data.name}
        pageNodeType={node.data.nodeType === "folder" ? "folder" : "file"}
        currentSpaceId={spaceId}
        slugId={node.data.slugId}
        recentScopeId={workspace?.id}
        onClose={closeMoveToModal}
        open={moveToModalOpened}
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
    </>
  );
}

interface PageArrowProps {
  node: NodeApi<SpaceTreeNode>;
  onExpandTree?: () => void;
}

function PageArrow({ node, onExpandTree }: PageArrowProps) {
  useEffect(() => {
    if (node.isOpen && node.data.hasChildren && node.children.length === 0) {
      onExpandTree?.();
    }
  }, []);

  return (
    <ActionIcon
      size={18}
      variant="subtle"
      c="gray"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const shouldOpen = !node.isOpen;
        node.toggle();
        if (shouldOpen) {
          onExpandTree?.();
        }
      }}
    >
      {node.isInternal ? (
        node.children && (node.children.length > 0 || node.data.hasChildren) ? (
          node.isOpen ? (
            <IconChevronDown stroke={1.75} size={16} />
          ) : (
            <IconChevronRight stroke={1.75} size={16} />
          )
        ) : (
          <IconPointFilled size={8} />
        )
      ) : null}
    </ActionIcon>
  );
}
