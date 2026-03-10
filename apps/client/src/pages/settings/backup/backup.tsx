import { useState, useCallback } from "react";
import {
  Alert,
  Group,
  Table,
  Text,
  Badge,
  Button,
  Space,
  Tooltip,
  ActionIcon,
  Menu,
  ThemeIcon,
} from "@mantine/core";
import {
  IconPlayerPlay,
  IconDownload,
  IconRefresh,
  IconDots,
  IconTrash,
  IconInfoCircle,
  IconDeviceFloppy,
  IconCloud,
} from "@tabler/icons-react";
import SettingsTitle from "@/components/settings/settings-title";
import { useTranslation } from "react-i18next";
import { getAppName, isBackupS3Enabled } from "@/lib/config";
import { Helmet } from "react-helmet-async";
import {
  useBackupJobsQuery,
  useRunBackupMutation,
  useCleanupStaleJobsMutation,
  useDeleteBackupArtifactMutation,
} from "@/features/backup/queries/backup-query";
import type {
  BackupJob,
  BackupJobMetadata,
} from "@/features/backup/services/backup-service";
import Paginate from "@/components/common/paginate";
import NoTableResults from "@/components/common/no-table-results";
import { getBackupDownloadUrl } from "@/features/backup/services/backup-service";
import { modals } from "@mantine/modals";

const JOB_STATUS_MAP: Record<
  string,
  { label: string; color: "green" | "yellow" | "red" | "gray" | "blue" }
> = {
  pending: { label: "Pending", color: "gray" },
  running: { label: "Running", color: "blue" },
  success: { label: "Success", color: "green" },
  failed: { label: "Failed", color: "red" },
  canceled: { label: "Canceled", color: "gray" },
};

function formatDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString();
  } catch {
    return "—";
  }
}

