import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { readOnlyEditorAtom } from "@/features/editor/atoms/editor-atoms.ts";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  sharedAccessTokenAtom,
  sharedPageTreeRequestStateAtom,
  sharedShellStateAtom,
  sharedPageTreeAtom,
  sharedTreeDataAtom,
  sharedFullScreenAtom,
} from "@/features/share/atoms/shared-page-atom";
import { buildSharedPageTree } from "@/features/share/utils";
import { mobileSidebarAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom.ts";
import { useToggleSidebar } from "@/components/layouts/global/hooks/hooks/use-toggle-sidebar.ts";
import {
  shareDesktopSidebarAtom,
  mobileTableOfContentAsideAtom,
  tableOfContentAsideAtom,
} from "@/features/share/atoms/sidebar-atom.ts";
import {
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
  IconList,
  IconSearch,
} from "@tabler/icons-react";
import { useToggleToc } from "@/features/share/hooks/use-toggle-toc.ts";
import classes from "./share-shell.module.css";
import ShareBranding from "@/features/share/components/share-branding.tsx";
import StaticTableOfContents from "@/features/share/components/static-table-of-contents.tsx";
import { getSharedPageTree } from "@/features/share/services/share-service.ts";
import { useShareAsyncResource } from "@/features/share/hooks/use-share-async-resource.ts";
import { cx } from "@/features/share/classnames.ts";
import { lazyShareMantineComponent } from "./lazy-share-mantine.tsx";
import { useShareTranslation } from "@/features/share/share-translations.ts";
import { ShareWidgetBoundary } from "./share-widget-boundary.tsx";

function getShareTreeErrorMessage(error: unknown): string | null {
  const candidate = error as any;
  const message =
    candidate?.response?.data?.message ??
    candidate?.data?.message ??
    candidate?.message;

  if (typeof message === "string") {
    return message;
  }

  if (Array.isArray(message)) {
    const normalized = message
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .join(", ");
    return normalized || null;
  }

  return null;
}

const LazySharedTree = lazy(() =>
  lazyShareMantineComponent(
    () => import("@/features/share/components/shared-tree.tsx"),
  ),
);
const LazyTableOfContents = lazy(() =>
  lazyShareMantineComponent(async () => {
    const module = await import(
      "@/features/editor/components/table-of-contents/table-of-contents.tsx"
    );
    return { default: module.TableOfContents };
  }),
);
const LazyShareSearchSpotlight = lazy(() =>
  lazyShareMantineComponent(async () => {
    const module = await import(
      "@/features/search/components/share-search-spotlight.tsx"
    );
    return { default: module.ShareSearchSpotlight };
  }),
);

export default function ShareShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useShareTranslation();
  const [mobileOpened] = useAtom(mobileSidebarAtom);
  const [desktopOpened] = useAtom(shareDesktopSidebarAtom);
  const toggleMobile = useToggleSidebar(mobileSidebarAtom);
  const toggleDesktop = useToggleSidebar(shareDesktopSidebarAtom);

  const [tocOpened] = useAtom(tableOfContentAsideAtom);
  const [mobileTocOpened] = useAtom(mobileTableOfContentAsideAtom);
  const toggleTocMobile = useToggleToc(mobileTableOfContentAsideAtom);
  const toggleToc = useToggleToc(tableOfContentAsideAtom);
  const setMobileTocOpened = useSetAtom(mobileTableOfContentAsideAtom);

  const { shareId } = useParams();
  const accessTokens = useAtomValue(sharedAccessTokenAtom);
  const sharedShellState = useAtomValue(sharedShellStateAtom);
  const prefetchedSharedPageTree = useAtomValue(sharedPageTreeAtom);
  const accessToken = shareId ? accessTokens[shareId] : undefined;
  const shouldLoadTree = Boolean(shareId && sharedShellState?.includeSubPages);
  const shouldFetchTree = Boolean(
    shouldLoadTree && shareId && !prefetchedSharedPageTree?.pageTree?.length,
  );
  const canUseSearch = Boolean(shareId && sharedShellState?.canUseSearch);
  const showShareBranding = Boolean(
    shareId && sharedShellState && !sharedShellState.hasLicenseKey,
  );
  const renderMode = sharedShellState?.renderMode ?? "editor";
  const tocItems = sharedShellState?.toc ?? [];
  const hasToc = tocItems.length > 0;
  const fullScreen = useAtomValue(sharedFullScreenAtom);
  const [searchOpenToken, setSearchOpenToken] = useState(0);
  const [isSearchMounted, setIsSearchMounted] = useState(false);
  const { data, error, isError } = useShareAsyncResource(
    shouldFetchTree && shareId
      ? () => getSharedPageTree(shareId, accessToken)
      : null,
    [shareId, accessToken, shouldFetchTree],
    { enabled: shouldFetchTree, keepPreviousData: true },
  );
  const readOnlyEditor = useAtomValue(readOnlyEditorAtom);
  const sharedPageTree = shouldLoadTree
    ? (prefetchedSharedPageTree ?? data ?? null)
    : null;

  const setSharedPageTree = useSetAtom(sharedPageTreeAtom);
  const setSharedTreeData = useSetAtom(sharedTreeDataAtom);
  const setSharedPageTreeRequestState = useSetAtom(
    sharedPageTreeRequestStateAtom,
  );

  const treeData = useMemo(() => {
    if (!sharedPageTree?.pageTree) return null;
    return buildSharedPageTree(sharedPageTree.pageTree);
  }, [sharedPageTree]);
  const hasTree = Boolean(
    sharedPageTree?.pageTree && sharedPageTree.pageTree.length > 1,
  );

  useEffect(() => {
    if (!data?.pageTree) {
      return;
    }

    setSharedPageTree(data);
    setSharedTreeData(buildSharedPageTree(data.pageTree));
  }, [data, setSharedPageTree, setSharedTreeData]);

  useEffect(() => {
    if (!shouldLoadTree) {
      setSharedPageTreeRequestState({ status: "idle", errorMessage: null });
      return;
    }

    if (sharedPageTree?.pageTree?.length) {
      setSharedPageTreeRequestState({ status: "success", errorMessage: null });
      return;
    }

    if (isError) {
      setSharedPageTreeRequestState({
        status: "error",
        errorMessage:
          getShareTreeErrorMessage(error) || t("Error fetching page data."),
      });
      return;
    }

    if (shouldFetchTree) {
      setSharedPageTreeRequestState({ status: "loading", errorMessage: null });
      return;
    }

    setSharedPageTreeRequestState({ status: "idle", errorMessage: null });
  }, [
    error,
    isError,
    setSharedPageTreeRequestState,
    sharedPageTree,
    shouldFetchTree,
    shouldLoadTree,
    t,
  ]);

  useEffect(() => {
    if (!canUseSearch || typeof window === "undefined") {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsSearchMounted(true);
        setSearchOpenToken((prev) => prev + 1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [canUseSearch]);

  const desktopHasLeftSidebar = hasTree && desktopOpened;
  const desktopHasRightSidebar = hasToc && tocOpened;

  const openShareSearch = () => {
    setIsSearchMounted(true);
    setSearchOpenToken((prev) => prev + 1);
  };

  const closeMobileToc = () => {
    setMobileTocOpened(false);
  };

  const renderToc = (options?: { onNavigate?: () => void }) => {
    if (renderMode === "html") {
      return (
        <StaticTableOfContents
          items={tocItems}
          onNavigate={options?.onNavigate}
        />
      );
    }

    return (
      <Suspense fallback={null}>
        {readOnlyEditor && (
          <LazyTableOfContents
            isShare={true}
            editor={readOnlyEditor}
            onNavigate={options?.onNavigate}
          />
        )}
      </Suspense>
    );
  };

  const showDesktopLeftSidebar = desktopHasLeftSidebar && !fullScreen;
  const showDesktopRightSidebar = desktopHasRightSidebar && !fullScreen;
  const showMobileTreeDrawer = hasTree && mobileOpened && !fullScreen;
  const showMobileTocDrawer = hasToc && mobileTocOpened && !fullScreen;
  const showShareSearch = canUseSearch && isSearchMounted && !fullScreen;

  return (
    <div
      className={cx(classes.shell, {
        [classes.shellFullScreen]: fullScreen,
      })}
      data-full-screen={fullScreen ? "" : undefined}
    >
      <header
        className={cx(classes.header, {
          [classes.headerHidden]: fullScreen,
        })}
      >
        <div className={classes.headerInner}>
          <div className={classes.headerGroup}>
            {hasTree && (
              <>
                <button
                  type="button"
                  className={cx(classes.iconButton, classes.mobileOnly, {
                    [classes.iconButtonActive]: mobileOpened,
                  })}
                  onClick={toggleMobile}
                  aria-label={t("Sidebar toggle")}
                  title={t("Sidebar toggle")}
                >
                  {mobileOpened ? (
                    <IconLayoutSidebarRightExpand size={18} stroke={1.75} />
                  ) : (
                    <IconLayoutSidebarRightCollapse size={18} stroke={1.75} />
                  )}
                </button>

                <button
                  type="button"
                  className={cx(classes.iconButton, classes.desktopOnly, {
                    [classes.iconButtonActive]: desktopOpened,
                  })}
                  onClick={toggleDesktop}
                  aria-label={t("Sidebar toggle")}
                  title={t("Sidebar toggle")}
                >
                  {desktopOpened ? (
                    <IconLayoutSidebarRightExpand size={18} stroke={1.75} />
                  ) : (
                    <IconLayoutSidebarRightCollapse size={18} stroke={1.75} />
                  )}
                </button>
              </>
            )}
          </div>

          <div className={cx(classes.headerGroup, classes.headerGroupCenter)}>
            {canUseSearch && (
              <button
                type="button"
                className={cx(classes.searchControl, classes.desktopOnly)}
                onClick={openShareSearch}
                aria-label={t("Search")}
              >
                <IconSearch size={16} stroke={1.75} />
                <span className={classes.searchLabel}>{t("Search")}</span>
                <span className={classes.shortcut}>Ctrl + K</span>
              </button>
            )}
          </div>

          <div className={cx(classes.headerGroup, classes.headerGroupEnd)}>
            {canUseSearch && (
              <button
                type="button"
                className={cx(classes.iconButton, classes.mobileOnly)}
                onClick={openShareSearch}
                aria-label={t("Search")}
                title={t("Search")}
              >
                <IconSearch size={18} stroke={1.75} />
              </button>
            )}

            {hasToc && (
              <>
                <button
                  type="button"
                  className={cx(classes.iconButton, classes.mobileOnly, {
                    [classes.iconButtonActive]: mobileTocOpened,
                  })}
                  onClick={toggleTocMobile}
                  aria-label={t("Table of contents")}
                  title={t("Table of contents")}
                >
                  <IconList size={18} stroke={1.75} />
                </button>

                <button
                  type="button"
                  className={cx(classes.iconButton, classes.desktopOnly, {
                    [classes.iconButtonActive]: desktopHasRightSidebar,
                  })}
                  onClick={toggleToc}
                  aria-label={t("Table of contents")}
                  title={t("Table of contents")}
                >
                  <IconList size={18} stroke={1.75} />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <div
        className={cx(classes.body, {
          [classes.bodyWithLeft]:
            desktopHasLeftSidebar && !desktopHasRightSidebar,
          [classes.bodyWithRight]:
            !desktopHasLeftSidebar && desktopHasRightSidebar,
          [classes.bodyWithBoth]:
            desktopHasLeftSidebar && desktopHasRightSidebar,
          [classes.bodyFullScreen]: fullScreen,
        })}
      >
        {showDesktopLeftSidebar && (
          <aside
            key="share-shell-desktop-nav"
            className={cx(classes.sidebar, classes.desktopNav)}
          >
            <div className={classes.sidebarInner}>
              <ShareWidgetBoundary area="desktop-shared-tree">
                <Suspense fallback={null}>
                  {sharedPageTree && (
                    <LazySharedTree sharedPageTree={sharedPageTree} />
                  )}
                </Suspense>
              </ShareWidgetBoundary>
            </div>
          </aside>
        )}

        <main
          key="share-shell-main"
          className={cx(classes.main, {
            [classes.mainFullScreen]: fullScreen,
          })}
        >
          {children}
          {showShareBranding && !fullScreen && <ShareBranding />}
        </main>

        {showDesktopRightSidebar && (
          <aside
            key="share-shell-desktop-aside"
            className={cx(classes.sidebar, classes.desktopAside)}
          >
            <div className={classes.sidebarInner}>
              <ShareWidgetBoundary area="desktop-table-of-contents">
                {renderToc()}
              </ShareWidgetBoundary>
            </div>
          </aside>
        )}
      </div>

      {showMobileTreeDrawer && (
        <>
          <button
            type="button"
            className={classes.drawerBackdrop}
            onClick={toggleMobile}
            aria-label={t("Close sidebar")}
          />
          <aside className={cx(classes.drawer, classes.drawerLeft)}>
            <div className={classes.drawerInner}>
              <ShareWidgetBoundary area="mobile-shared-tree">
                <Suspense fallback={null}>
                  {sharedPageTree && (
                    <LazySharedTree sharedPageTree={sharedPageTree} />
                  )}
                </Suspense>
              </ShareWidgetBoundary>
            </div>
          </aside>
        </>
      )}

      {showMobileTocDrawer && (
        <>
          <button
            type="button"
            className={classes.drawerBackdrop}
            onClick={toggleTocMobile}
            aria-label={t("Close table of contents")}
          />
          <aside className={cx(classes.drawer, classes.drawerRight)}>
            <div className={classes.drawerInner}>
              <ShareWidgetBoundary area="mobile-table-of-contents">
                {renderToc({ onNavigate: closeMobileToc })}
              </ShareWidgetBoundary>
            </div>
          </aside>
        </>
      )}

      {showShareSearch && (
        <ShareWidgetBoundary area="share-search">
          <Suspense fallback={null}>
            <LazyShareSearchSpotlight
              shareId={shareId}
              accessToken={accessToken}
              openToken={searchOpenToken}
            />
          </Suspense>
        </ShareWidgetBoundary>
      )}
    </div>
  );
}
