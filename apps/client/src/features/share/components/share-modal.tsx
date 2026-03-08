import {
  ActionIcon,
  Alert,
  Anchor,
  Button,
  Group,
  NumberInput,
  Popover,
  Select,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconExternalLink, IconWorld, IconLock, IconCopy } from "@tabler/icons-react";
import React, { useEffect, useMemo, useState } from "react";
import {
  useCreateShareMutation,
  useDeleteShareMutation,
  useReshareShareMutation,
  useShareForPageQuery,
} from "@/features/share/queries/share-query.ts";
import { Link, useNavigate, useParams } from "react-router-dom";
import { extractPageSlugId, getPageIcon } from "@/lib";
import { useTranslation } from "react-i18next";
import { usePageQuery } from "@/features/page/queries/page-query.ts";
import CopyTextButton from "@/components/common/copy.tsx";
import { CopyButton } from "@/components/common/copy-button";
import { getAppUrl, isCloud } from "@/lib/config.ts";
import {
  buildPageUrl,
  buildSharedPageUrl,
} from "@/features/page/page.utils.ts";
import classes from "@/features/share/components/share.module.css";
import ShareWechatPanel from "@/features/share/components/share-wechat-panel.tsx";
import useTrial from "@/ee/hooks/use-trial.tsx";
import { useAtom } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { useSpaceQuery } from "@/features/space/queries/space-query.ts";
import { ShareAccessMode } from "@/features/share/types/share.types.ts";
import { useQueryClient } from "@tanstack/react-query";

interface ShareModalProps {
  readOnly?: boolean;
}

interface ShareContentProps {
  readOnly?: boolean;
  opened?: boolean;
}

const DEFAULT_PROTECTED_TTL_MINUTES = 30;
const MASKED_PASSWORD = "********";

