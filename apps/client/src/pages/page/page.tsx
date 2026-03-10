import { useParams } from "react-router-dom";
import { usePageQuery } from "@/features/page/queries/page-query";
import { getPageRenderedSegment } from "@/features/page/services/page-service.ts";
import HistoryModal from "@/features/page-history/components/history-modal";
import { Helmet } from "react-helmet-async";
import PageHeader from "@/features/page/components/header/page-header.tsx";
import { extractPageSlugId } from "@/lib";
import { useTranslation } from "react-i18next";
import React, { Suspense, lazy, useCallback, useEffect, useMemo } from "react";
import { EmptyState } from "@/components/ui/empty-state.tsx";
import { IconAlertTriangle, IconFileOff } from "@tabler/icons-react";
import { Button, Center, Loader } from "@mantine/core";
import { Link } from "react-router-dom";
import { ErrorBoundary } from "react-error-boundary";
import FolderView from "./folder-view";
import ReadonlyPageEditor from "@/features/editor/readonly-page-editor.tsx";
import { useAtomValue, useSetAtom } from "jotai";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom.ts";
import {
  editorFontSizePreferenceAtom,
  pageEditModePreferenceAtom,
} from "@/features/editor/atoms/editor-view-preference-atoms.ts";
import { PageEditMode } from "@/features/user/types/user.types.ts";
import { pageStaticTocAtom } from "@/features/page/atoms/page-static-render-atom.ts";
import {
  extractEditorFontSizeFromUser,
  getEditorFontScale,
} from "@/features/editor/utils/editor-font-size-utils.ts";
import { normalizeProsemirrorContent } from "@/features/editor/utils/prosemirror-content.ts";
import PageStaticHtmlContent from "@/features/page/components/page-static-html-content.tsx";
import { canUseStaticRenderedHtml } from "@/features/share/rendered-utils.ts";

const MemoizedPageHeader = React.memo(PageHeader);
const MemoizedHistoryModal = React.memo(HistoryModal);
const MemoizedReadonlyPageEditor = React.memo(ReadonlyPageEditor);
const MemoizedPageStaticHtmlContent = React.memo(PageStaticHtmlContent);
const LazyFullEditor = lazy(() =>
  import("@/features/editor/full-editor").then((module) => ({
    default: module.FullEditor,
  })),
);

function PageContentLoader() {
  return (
    <Center mih="40vh">
      <Loader size="sm" />
    </Center>
  );
}

export default function Page() {
  const { t } = useTranslation();
  const { pageSlug } = useParams();

  return (
    <ErrorBoundary
      resetKeys={[pageSlug]}
      fallbackRender={({ resetErrorBoundary }) => (
        <EmptyState
          icon={IconAlertTriangle}
          title={t("Failed to load page. An error occurred.")}
          action={
            <Button
              variant="default"
              size="sm"
              mt="xs"
              onClick={resetErrorBoundary}
            >
              {t("Try again")}
            </Button>
          }
        />
      )}
    >
      <PageContent pageSlug={pageSlug} />
    </ErrorBoundary>
  );
}

function PageContent({ pageSlug }: { pageSlug: string | undefined }) {
  const { t } = useTranslation();
  const currentUser = useAtomValue(currentUserAtom);
  const localPageEditMode = useAtomValue(pageEditModePreferenceAtom);
  const localEditorFontSize = useAtomValue(editorFontSizePreferenceAtom);
  const setPageStaticToc = useSetAtom(pageStaticTocAtom);
  const pageId = extractPageSlugId(pageSlug);
  const userPageEditMode =
    localPageEditMode ??
    currentUser?.user?.settings?.preferences?.pageEditMode ??
    PageEditMode.Edit;
  const editorFontScale = getEditorFontScale(
    localEditorFontSize ?? extractEditorFontSizeFromUser(currentUser?.user),
  );
  const wantsReadExperience = userPageEditMode === PageEditMode.Read;
  const pageQueryInput = useMemo(
    () => ({
      pageId,
      includeContent: wantsReadExperience ? false : true,
      includeRendered: wantsReadExperience,
      preferStaticReadonly: wantsReadExperience ? false : true,
    }),
    [pageId, wantsReadExperience],
  );

  const {
    data: page,
    isLoading,
    isError,
    error,
  } = usePageQuery(pageQueryInput);

  const canManagePage = page?.permissions?.canEdit ?? false;
  const isFolder = page?.nodeType === "folder";
  const useReadExperience =
    !page || !canManagePage || userPageEditMode === PageEditMode.Read;
  const canUseStaticHtml = canUseStaticRenderedHtml(page?.rendered);
  const canEdit = Boolean(page && canManagePage && !useReadExperience);
  const normalizedPageContent = useMemo(() => {
    if (!page || isFolder) {
      return undefined;
    }

    return normalizeProsemirrorContent(page.content);
  }, [isFolder, page]);

  useEffect(() => {
    if (page && !isFolder && useReadExperience && canUseStaticHtml) {
      setPageStaticToc(page.rendered?.toc ?? []);
      return;
    }

    setPageStaticToc([]);
  }, [canUseStaticHtml, isFolder, page, setPageStaticToc, useReadExperience]);

  useEffect(() => {
    return () => {
      setPageStaticToc([]);
    };
  }, [setPageStaticToc]);

  const loadRenderedSegment = useCallback(
    (cursor: string) => {
      if (!page?.id) {
        return Promise.reject(new Error("Page is not ready"));
      }

      return getPageRenderedSegment({
        pageId: page.id,
        cursor,
      });
    },
    [page?.id],
  );

  if (isLoading) {
    return <PageContentLoader />;
  }

  if (isError || !page) {
    if ([401, 403, 404].includes(error?.["status"])) {
      return (
        <EmptyState
          icon={IconFileOff}
          title={t("Page not found")}
          description={t(
            "This page may have been deleted, moved, or you may not have access.",
          )}
          action={
            <Button
              component={Link}
              to="/home"
              variant="default"
              size="sm"
              mt="xs"
            >
              {t("Go to homepage")}
            </Button>
          }
        />
      );
    }
    return (
      <EmptyState icon={IconFileOff} title={t("Error fetching page data.")} />
    );
  }

  return (
    page && (
      <div>
        <Helmet>
          <title>{`${page?.icon || ""}  ${page?.title || t("untitled")}`}</title>
        </Helmet>

        <MemoizedPageHeader
          readOnly={!canManagePage}
          pageId={page.id}
          page={page}
          editable={canEdit}
          showEditorToolbar={!isFolder}
        />

        {isFolder ? (
          <FolderView
            folderPage={page}
            readOnly={useReadExperience}
            spaceSlug={page?.space?.slug}
          />
        ) : useReadExperience && canUseStaticHtml ? (
          <MemoizedPageStaticHtmlContent
            title={page.title}
            rendered={page.rendered!}
            loadSegment={loadRenderedSegment}
            fontScale={editorFontScale}
          />
        ) : useReadExperience ? (
          <MemoizedReadonlyPageEditor
            pageId={page.id}
            title={page.title}
            content={normalizedPageContent}
          />
        ) : (
          <Suspense fallback={<PageContentLoader />}>
            <LazyFullEditor
              key={page.id}
              pageId={page.id}
              title={page.title}
              content={normalizedPageContent}
              slugId={page.slugId}
              updatedAt={page.updatedAt}
              spaceSlug={page?.space?.slug}
              editable={canEdit}
            />
          </Suspense>
        )}
        <MemoizedHistoryModal pageId={page.id} />
      </div>
    )
  );
}
