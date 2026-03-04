import { useNavigate, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import {
  useGetShareByIdQuery,
  useSharePageQuery,
  useVerifyShareAccessMutation,
} from "@/features/share/queries/share-query.ts";
import {
  Alert,
  Button,
  Container,
  Group,
  PasswordInput,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import React, { useEffect, useMemo, useState } from "react";
import ReadonlyPageEditor from "@/features/editor/readonly-page-editor.tsx";
import { extractPageSlugId } from "@/lib";
import { Error404 } from "@/components/ui/error-404.tsx";
import ShareBranding from "@/features/share/components/share-branding.tsx";
import { useAtom } from "jotai";
import { sharedAccessTokenAtom } from "@/features/share/atoms/shared-page-atom.ts";
import useCurrentUser from "@/features/user/hooks/use-current-user.ts";
import { getShareLegacyRouteMode } from "@/lib/config.ts";

const SHARE_PASSWORD_REQUIRED = "SHARE_PASSWORD_REQUIRED";
const SHARE_ACCESS_TOKEN_INVALID = "SHARE_ACCESS_TOKEN_INVALID";
const SHARE_PASSWORD_INVALID = "SHARE_PASSWORD_INVALID";
const SHARE_EXPIRED = "SHARE_EXPIRED";
const SHARE_VERIFY_RATE_LIMITED = "SHARE_VERIFY_RATE_LIMITED";

function getErrorCode(error: any): string | undefined {
  return error?.response?.data?.code;
}

export default function SharedPage() {
  const { t } = useTranslation();
  const { pageSlug } = useParams();
  const { shareId } = useParams();
  const shareLegacyRouteMode = getShareLegacyRouteMode();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [accessTokens, setAccessTokens] = useAtom(sharedAccessTokenAtom);
  const accessToken = shareId ? accessTokens[shareId] : undefined;
  const verifyShareAccessMutation = useVerifyShareAccessMutation();
  const { data: currentUser } = useCurrentUser();
  const {
    data: shareMeta,
    error: shareMetaError,
    isError: isShareMetaError,
  } = useGetShareByIdQuery(
    shareId,
    undefined,
    true,
    60 * 1000,
  );

  const shareInput = useMemo(
    () => ({
      pageId: extractPageSlugId(pageSlug),
      shareId,
      accessToken,
    }),
    [accessToken, pageSlug, shareId],
  );

  const { data, isLoading, isError, error } = useSharePageQuery(shareInput);
  const shareMetaStatus =
    (shareMetaError as any)?.["status"] ??
    (shareMetaError as any)?.response?.status;
  const isShareLinkRevoked = Boolean(shareId && isShareMetaError && shareMetaStatus === 404);

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
    if (!isShareLinkRevoked || !shareId) {
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
  }, [isShareLinkRevoked, shareId, setAccessTokens]);

  const onVerifyShareAccess = async () => {
    if (!shareId) {
      return;
    }

    setPasswordError(null);
    try {
      const result = await verifyShareAccessMutation.mutateAsync({
        shareId,
        password,
      });

      setAccessTokens((prev) => ({
        ...prev,
        [shareId]: result.accessToken,
      }));
      setPassword("");
    } catch (err) {
      const code = getErrorCode(err);
      if (code === SHARE_PASSWORD_INVALID) {
        setPasswordError(t("Incorrect password"));
        return;
      }

      if (code === SHARE_EXPIRED) {
        setPasswordError(t("Share link has expired"));
        return;
      }

      if (code === SHARE_VERIFY_RATE_LIMITED) {
        setPasswordError(t("Too many attempts. Please try again later."));
        return;
      }

      setPasswordError(t("Failed to verify share password"));
    }
  };

  if (isLoading) {
    return <></>;
  }

  if (isShareLinkRevoked) {
    return <Error404 />;
  }

  if (isError || !data) {
    const status = (error as any)?.["status"] ?? (error as any)?.response?.status;
    const code = getErrorCode(error);
    const canRegenerateLink =
      Boolean(shareId) &&
      Boolean(currentUser?.user?.id) &&
      Boolean(shareMeta?.creatorId) &&
      shareMeta?.creatorId === currentUser?.user?.id;

    if (code === SHARE_EXPIRED || status === 410) {
      return (
        <Container size={560} py={80}>
          <Stack gap="md" align="center">
            <Title order={3}>{t("Share link has expired")}</Title>
            <Text c="dimmed">{t("Ask the owner to regenerate a new link.")}</Text>
            {canRegenerateLink && (
              <Button
                variant="light"
                onClick={() => navigate("/settings/sharing")}
              >
                {t("Regenerate share link")}
              </Button>
            )}
          </Stack>
        </Container>
      );
    }

    if (code === SHARE_PASSWORD_REQUIRED || code === SHARE_ACCESS_TOKEN_INVALID) {
      if (!shareId) {
        return (
          <Container size={560} py={80}>
            <Stack gap="md" align="center">
              <Title order={3}>{t("Use full share link")}</Title>
              <Text c="dimmed">
                {t("This shared page requires the full link with share ID.")}
              </Text>
            </Stack>
          </Container>
        );
      }

      return (
        <Container size={420} py={80}>
          <Stack gap="md">
            <Title order={3}>{t("Password required")}</Title>
            <Text c="dimmed">
              {t("Enter the password to access this shared page.")}
            </Text>
            <PasswordInput
              label={t("Password")}
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              error={passwordError}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onVerifyShareAccess();
                }
              }}
            />
            <Group>
              <Button
                onClick={onVerifyShareAccess}
                loading={verifyShareAccessMutation.isPending}
              >
                {t("Verify password")}
              </Button>
            </Group>
            {passwordError && (
              <Alert color="red" variant="light">
                {passwordError}
              </Alert>
            )}
          </Stack>
        </Container>
      );
    }

    if ([401, 403, 404].includes(status)) {
      return <Error404 />;
    }
    return <div>{t("Error fetching page data.")}</div>;
  }

  return (
    <div>
      <Helmet>
        <title>{`${data?.page?.title || t("untitled")}`}</title>
        {!data?.share.searchIndexing && (
          <meta name="robots" content="noindex" />
        )}
      </Helmet>

      <Container size={900} p={0}>
        <ReadonlyPageEditor
          key={data.page.id}
          title={data.page.title}
          content={data.page.content}
          pageId={data.page.id}
        />
      </Container>

      {data && !shareId && !data.hasLicenseKey && <ShareBranding />}
    </div>
  );
}
