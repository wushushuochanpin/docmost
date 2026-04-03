import { useLocation, useNavigate, useParams } from "react-router-dom";
import React, {
  Suspense,
  lazy,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { extractPageSlugId } from "@/lib";
import { buildSharedPageUrl } from "@/features/page/page.utils.ts";
import { useAtom, useSetAtom } from "jotai";
import {
  sharedAccessTokenAtom,
  sharedPageTreeAtom,
  sharedPageTreeRequestStateAtom,
  sharedShellStateAtom,
  sharedTreeDataAtom,
  sharedFullScreenAtom,
} from "@/features/share/atoms/shared-page-atom.ts";
import { getShareLegacyRouteMode } from "@/lib/config.ts";
import SharedPageSkeleton from "@/features/share/components/shared-page-skeleton.tsx";
import SharedPageHtmlContent from "@/features/share/components/shared-page-html-content.tsx";
import SharedFolderView from "@/features/share/components/shared-folder-view.tsx";
import {
  getShareInfo,
  getSharePageInfo,
  verifyShareAccess,
} from "@/features/share/services/share-service.ts";
import { useShareAsyncResource } from "@/features/share/hooks/use-share-async-resource.ts";
import { getMyInfo } from "@/features/user/services/user-service.ts";
import ShareNotFound from "@/features/share/components/share-not-found.tsx";
import { lazyShareMantineComponent } from "@/features/share/components/lazy-share-mantine.tsx";
import {
  useShareDocumentTitle,
  useSharePreviewMeta,
  useShareRobotsMeta,
} from "@/features/share/hooks/use-share-document-title.ts";
import { useShareTranslation } from "@/features/share/share-translations.ts";
import { getPublicAppUrl } from "@/lib/config.ts";
import classes from "@/features/share/components/share-page-state.module.css";
import { useWechatShare } from "@/features/share/hooks/use-wechat-share.ts";
import { canUseStaticRenderedHtml } from "@/features/share/rendered-utils.ts";
import { buildSharedPageTree } from "@/features/share/utils.ts";
import SharedSubpagesPanel from "@/features/share/components/shared-subpages-panel.tsx";

const LazyReadonlyPageEditor = lazy(() =>
  lazyShareMantineComponent(
    () => import("@/features/editor/readonly-page-editor.tsx"),
  ),
);

const SHARE_PASSWORD_REQUIRED = "SHARE_PASSWORD_REQUIRED";
const SHARE_ACCESS_TOKEN_INVALID = "SHARE_ACCESS_TOKEN_INVALID";
const SHARE_PASSWORD_INVALID = "SHARE_PASSWORD_INVALID";
const SHARE_EXPIRED = "SHARE_EXPIRED";
const SHARE_NOT_FOUND = "SHARE_NOT_FOUND";
const SHARE_VERIFY_RATE_LIMITED = "SHARE_VERIFY_RATE_LIMITED";

function getErrorCode(error: any): string | undefined {
  const code = error?.response?.data?.code ?? error?.data?.code;
  return typeof code === "string" ? code : undefined;
}

function getErrorStatus(error: any): number | undefined {
  const status =
    error?.status ??
    error?.response?.status ??
    error?.data?.statusCode ??
    error?.response?.data?.statusCode;

  if (typeof status === "number") {
    return status;
  }

  if (typeof status === "string") {
    const parsed = Number(status);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function getErrorMessage(error: any): string | undefined {
  const message = error?.response?.data?.message ?? error?.data?.message;
  if (typeof message === "string") {
    return message;
  }

  if (Array.isArray(message)) {
    const normalized = message
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .join(", ");
    return normalized || undefined;
  }

  return typeof error?.message === "string" ? error.message : undefined;
}

function hasSubpagesBlock(content: unknown): boolean {
  if (!content || typeof content !== "object") {
    return false;
  }

  if (Array.isArray(content)) {
    return content.some((item) => hasSubpagesBlock(item));
  }

  const node = content as Record<string, unknown>;
  if (node.type === "subpages") {
    return true;
  }

  return Object.values(node).some((value) => hasSubpagesBlock(value));
}

export default function SharedPage() {
  const { t } = useShareTranslation();
  const { pageSlug } = useParams();
  const { shareId } = useParams();
  const shareLegacyRouteMode = getShareLegacyRouteMode();
  const navigate = useNavigate();
  const location = useLocation();
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);
  const [accessTokens, setAccessTokens] = useAtom(sharedAccessTokenAtom);
  const [, setSharedShellState] = useAtom(sharedShellStateAtom);
  const [, setSharedPageTree] = useAtom(sharedPageTreeAtom);
  const [, setSharedTreeData] = useAtom(sharedTreeDataAtom);
  const [, setSharedPageTreeRequestState] = useAtom(
    sharedPageTreeRequestStateAtom,
  );
  const setFullScreen = useSetAtom(sharedFullScreenAtom);
  const accessToken = shareId ? accessTokens[shareId] : undefined;

  const shareInput = useMemo(
    () => ({
      pageId: extractPageSlugId(pageSlug),
      shareId,
      accessToken,
    }),
    [accessToken, pageSlug, shareId],
  );
  const { data, isLoading, isError, error, refetch } = useShareAsyncResource(
    shareInput.pageId ? () => getSharePageInfo(shareInput) : null,
    [shareInput.pageId, shareInput.shareId, shareInput.accessToken],
    { enabled: Boolean(shareInput.pageId) },
  );

  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  useEffect(() => {
    if (!isLoading) {
      setLoadingTimedOut(false);
      return;
    }
    const t = setTimeout(() => setLoadingTimedOut(true), 15000);
    return () => clearTimeout(t);
  }, [isLoading]);

  const lastLoggedErrorRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isError || !error) return;
    const win = typeof window !== "undefined" ? (window as any) : undefined;
    if (typeof win?.__shareDebug !== "function") return;
    const err = error as {
      response?: { data?: { code?: string; message?: string }; status?: number };
      status?: number;
      message?: string;
    };
    const code = err?.response?.data?.code ?? "";
    const status = err?.response?.status ?? err?.status ?? "?";
    const msg =
      err?.response?.data?.message ?? err?.message ?? String(error);
    const key = `${code}:${status}:${msg.slice(0, 80)}`;
    if (lastLoggedErrorRef.current === key) return;
    lastLoggedErrorRef.current = key;
    win.__shareDebug(`API error (${status}): ${msg}`);
  }, [isError, error]);

  const isFullScreenState = useMemo(() => {
    if (isLoading) return false;
    if (isError || !data) return true;
    if (!data?.page) return false;
    const folder = data.page.nodeType === "folder";
    const staticHtml = canUseStaticRenderedHtml(data.rendered);
    const legacyEditor = !staticHtml && data.page.content != null;
    return !folder && !staticHtml && !legacyEditor;
  }, [isLoading, isError, data]);

  useLayoutEffect(() => {
    setFullScreen(isFullScreenState);
  }, [isFullScreenState, setFullScreen]);

  const mainErrorStatus = getErrorStatus(error);
  const mainErrorCode = getErrorCode(error);
  const shouldLoadExpiredShareMeta =
    Boolean(shareId) &&
    isError &&
    (mainErrorCode === SHARE_EXPIRED || mainErrorStatus === 410);
  const { data: currentUser } = useShareAsyncResource(
    shouldLoadExpiredShareMeta ? () => getMyInfo() : null,
    [shouldLoadExpiredShareMeta],
    { enabled: shouldLoadExpiredShareMeta },
  );
  const { data: shareMeta } = useShareAsyncResource(
    shouldLoadExpiredShareMeta && shareId
      ? () => getShareInfo(shareId, undefined, true)
      : null,
    [shareId, shouldLoadExpiredShareMeta],
    { enabled: shouldLoadExpiredShareMeta },
  );
  useShareDocumentTitle(
    data ? `${data.page?.title || t("untitled")}` : undefined,
  );
  useSharePreviewMeta(
    data
      ? {
          title: data.page?.title || t("untitled"),
          description: data.page?.excerpt,
          canonicalUrl:
            getPublicAppUrl() +
            buildSharedPageUrl({
              shareId: data.share.key,
              pageSlugId: data.page.slugId,
              pageTitle: data.page.title,
            }),
        }
      : undefined,
  );
  useShareRobotsMeta(Boolean(data && !data.share.searchIndexing));
  useWechatShare({
    enabled: Boolean(data && data.share.accessMode === "public"),
    shareUrl:
      data && data.share?.key
        ? getPublicAppUrl() +
          buildSharedPageUrl({
            shareId: data.share.key,
            pageSlugId: data.page.slugId,
            pageTitle: data.page.title,
          })
        : undefined,
    title: data?.page?.title || t("untitled"),
    description: data?.page?.excerpt,
  });

  useEffect(() => {
    if (!data || isLoading) return;

    const canonicalPath = buildSharedPageUrl({
      shareId: data.share.key,
      pageSlugId: data.page.slugId,
      pageTitle: data.page.title,
    });
    const canonicalTarget = `${canonicalPath}${location.hash}`;

    if (shareId) {
      // Only canonicalize when displayed data matches current URL; otherwise we would
      // redirect back to the previous page while the new page is still loading.
      const currentSlugId = extractPageSlugId(pageSlug);
      const dataMatchesUrl =
        String(data.page.slugId) === String(currentSlugId);
      if (dataMatchesUrl && location.pathname !== canonicalPath) {
        navigate(canonicalTarget, { replace: true });
      }
      return;
    }

    if (
      shareLegacyRouteMode === "redirect_public" &&
      data.share?.key &&
      data.share?.accessMode === "public"
    ) {
      navigate(canonicalTarget, { replace: true });
    }
  }, [
    shareId,
    data,
    isLoading,
    pageSlug,
    navigate,
    shareLegacyRouteMode,
    location.hash,
    location.pathname,
  ]);

  useEffect(() => {
    if (!data) {
      setSharedShellState(null);
      return;
    }

    const canUseStaticHtml = canUseStaticRenderedHtml(data.rendered);

    setSharedShellState({
      includeSubPages:
        Boolean(data.share.includeSubPages) || data.page.nodeType === "folder",
      hasLicenseKey: data.hasLicenseKey,
      canUseSearch: Boolean(shareId),
      renderMode: canUseStaticHtml ? "html" : "editor",
      toc: canUseStaticHtml ? (data.rendered?.toc ?? []) : [],
    });
  }, [data, setSharedShellState, shareId]);

  useEffect(() => {
    if (!data?.pageTree || data.pageTree.length === 0) {
      setSharedPageTree(null);
      setSharedTreeData(null);
      setSharedPageTreeRequestState({ status: "idle", errorMessage: null });
      return;
    }

    const nextSharedPageTree = {
      share: data.share,
      pageTree: data.pageTree,
      hasLicenseKey: data.hasLicenseKey,
    };

    setSharedPageTree(nextSharedPageTree);
    setSharedTreeData(buildSharedPageTree(data.pageTree));
    setSharedPageTreeRequestState({ status: "success", errorMessage: null });
  }, [
    data,
    setSharedPageTree,
    setSharedPageTreeRequestState,
    setSharedTreeData,
  ]);

  useEffect(() => {
    return () => {
      setSharedShellState(null);
      setSharedPageTree(null);
      setSharedTreeData(null);
      setSharedPageTreeRequestState({ status: "idle", errorMessage: null });
    };
  }, [
    setSharedPageTree,
    setSharedPageTreeRequestState,
    setSharedShellState,
    setSharedTreeData,
  ]);

  useEffect(() => {
    if (
      !shareId ||
      !accessToken ||
      mainErrorCode !== SHARE_ACCESS_TOKEN_INVALID
    ) {
      return;
    }

    setAccessTokens((prev) => {
      if (!prev[shareId]) {
        return prev;
      }

      const next = { ...prev };
      delete next[shareId];
      return next;
    });
  }, [accessToken, mainErrorCode, shareId, setAccessTokens]);

  const onVerifyShareAccess = async () => {
    if (!shareId) {
      return;
    }

    setPasswordError(null);
    setIsVerifyingPassword(true);
    try {
      const result = await verifyShareAccess({
        shareId,
        password,
      });

      setAccessTokens((prev) => ({
        ...prev,
        [shareId]: result.accessToken,
      }));
      setPassword("");
    } catch (err) {
      const status = getErrorStatus(err);
      const code = getErrorCode(err);
      if (code === SHARE_PASSWORD_INVALID) {
        setPasswordError(t("Incorrect password"));
        return;
      }

      if (code === SHARE_EXPIRED || status === 410) {
        setPasswordError(t("Share link has expired"));
        return;
      }

      if (code === SHARE_VERIFY_RATE_LIMITED) {
        setPasswordError(t("Too many attempts. Please try again later."));
        return;
      }

      setPasswordError(
        getErrorMessage(err) || t("Failed to verify share password"),
      );
    } finally {
      setIsVerifyingPassword(false);
    }
  };

  if (isLoading) {
    if (loadingTimedOut) {
      return (
        <div className={classes.centeredViewport}>
          <section
            className={`${classes.statePanel} ${classes.statePanelNarrow} ${classes.statePanelPassword}`}
          >
            <h1 className={classes.stateTitle}>{t("Loading timed out")}</h1>
            <p className={classes.stateDescription}>
              {t("Please check your network and try again.")}
            </p>
            <div className={classes.stateActions}>
              <button
                type="button"
                className={classes.primaryButton}
                onClick={() => {
                  setLoadingTimedOut(false);
                  refetch();
                }}
              >
                {t("Retry")}
              </button>
            </div>
          </section>
        </div>
      );
    }
    return <SharedPageSkeleton />;
  }

  if (isError || !data) {
    const status = mainErrorStatus;
    const code = mainErrorCode;
    const canRegenerateLink =
      Boolean(shareId) &&
      Boolean(currentUser?.user?.id) &&
      Boolean(shareMeta?.creatorId) &&
      shareMeta?.creatorId === currentUser?.user?.id;

    if (code === SHARE_EXPIRED || status === 410) {
      return (
        <div className={classes.centeredViewport}>
          <section className={classes.statePanel}>
            <h1 className={classes.stateTitle}>
              {t("Share link has expired")}
            </h1>
            <p className={classes.stateDescription}>
              {t("Ask the owner to regenerate a new link.")}
            </p>
            {canRegenerateLink && (
              <div className={classes.stateActions}>
                <a className={classes.secondaryButton} href="/settings/sharing">
                  {t("Regenerate share link")}
                </a>
              </div>
            )}
          </section>
        </div>
      );
    }

    const isPasswordRequired =
      code === SHARE_PASSWORD_REQUIRED ||
      code === SHARE_ACCESS_TOKEN_INVALID ||
      (status === 401 && Boolean(shareId));

    if (isPasswordRequired) {
      if (!shareId) {
        return (
          <div className={classes.centeredViewport}>
            <section className={classes.statePanel}>
              <h1 className={classes.stateTitle}>{t("Use full share link")}</h1>
              <p className={classes.stateDescription}>
                {t("This shared page requires the full link with share ID.")}
              </p>
            </section>
          </div>
        );
      }

      return (
        <div className={classes.centeredViewport}>
          <section
            className={`${classes.statePanel} ${classes.statePanelNarrow} ${classes.statePanelPassword}`}
          >
            <h1 className={classes.stateTitle}>{t("Password required")}</h1>
            <p className={classes.stateDescription}>
              {t("Enter the password to access this shared page.")}
            </p>

            <div className={classes.field}>
              <label className={classes.label} htmlFor="share-password">
                {t("Password")}
              </label>
              <input
                id="share-password"
                className={`${classes.input} ${
                  passwordError ? classes.inputError : ""
                }`}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    onVerifyShareAccess();
                  }
                }}
                aria-invalid={Boolean(passwordError)}
              />
            </div>

            <div className={classes.stateActions}>
              <button
                type="button"
                className={classes.primaryButton}
                onClick={onVerifyShareAccess}
                disabled={isVerifyingPassword}
              >
                {t("Verify password")}
              </button>
            </div>

            {passwordError && (
              <div className={classes.alert}>{passwordError}</div>
            )}
          </section>
        </div>
      );
    }

    if (code === SHARE_NOT_FOUND || [403, 404].includes(status || 0)) {
      return <ShareNotFound />;
    }

    // With shareId, any other error (401, network, 5xx, or unknown): show password form
    // so user can try; verify will show wrong password / not found as needed.
    if (shareId) {
      return (
        <div className={classes.centeredViewport}>
          <section
            className={`${classes.statePanel} ${classes.statePanelNarrow} ${classes.statePanelPassword}`}
          >
            <h1 className={classes.stateTitle}>{t("Password required")}</h1>
            <p className={classes.stateDescription}>
              {t("Enter the password to access this shared page.")}
            </p>

            <div className={classes.field}>
              <label className={classes.label} htmlFor="share-password">
                {t("Password")}
              </label>
              <input
                id="share-password"
                className={`${classes.input} ${
                  passwordError ? classes.inputError : ""
                }`}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    onVerifyShareAccess();
                  }
                }}
                aria-invalid={Boolean(passwordError)}
              />
            </div>

            <div className={classes.stateActions}>
              <button
                type="button"
                className={classes.primaryButton}
                onClick={onVerifyShareAccess}
                disabled={isVerifyingPassword}
              >
                {t("Verify password")}
              </button>
            </div>

            {passwordError && (
              <div className={classes.alert}>{passwordError}</div>
            )}
          </section>
        </div>
      );
    }

    return (
      <div className={classes.centeredViewport}>
        <section className={classes.statePanel}>
          <h1 className={classes.stateTitle}>
            {t("Unable to load shared page")}
          </h1>
          <p className={classes.stateDescription}>
            {getErrorMessage(error) || t("Error fetching page data.")}
          </p>
        </section>
      </div>
    );
  }

  const isFolder = data.page.nodeType === "folder";
  const canUseStaticHtml = canUseStaticRenderedHtml(data.rendered);
  const canUseLegacyEditor = !canUseStaticHtml && data.page.content != null;
  const shouldShowMobileSubpages =
    !isFolder && !hasSubpagesBlock(data.page.content);

  if (!isFolder && !canUseStaticHtml && !canUseLegacyEditor) {
    return (
      <div className={classes.centeredViewport}>
        <section className={classes.statePanel}>
          <h1 className={classes.stateTitle}>
            {t("Unable to load shared page")}
          </h1>
          <p className={classes.stateDescription}>
            {t("Error fetching page data.")}
          </p>
        </section>
      </div>
    );
  }

  return (
    <div>
      <div className={classes.pageFrame}>
        {isFolder ? (
          <SharedFolderView pageId={data.page.id} title={data.page.title} />
        ) : canUseStaticHtml ? (
          <>
            <SharedPageHtmlContent
              title={data.page.title}
              pageId={data.page.id}
              shareId={shareId}
              accessToken={accessToken}
              rendered={data.rendered!}
            />
            {shouldShowMobileSubpages && (
              <SharedSubpagesPanel pageId={data.page.id} />
            )}
          </>
        ) : (
          <Suspense fallback={<SharedPageSkeleton />}>
            <>
              <LazyReadonlyPageEditor
                key={data.page.id}
                title={data.page.title}
                content={data.page.content}
                pageId={data.page.id}
              />
              {shouldShowMobileSubpages && (
                <SharedSubpagesPanel pageId={data.page.id} />
              )}
            </>
          </Suspense>
        )}
      </div>

    </div>
  );
}