function ShareSettingsPanel({ readOnly, opened = true }: ShareContentProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pageSlug } = useParams();
  const pageSlugId = extractPageSlugId(pageSlug);
  const { data: page } = usePageQuery({ pageId: pageSlugId });
  const pageId = page?.id;
  const {
    data: share,
    isLoading: isShareForPageLoading,
    isFetching: isShareForPageFetching,
    refetch: refetchShareForPage,
  } = useShareForPageQuery(pageId);
  const { spaceSlug } = useParams();
  const { isTrial } = useTrial();
  const [workspace] = useAtom(workspaceAtom);
  const { data: space } = useSpaceQuery(spaceSlug);

  const workspaceDisabled = workspace?.settings?.sharing?.disabled === true;
  const spaceDisabled = space?.settings?.sharing?.disabled === true;
  const sharingDisabled = workspaceDisabled || spaceDisabled;

  const createShareMutation = useCreateShareMutation();
  const deleteShareMutation = useDeleteShareMutation();
  const reshareShareMutation = useReshareShareMutation();

  const pageIsShared = Boolean(share && share.level === 0);
  const isDescendantShared = Boolean(share && share.level > 0);

  const shareExpired =
    pageIsShared &&
    share?.accessMode === "password_expiring" &&
    Boolean(share?.expiresAt) &&
    new Date(share.expiresAt).getTime() <= Date.now();

  const [accessMode, setAccessMode] = useState<ShareAccessMode>("public");
  const [expiresInMinutes, setExpiresInMinutes] = useState<number>(
    DEFAULT_PROTECTED_TTL_MINUTES,
  );
  const [includeSubPages, setIncludeSubPages] = useState<boolean>(true);
  const [keepCurrentLink, setKeepCurrentLink] = useState<boolean>(true);
  const [isReshareDraft, setIsReshareDraft] = useState<boolean>(false);
  const [oneTimePassword, setOneTimePassword] = useState<string | null>(null);

  useEffect(() => {
    if (pageIsShared && !shareExpired) {
      setAccessMode((share.accessMode as ShareAccessMode) || "public");
      setIncludeSubPages(Boolean(share.includeSubPages));

      if (share.accessMode === "password_expiring" && share.expiresAt) {
        const remainingMinutes = Math.ceil(
          (new Date(share.expiresAt).getTime() - Date.now()) / 60_000,
        );
        setExpiresInMinutes(
          Math.min(
            DEFAULT_PROTECTED_TTL_MINUTES,
            Math.max(1, Number.isFinite(remainingMinutes) ? remainingMinutes : 1),
          ),
        );
      } else {
        setExpiresInMinutes(DEFAULT_PROTECTED_TTL_MINUTES);
      }

      setIsReshareDraft(false);
      setKeepCurrentLink(true);
      return;
    }

    setAccessMode("public");
    setExpiresInMinutes(DEFAULT_PROTECTED_TTL_MINUTES);
    setIncludeSubPages(true);
    setKeepCurrentLink(true);
    setIsReshareDraft(false);
  }, [pageIsShared, share?.accessMode, share?.expiresAt, share?.includeSubPages, shareExpired]);

  useEffect(() => {
    if (!opened) {
      setOneTimePassword(null);
      setIsReshareDraft(false);
      setKeepCurrentLink(true);
    }
  }, [opened]);

  const isProtectedMode = accessMode === "password_expiring";
  const hasActiveShare = pageIsShared && !shareExpired;
  const hasShareRecord = pageIsShared;
  const showConfigForm = !hasActiveShare || isReshareDraft;
  const canKeepCurrentLink =
    hasShareRecord &&
    share?.accessMode === "password_expiring" &&
    accessMode === "public";

  const shareLink = useMemo(() => {
    if (!share?.key || !page?.slugId) {
      return "";
    }
    return (
      getAppUrl() +
      buildSharedPageUrl({
        shareId: share.key,
        pageSlugId: page.slugId,
        pageTitle: page.title,
      })
    );
  }, [page?.slugId, page?.title, share?.key]);

  const shareCopyValue = useMemo(() => {
    if (!shareLink) {
      return "";
    }

    if (share?.accessMode !== "password_expiring" || !oneTimePassword) {
      return shareLink;
    }

    return `${shareLink}\n${t("Password")}: ${oneTimePassword}`;
  }, [shareLink, share?.accessMode, oneTimePassword, t]);

  const submitShare = async () => {
    if (!pageId) {
      return;
    }

    const payload = {
      accessMode,
      includeSubPages,
      searchIndexing: false,
      keepLink: canKeepCurrentLink ? keepCurrentLink : false,
      expiresInMinutes: isProtectedMode ? expiresInMinutes : undefined,
    };

    let result: any;

    if (hasShareRecord && share?.id) {
      result = await reshareShareMutation.mutateAsync({
        shareId: share.id,
        ...payload,
      });
    } else {
      result = await createShareMutation.mutateAsync({
        pageId,
        ...payload,
      });
    }

    setOneTimePassword(result?.generatedPassword ?? null);
    await queryClient.invalidateQueries({ queryKey: ["share-for-page", pageId] });
    await refetchShareForPage();
    setIsReshareDraft(false);
  };

  const trySubmitShare = async () => {
    try {
      await submitShare();
    } catch {
      // mutation onError already handles user-facing feedback
    }
  };

  const handleConfirmShare = async () => {
    if (isShareForPageLoading || isShareForPageFetching) {
      return;
    }

    const shouldConfirmKeepLink = canKeepCurrentLink && keepCurrentLink;
    if (shouldConfirmKeepLink) {
      modals.openConfirmModal({
        title: t("Please confirm your action"),
        children: (
          <Text size="sm">
            {t(
              "Warning: If you keep the current link, anyone who already has it can access immediately after switching to public.",
            )}
          </Text>
        ),
        centered: true,
        labels: {
          confirm: t("Confirm"),
          cancel: t("Cancel"),
        },
        confirmProps: { color: "red" },
        onConfirm: () => {
          void trySubmitShare();
        },
      });
      return;
    }

    await trySubmitShare();
  };

  const handleCloseShare = async () => {
    if (!share?.id) {
      return;
    }

    await deleteShareMutation.mutateAsync(share.id);
    setOneTimePassword(null);
    setIsReshareDraft(false);
    setAccessMode("public");
    setExpiresInMinutes(DEFAULT_PROTECTED_TTL_MINUTES);
    setIncludeSubPages(true);
    setKeepCurrentLink(true);
  };

  const handleStartReshare = () => {
    if (!share) {
      return;
    }

    setOneTimePassword(null);
    setAccessMode((share.accessMode as ShareAccessMode) || "public");
    setIncludeSubPages(Boolean(share.includeSubPages));

    if (share.accessMode === "password_expiring" && share.expiresAt) {
      const remainingMinutes = Math.ceil(
        (new Date(share.expiresAt).getTime() - Date.now()) / 60_000,
      );
      setExpiresInMinutes(
        Math.min(
          DEFAULT_PROTECTED_TTL_MINUTES,
          Math.max(1, Number.isFinite(remainingMinutes) ? remainingMinutes : 1),
        ),
      );
    } else {
      setExpiresInMinutes(DEFAULT_PROTECTED_TTL_MINUTES);
    }

    setKeepCurrentLink(true);
    setIsReshareDraft(true);
  };

  const protectedExpiresAt =
    share?.accessMode === "password_expiring" && share?.expiresAt
      ? new Date(share.expiresAt)
      : null;

  return (
    <div style={{ userSelect: "none" }}>
      {isCloud() && isTrial ? (
        <>
          <Group justify="center" mb="sm">
            <IconLock size={20} stroke={1.5} />
          </Group>
          <Text size="sm" ta="center" fw={500} mb="xs">
            {t("Upgrade to share pages")}
          </Text>
          <Text size="sm" c="dimmed" ta="center" mb="sm">
            {t(
              "Page sharing is available on paid plans. Upgrade to share your pages publicly.",
            )}
          </Text>
          <Button
            size="xs"
            onClick={() => navigate("/settings/billing")}
            fullWidth
          >
            {t("Upgrade Plan")}
          </Button>
        </>
      ) : sharingDisabled ? (
        <>
          <Group justify="center" mb="sm">
            <IconLock size={20} stroke={1.5} />
          </Group>
          <Text size="sm" ta="center" fw={500} mb="xs">
            {t("Public sharing is disabled")}
          </Text>
          <Text size="sm" c="dimmed" ta="center">
            {workspaceDisabled
              ? t("Public sharing has been disabled at the workspace level.")
              : t("Public sharing has been disabled for this space.")}
          </Text>
        </>
      ) : isDescendantShared ? (
        <>
          <Text size="sm">{t("Inherits public sharing from")}</Text>
          <Anchor
            size="sm"
            underline="never"
            style={{
              cursor: "pointer",
              color: "var(--mantine-color-text)",
            }}
            component={Link}
            to={buildPageUrl(
              spaceSlug,
              share.sharedPage.slugId,
              share.sharedPage.title,
            )}
          >
            <Group gap="4" wrap="nowrap" my="sm">
              {getPageIcon(share.sharedPage.icon)}
              <div className={classes.shareLinkText}>
                <Text fz="sm" fw={500} lineClamp={1}>
                  {share.sharedPage.title || t("untitled")}
                </Text>
              </div>
            </Group>
          </Anchor>

          {shareLink && (
            <>
              <Group my="sm" gap={4} wrap="nowrap">
                <TextInput
                  variant="default"
                  value={shareLink}
                  readOnly
                  rightSection={<CopyTextButton text={shareCopyValue} />}
                  style={{ width: "100%" }}
                />
                <ActionIcon
                  component="a"
                  variant="default"
                  target="_blank"
                  href={shareLink}
                  size="sm"
                >
                  <IconExternalLink size={16} />
                </ActionIcon>
              </Group>
              {share?.accessMode !== "password_expiring" && (
                <ShareWechatPanel shareLink={shareLink} copyValue={shareCopyValue} />
              )}
            </>
          )}
        </>
      ) : showConfigForm ? (
        <>
          {shareExpired && (
            <Text size="xs" c="dimmed" mb="sm">
              {t("Previous protected share has expired. Configure a new share.")}
            </Text>
          )}

          <Select
            label={t("Sharing mode")}
            data={[
              { value: "public", label: t("Public link") },
              {
                value: "password_expiring",
                label: t("Password protected link"),
              },
            ]}
            value={accessMode}
            onChange={(value) => {
              const nextMode = (value as ShareAccessMode) || "public";
              setAccessMode(nextMode);
              if (nextMode !== "public") {
                setKeepCurrentLink(false);
                return;
              }
              setKeepCurrentLink(true);
            }}
            mb="sm"
            disabled={readOnly}
          />

          {isProtectedMode && (
            <NumberInput
              label={t("Expiry (minutes)")}
              description={t("Maximum 30 minutes")}
              value={expiresInMinutes}
              onChange={(value) =>
                setExpiresInMinutes(Number(value) || DEFAULT_PROTECTED_TTL_MINUTES)
              }
              min={1}
              max={30}
              clampBehavior="strict"
              mb="sm"
              disabled={readOnly}
            />
          )}

          {canKeepCurrentLink && (
            <>
              <Group justify="space-between" wrap="nowrap" gap="xl" mb="xs">
                <div>
                  <Text size="sm">{t("Keep current link")}</Text>
                  <Text size="xs" c="dimmed">
                    {t("Recommended for seamless access")}
                  </Text>
                </div>
                <Switch
                  checked={keepCurrentLink}
                  onChange={(event) => setKeepCurrentLink(event.currentTarget.checked)}
                  size="xs"
                  disabled={readOnly}
                />
              </Group>
              <Alert color="red" variant="light" mb="sm">
                {t(
                  "Warning: If you keep the current link, anyone who already has it can access immediately after switching to public.",
                )}
              </Alert>
            </>
          )}

          <Group justify="space-between" wrap="nowrap" gap="xl" mb="sm">
            <div>
              <Text size="sm">{t("Include sub-pages")}</Text>
              <Text size="xs" c="dimmed">
                {t("Make sub-pages public too")}
              </Text>
            </div>
            <Switch
              checked={includeSubPages}
              onChange={(event) =>
                setIncludeSubPages(event.currentTarget.checked)
              }
              size="xs"
              disabled={readOnly}
            />
          </Group>

          <Button
            fullWidth
            onClick={handleConfirmShare}
            loading={
              createShareMutation.isPending ||
              reshareShareMutation.isPending ||
              deleteShareMutation.isPending ||
              isShareForPageLoading ||
              isShareForPageFetching
            }
            disabled={readOnly || isShareForPageLoading || isShareForPageFetching}
          >
            {t("Confirm sharing")}
          </Button>
        </>
      ) : (
        <>
          {shareLink && (
            <>
              <Group my="sm" gap={4} wrap="nowrap">
                <TextInput
                  variant="default"
                  value={shareLink}
                  readOnly
                  rightSection={<CopyTextButton text={shareCopyValue} />}
                  style={{ width: "100%" }}
                />
                <ActionIcon
                  component="a"
                  variant="default"
                  target="_blank"
                  href={shareLink}
                  size="sm"
                >
                  <IconExternalLink size={16} />
                </ActionIcon>
              </Group>
              {share?.accessMode !== "password_expiring" && (
                <ShareWechatPanel shareLink={shareLink} copyValue={shareCopyValue} />
              )}
            </>
          )}

          <Text size="sm" fw={500} mb={6}>
            {t("Sharing details")}
          </Text>
          <Text size="xs" c="dimmed" mb={4}>
            {t("Sharing mode")}: {share?.accessMode === "password_expiring" ? t("Password protected link") : t("Public link")}
          </Text>
          <Text size="xs" c="dimmed" mb={4}>
            {t("Include sub-pages")}: {share?.includeSubPages ? t("Enabled") : t("Disabled")}
          </Text>

          {share?.accessMode === "password_expiring" && (
            <>
              <Text size="xs" c="dimmed" mb={4}>
                {protectedExpiresAt
                  ? `${t("Expires at")}: ${protectedExpiresAt.toLocaleString()}`
                  : t("Protected share is active")}
              </Text>
              <TextInput
                label={t("Share password")}
                value={oneTimePassword || MASKED_PASSWORD}
                readOnly
                mb="xs"
              />
              {oneTimePassword && (
                <CopyButton value={shareCopyValue} timeout={2000}>
                  {({ copied, copy }) => (
                    <Button
                      variant="light"
                      leftSection={<IconCopy size={14} />}
                      onClick={copy}
                      mb="xs"
                    >
                      {copied ? t("Copied") : t("Copy link and password")}
                    </Button>
                  )}
                </CopyButton>
              )}
              <Text size="xs" c="dimmed" mb="sm">
                {oneTimePassword
                  ? t("Shown once. Save it now.")
                  : t("Password is hidden for security. Reshare to generate a new one.")}
              </Text>
            </>
          )}

          {!readOnly && (
            <Group grow mt="sm">
              <Button
                variant="light"
                onClick={handleStartReshare}
                loading={reshareShareMutation.isPending}
              >
                {t("Reshare")}
              </Button>
              <Button
                color="red"
                variant="light"
                onClick={handleCloseShare}
                loading={deleteShareMutation.isPending}
              >
                {t("Close sharing")}
              </Button>
            </Group>
          )}
        </>
      )}
    </div>
  );
}

