import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import {
  getBackupJobs,
  runBackup,
  cleanupStaleBackupJobs,
  deleteBackupArtifact,
  type BackupJob,
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
      notifications.show({ message: "Backup started" });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      const msg = err.response?.data?.message ?? "Failed to start backup";
      notifications.show({ message: msg, color: "red" });
    },
  });
}

export function useCleanupStaleJobsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cleanupStaleBackupJobs,
    onSuccess: (result) => {
      const count = result?.cleanedCount ?? 0;
      notifications.show({
        message:
          count > 0
            ? `Cleared ${count} stale backup job(s)`
            : "No stale backup jobs found",
      });
      queryClient.invalidateQueries({ queryKey: ["backupJobs"] });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      const msg = err.response?.data?.message ?? "Failed to cleanup stale jobs";
      notifications.show({ message: msg, color: "red" });
    },
  });
}

export function useDeleteBackupArtifactMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: string) => deleteBackupArtifact(jobId),
    onSuccess: () => {
      notifications.show({ message: "Backup deleted" });
      queryClient.invalidateQueries({ queryKey: ["backupJobs"] });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      const msg = err.response?.data?.message ?? "Failed to delete backup";
      notifications.show({ message: msg, color: "red" });
    },
  });
}