function formatSize(bytes: string | null): string {
  if (bytes == null || bytes === "") return "—";
  const n = Number(bytes);
  if (Number.isNaN(n) || n === 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatTrigger(job: BackupJob): string {
  if (job.triggerType === "manual") {
    return job.triggererName ?? "—";
  }
  return "System";
}

function getCopyAvailability(job: BackupJob): {
  hasLocalCopy: boolean;
  hasS3Copy: boolean;
} {
  if (job.status !== "success" || !job.artifactPath || job.artifactDeletedAt) {
    return { hasLocalCopy: false, hasS3Copy: false };
  }

  const metadata = job.metadata as BackupJobMetadata | null;
  const artifactCopies =
    metadata && typeof metadata === "object" ? metadata.artifactCopies : null;

  return {
    hasLocalCopy: Boolean(artifactCopies?.local) || Boolean(job.artifactPath),
    hasS3Copy: Boolean(artifactCopies?.s3),
  };
}

export default function BackupPage() {
  const { t } = useTranslation();
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([]);
  const backupS3Enabled = isBackupS3Enabled();

  const { data, isLoading, refetch, isFetching } = useBackupJobsQuery({
    cursor,
    limit: 20,
  });
  const isInProgress = (status: string) =>
    status === "running" || status === "pending";
  const runMutation = useRunBackupMutation();
  const cleanupMutation = useCleanupStaleJobsMutation();
  const deleteArtifactMutation = useDeleteBackupArtifactMutation();

  const goNext = useCallback(
    (nextCursor: string | null | undefined) => {
      if (nextCursor) {
        setCursorStack((prev) => [...prev, cursor]);
        setCursor(nextCursor);
      }
    },
    [cursor],
  );

  const goPrev = useCallback(() => {
    setCursorStack((prev) => {
      const next = prev.slice(0, -1);
      setCursor(prev[prev.length - 1]);
      return next;
    });
  }, []);

  const handleDownload = useCallback(async (jobId: string) => {
    try {
      const { url } = await getBackupDownloadUrl(jobId);
      window.open(url, "_blank");
    } catch {
      // error already handled by api client or show toast
    }
  }, []);

  const openDeleteModal = useCallback(
    (job: BackupJob) => {
      modals.openConfirmModal({
        title: t("Delete backup"),
        children: (
          <Text size="sm">
            {t(
              "Are you sure you want to delete this backup artifact? The record will remain visible, but this backup will no longer be downloadable or restorable.",
            )}
          </Text>
        ),
        centered: true,
        labels: { confirm: t("Delete"), cancel: t("Cancel") },
        confirmProps: { color: "red" },
        onConfirm: () => deleteArtifactMutation.mutate(job.id),
      });
    },
    [deleteArtifactMutation, t],
  );

  return (
    <>
      <Helmet>
        <title>
          {t("Backup & Restore")} - {getAppName()}
        </title>
      </Helmet>
      <SettingsTitle title={t("Backup & Restore")} />

      <Alert
        mb="md"
        color={backupS3Enabled ? "blue" : "gray"}
        variant="light"
        icon={<IconInfoCircle size={16} />}
      >
        <Text size="sm">
          {backupS3Enabled
            ? t("Current backup mode: local disk + COS/S3 replica.")
            : t(
                "Current backup mode: local disk only. COS/S3 replica is disabled.",
              )}
        </Text>
      </Alert>

      <Group justify="space-between" mb="md">
        <Text size="sm" c="dimmed">
          {t("Trigger a full backup or download a previous backup.")}
        </Text>
        <Button
          leftSection={<IconPlayerPlay size={16} />}
          loading={runMutation.isPending}
          onClick={() => runMutation.mutate()}
        >
          {t("Run backup now")}
        </Button>
        <Button
          variant="light"
          leftSection={<IconRefresh size={16} />}
          loading={cleanupMutation.isPending}
          onClick={() => cleanupMutation.mutate()}
        >
          {t("Cleanup stale jobs")}
        </Button>
      </Group>

      <Space h="md" />

      <Table.ScrollContainer minWidth={700}>
        <Table highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("Started")}</Table.Th>
              <Table.Th>{t("Ended")}</Table.Th>
              <Table.Th>{t("Size")}</Table.Th>
              <Table.Th>{t("Copies")}</Table.Th>
              <Table.Th>{t("Status")}</Table.Th>
              <Table.Th>{t("Triggered by")}</Table.Th>
              <Table.Th>{t("Actions")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading ? (
              <Table.Tr>
                <Table.Td colSpan={7}>
                  <Text size="sm" c="dimmed">
                    {t("Loading...")}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (data?.items?.length ?? 0) > 0 ? (
              (data.items ?? []).map((job) => {
                const statusInfo =
                  JOB_STATUS_MAP[job.status] ?? JOB_STATUS_MAP.pending;
                const copyAvailability = getCopyAvailability(job);

                return (
                  <Table.Tr key={job.id}>
                    <Table.Td>
                      <Text fz="sm">
                        {formatDate(job.startedAt ?? job.createdAt)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text fz="sm">{formatDate(job.endedAt)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text fz="sm">{formatSize(job.artifactSizeBytes)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={6} wrap="nowrap">
                        <Tooltip
                          label={t(
                            copyAvailability.hasLocalCopy
                              ? "Local copy available"
                              : "Local copy unavailable",
                          )}
                        >
                          <ThemeIcon
                            size="sm"
                            radius="xl"
                            variant={
                              copyAvailability.hasLocalCopy
                                ? "light"
                                : "subtle"
                            }
                            color={
                              copyAvailability.hasLocalCopy ? "teal" : "gray"
                            }
                          >
                            <IconDeviceFloppy size={14} stroke={1.8} />
                          </ThemeIcon>
                        </Tooltip>
                        <Tooltip
                          label={t(
                            copyAvailability.hasS3Copy
                              ? "COS/S3 replica available"
                              : "COS/S3 replica unavailable",
                          )}
                        >
                          <ThemeIcon
                            size="sm"
                            radius="xl"
                            variant={
                              copyAvailability.hasS3Copy ? "light" : "subtle"
                            }
                            color={copyAvailability.hasS3Copy ? "blue" : "gray"}
                          >
                            <IconCloud size={14} stroke={1.8} />
                          </ThemeIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={statusInfo.color}>
                        {t(statusInfo.label)}
                      </Badge>
                      {job.artifactDeletedAt && (
                        <Badge variant="outline" color="gray" ml={8}>
                          {t("Artifact deleted")}
                        </Badge>
                      )}
                      {job.status === "failed" && job.errorMessage && (
                        <Tooltip label={job.errorMessage}>
                          <Text fz="xs" c="red" mt={4} lineClamp={1}>
                            {job.errorMessage}
                          </Text>
                        </Tooltip>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text fz="sm">{formatTrigger(job)}</Text>
                    </Table.Td>
                    <Table.Td>
                      {isInProgress(job.status) && (
                        <Button
                          variant="subtle"
                          size="compact-sm"
                          leftSection={<IconRefresh size={14} />}
                          loading={isFetching}
                          onClick={() => refetch()}
                          title={t("Refresh status")}
                        >
                          {t("Refresh")}
                        </Button>
                      )}
                      {job.status === "success" && (
                        <Group gap="xs" wrap="nowrap">
                          {!job.artifactDeletedAt && job.artifactPath && (
                            <Button
                              variant="subtle"
                              size="compact-sm"
                              leftSection={<IconDownload size={14} />}
                              onClick={() => handleDownload(job.id)}
                            >
                              {t("Download")}
                            </Button>
                          )}
                          {!job.artifactDeletedAt && job.artifactPath && (
                            <Menu
                              shadow="xl"
                              position="bottom-end"
                              offset={8}
                              width={180}
                              withArrow
                            >
                              <Menu.Target>
                                <ActionIcon variant="subtle" color="gray">
                                  <IconDots size={16} stroke={1.75} />
                                </ActionIcon>
                              </Menu.Target>
                              <Menu.Dropdown>
                                <Menu.Item
                                  c="red"
                                  onClick={() => openDeleteModal(job)}
                                  leftSection={
                                    <IconTrash size={14} stroke={1.75} />
                                  }
                                  disabled={deleteArtifactMutation.isPending}
                                >
                                  {t("Delete backup")}
                                </Menu.Item>
                              </Menu.Dropdown>
                            </Menu>
                          )}
                        </Group>
                      )}
                    </Table.Td>
                  </Table.Tr>
                );
              })
            ) : (
              <NoTableResults colSpan={7} />
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      {data && (data?.hasNextPage || data?.hasPrevPage) && (
        <Paginate
          hasPrevPage={data.hasPrevPage ?? false}
          hasNextPage={data.hasNextPage ?? false}
          onPrev={goPrev}
          onNext={() => goNext(data?.nextCursor ?? null)}
        />
      )}
    </>
  );
}
