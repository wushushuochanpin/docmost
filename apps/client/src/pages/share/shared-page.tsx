import { useNavigate, useParams } from "react-router-dom";
import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { extractPageSlugId } from "@/lib";
import ShareBranding from "@/features/share/components/share-branding.tsx";
import { useAtom } from "jotai";
import {
  sharedAccessTokenAtom,
  sharedShellStateAtom,
} from "@/features/share/atoms/shared-page-atom.ts";
import { getShareLegacyRouteMode } from "@/lib/config.ts";
import SharedPageSkeleton from "@/features/share/components/shared-page-skeleton.tsx";
import SharedPageHtmlContent from "@/features/share/components/shared-page-html-content.tsx";
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
  useShareRobotsMeta,
} from "@/features/share/hooks/use-share-document-title.ts";
import { useShareTranslation } from "@/features/share/share-translations.ts";
import classes from "@/features/share/components/share-page-state.module.css";

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

export default function SharedPage() {
  const { t } = useShareTranslation();
  const { pageSlug } = useParams();
  const { shareId } = useParams();
  const shareLegacyRouteMode = getShareLegacyRouteMode();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);
  const [accessTokens, setAccessTokens] = useAtom(sharedAccessTokenAtom);
  const [, setSharedShellState] = useAtom(sharedShellStateAtom);
  const accessToken = shareId ? accessTokens[shareId] : undefined;

  const shareInput = useMemo(
    () => ({
      pageId: extractPageSlugId(pageSlug),
      shareId,
      accessToken,
    }),
    [accessToken, pageSlug, shareId],
  );
  const { data, isLoading, isError, error } = useShareAsyncResource(
    shareInput.pageId ? () => getSharePageInfo(shareInput) : null,
    [shareInput.pageId, shareInput.shareId, shareInput.accessToken],
    { enabled: Boolean(shareInput.pageId) },
  );
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
  useShareDocumentTitle(data ? `${data.page?.title || t("untitled")}` : undefined);
  useShareRobotsMeta(Boolean(data && !data.share.searchIndexing));

  useEffect(() => {
    if (!data) return;

    if (shareId) {
      if (data.share.key !== shareId) {
        navigate(`/share/${data.share.key}/p/${pageSlug}`, { replace: true });
      }
      return;
    }

    if (
      shareLegacyRouteMode === "redirect_public" &&
      data.share?.key &&
      data.share?.accessMode === "public"
    ) {
      navigate(`/share/${data.share.key}/p/${pageSlug}`, { replace: true });
    }
  }, [shareId, data, pageSlug, navigate, shareLegacyRouteMode]);

  useEffect(() => {
    if (!data) {
      setSharedShellState(null);
      return;
    }

    const canUseStaticHtml = Boolean(data.rendered?.html);

    setSharedShellState({
      includeSubPages: Boolean(data.share.includeSubPages),
      hasLicenseKey: data.hasLicenseKey,
      canUseSearch: Boolean(shareId),
      renderMode: canUseStaticHtml ? "html" : "editor",
      toc: canUseStaticHtml ? (data.rendered?.toc ?? []) : [],
    });
  }, [data, setSharedShellState, shareId]);

  useEffect(() => {
    return () => {
      setSharedShellState(null);
    };
  }, [setSharedShellState]);

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
            <h1 className={classes.stateTitle}>{t("Share link has expired")}</h1>
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

    if (
      code === SHARE_PASSWORD_REQUIRED ||
      code === SHARE_ACCESS_TOKEN_INVALID
    ) {
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
            className={`${classes.statePanel} ${classes.statePanelNarrow}`}
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

    if (code === SHARE_NOT_FOUND || [401, 403, 404].includes(status || 0)) {
      return <ShareNotFound />;
    }

    return (
      <div className={classes.centeredViewport}>
        <section className={classes.statePanel}>
          <h1 className={classes.stateTitle}>{t("Unable to load shared page")}</h1>
          <p className={classes.stateDescription}>
            {getErrorMessage(error) || t("Error fetching page data.")}
          </p>
        </section>
      </div>
    );
  }

  const canUseStaticHtml = Boolean(data.rendered?.html);

  return (
    <div>
      <div className={classes.pageFrame}>
        {canUseStaticHtml ? (
          <SharedPageHtmlContent
            title={data.page.title}
            html={data.rendered?.html || ""}
            interactiveBlocks={data.rendered?.interactiveBlocks || []}
          />
        ) : (
          <Suspense fallback={<SharedPageSkeleton />}>
            <LazyReadonlyPageEditor
              key={data.page.id}
              title={data.page.title}
              content={data.page.content}
              pageId={data.page.id}
            />
          </Suspense>
        )}
      </div>

      {data && !shareId && !data.hasLicenseKey && <ShareBranding />}
    </div>
  );
}
