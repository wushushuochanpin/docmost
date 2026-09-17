import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  getBackupJobs,
  runBackup,
  cleanupStaleBackupJobs,
  clearFailedBackupJobs,
  deleteBackupArtifact,
  type ListBackupJobsResult,
} from "../services/backup-service";

export function useBackupJobsQuery(params?: {
  cursor?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["backupJobs", params?.cursor, params?.limit],
    queryFn: () => getBackupJobs(params),
    placeholderData: keepPreviousData,
  });
}

export function useRunBackupMutation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: runBackup,
    onSuccess: (result) => {
      const job = result?.job;
      if (job) {
        const key: [string, undefined, number] = ["backupJobs", undefined, 20];
        queryClient.setQueryData<ListBackupJobsResult>(key, (old) => ({
          items: [job, ...(old?.items ?? [])],
          nextCursor: old?.nextCursor ?? null,
          hasNextPage: old?.hasNextPage ?? false,
          hasPrevPage: false,
        }));
      }
      queryClient.invalidateQueries({ queryKey: ["backupJobs"] });
      notifications.show({ message: t("Backup started") });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      const msg = err.response?.data?.message ?? t("Failed to start backup");
      notifications.show({ message: msg, color: "red" });
    },
  });
}

export function useCleanupStaleJobsMutation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cleanupStaleBackupJobs,
    onSuccess: (result) => {
      const count = result?.cleanedCount ?? 0;
      notifications.show({
        message:
          count > 0
            ? t("Cleared {{count}} stale backup job(s)", { count })
            : t("No stale backup jobs found"),
      });
      queryClient.invalidateQueries({ queryKey: ["backupJobs"] });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      const msg = err.response?.data?.message ?? t("Failed to cleanup stale jobs");
      notifications.show({ message: msg, color: "red" });
    },
  });
}

export function useClearFailedJobsMutation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: clearFailedBackupJobs,
    onSuccess: (result) => {
      const count = result?.clearedCount ?? 0;
      notifications.show({
        message:
          count > 0
            ? t("Cleared {{count}} failed backup job(s)", { count })
            : t("No failed backup jobs found"),
      });
      queryClient.invalidateQueries({ queryKey: ["backupJobs"] });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      const msg =
        err.response?.data?.message ?? t("Failed to clear failed backup jobs");
      notifications.show({ message: msg, color: "red" });
    },
  });
}

export function useDeleteBackupArtifactMutation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: string) => deleteBackupArtifact(jobId),
    onSuccess: () => {
      notifications.show({ message: t("Backup deleted") });
      queryClient.invalidateQueries({ queryKey: ["backupJobs"] });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      const msg = err.response?.data?.message ?? t("Failed to delete backup");
      notifications.show({ message: msg, color: "red" });
    },
  });
}