export function ShareMenuContent({ readOnly }: ShareContentProps) {
  return (
    <div
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <ShareSettingsPanel readOnly={readOnly} />
    </div>
  );
}

export default function ShareModal({ readOnly }: ShareModalProps) {
  const { t } = useTranslation();
  const { pageSlug } = useParams();
  const pageSlugId = extractPageSlugId(pageSlug);
  const { data: page } = usePageQuery({ pageId: pageSlugId });
  const { data: share } = useShareForPageQuery(page?.id);
  const isPagePublic = Boolean(share);
  const [opened, setOpened] = useState(false);

  return (
    <Popover
      width={350}
      position="bottom"
      withArrow
      shadow="md"
      opened={opened}
      onChange={setOpened}
    >
      <Popover.Target>
        <Button
          size="compact-sm"
          leftSection={
            <IconWorld size={20} stroke={1.5} />
          }
          variant="subtle"
          rightSection={
            isPagePublic ? (
              <Text size="xs" c="green" fw={600}>
                ●
              </Text>
            ) : null
          }
        >
          {t("Share")}
        </Button>
      </Popover.Target>
      <Popover.Dropdown style={{ userSelect: "none" }}>
        <ShareSettingsPanel readOnly={readOnly} opened={opened} />
      </Popover.Dropdown>
    </Popover>
  );
}
