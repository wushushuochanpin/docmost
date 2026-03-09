import { useParams } from "react-router-dom";
import { usePageQuery } from "@/features/page/queries/page-query";
import { Helmet } from "react-helmet-async";
import { extractPageSlugId } from "@/lib";
import { useTranslation } from "react-i18next";
import React, { lazy, Suspense } from "react";
import { EmptyState } from "@/components/ui/empty-state.tsx";
import { IconAlertTriangle, IconFileOff } from "@tabler/icons-react";
import { Button, Center, Loader } from "@mantine/core";
import { Link } from "react-router-dom";
import { ErrorBoundary } from "react-error-boundary";

const LazyFullEditor = lazy(() =>
  import("@/features/editor/full-editor").then((module) => ({
    default: module.FullEditor,
  })),
);
const LazyHistoryModal = lazy(
  () => import("@/features/page-history/components/history-modal"),
);
const LazyPageHeader = lazy(
  () => import("@/features/page/components/header/page-header.tsx"),
);
const LazyFolderView = lazy(() => import("./folder-view"));

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
            <Button variant="default" size="sm" mt="xs" onClick={resetErrorBoundary}>
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

  const {
    data: page,
    isLoading,
    isError,
    error,
  } = usePageQuery({ pageId: extractPageSlugId(pageSlug) });
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
            <Button component={Link} to="/home" variant="default" size="sm" mt="xs">
              {t("Go to homepage")}
            </Button>
          }
        />
      );
    }
    return (
      <EmptyState
        icon={IconFileOff}
        title={t("Error fetching page data.")}
      />
    );
  }

  const canEdit = page.permissions?.canEdit ?? false;
  const isFolder = page.nodeType === "folder";

  return (
    page && (
      <div>
        <Helmet>
          <title>{`${page?.icon || ""}  ${page?.title || t("untitled")}`}</title>
        </Helmet>

        <Suspense fallback={null}>
          <LazyPageHeader
            readOnly={!canEdit}
            pageId={page.id}
            editable={canEdit}
            showEditorToolbar={!isFolder}
          />
        </Suspense>

        {isFolder ? (
          <Suspense fallback={<PageContentLoader />}>
            <LazyFolderView
              folderPage={page}
              readOnly={!canEdit}
              spaceSlug={page?.space?.slug}
            />
          </Suspense>
        ) : (
          <Suspense fallback={<PageContentLoader />}>
            <LazyFullEditor
              key={page.id}
              pageId={page.id}
              title={page.title}
              content={page.content}
              slugId={page.slugId}
              updatedAt={page.updatedAt}
              spaceSlug={page?.space?.slug}
              editable={canEdit}
            />
          </Suspense>
        )}
        <Suspense fallback={null}>
          <LazyHistoryModal pageId={page.id} />
        </Suspense>
      </div>
    )
  );
}
