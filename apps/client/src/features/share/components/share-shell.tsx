import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { readOnlyEditorAtom } from "@/features/editor/atoms/editor-atoms.ts";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  sharedAccessTokenAtom,
  sharedShellStateAtom,
  sharedPageTreeAtom,
  sharedTreeDataAtom,
} from "@/features/share/atoms/shared-page-atom";
import { buildSharedPageTree } from "@/features/share/utils";
import {
  mobileSidebarAtom,
} from "@/components/layouts/global/hooks/atoms/sidebar-atom.ts";
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
  const accessToken = shareId ? accessTokens[shareId] : undefined;
  const shouldLoadTree = Boolean(shareId && sharedShellState?.includeSubPages);
  const canUseSearch = Boolean(shareId && sharedShellState?.canUseSearch);
  const showShareBranding = Boolean(
    shareId && sharedShellState && !sharedShellState.hasLicenseKey,
  );
  const renderMode = sharedShellState?.renderMode ?? "editor";
  const tocItems = sharedShellState?.toc ?? [];
  const [searchOpenToken, setSearchOpenToken] = useState(0);
  const [isSearchMounted, setIsSearchMounted] = useState(false);
  const { data } = useShareAsyncResource(
    shouldLoadTree && shareId
      ? () => getSharedPageTree(shareId, accessToken)
      : null,
    [shareId, accessToken, shouldLoadTree],
    { enabled: shouldLoadTree, keepPreviousData: true },
  );
  const readOnlyEditor = useAtomValue(readOnlyEditorAtom);
  const sharedPageTree = shouldLoadTree ? data || null : null;

  const [, setSharedPageTree] = useAtom(sharedPageTreeAtom);
  const [, setSharedTreeData] = useAtom(sharedTreeDataAtom);

  // Build and set the tree data when it changes
  const treeData = useMemo(() => {
    if (!sharedPageTree?.pageTree) return null;
    return buildSharedPageTree(sharedPageTree.pageTree);
  }, [sharedPageTree]);
  const hasTree = Boolean(
    sharedPageTree?.pageTree && sharedPageTree.pageTree.length > 1,
  );

  useEffect(() => {
    setSharedPageTree(sharedPageTree);
    setSharedTreeData(treeData);
  }, [sharedPageTree, treeData, setSharedPageTree, setSharedTreeData]);

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
  const desktopHasRightSidebar = tocOpened;

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

  return (
    <div className={classes.shell}>
      <header className={classes.header}>
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
          </div>
        </div>
      </header>

      <div
        className={cx(classes.body, {
          [classes.bodyWithLeft]: desktopHasLeftSidebar && !desktopHasRightSidebar,
          [classes.bodyWithRight]:
            !desktopHasLeftSidebar && desktopHasRightSidebar,
          [classes.bodyWithBoth]:
            desktopHasLeftSidebar && desktopHasRightSidebar,
        })}
      >
        {desktopHasLeftSidebar && (
          <aside className={cx(classes.sidebar, classes.desktopNav)}>
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

        <main className={classes.main}>
          {children}
          {showShareBranding && <ShareBranding />}
        </main>

        {desktopHasRightSidebar && (
          <aside className={cx(classes.sidebar, classes.desktopAside)}>
            <div className={classes.sidebarInner}>
              <ShareWidgetBoundary area="desktop-table-of-contents">
                {renderToc()}
              </ShareWidgetBoundary>
            </div>
          </aside>
        )}
      </div>

      {hasTree && mobileOpened && (
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

      {mobileTocOpened && (
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

      {canUseSearch && isSearchMounted && (
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
