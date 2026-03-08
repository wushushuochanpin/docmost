import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  getAuditLogs,
  getAuditRetention,
  updateAuditRetention,
} from "../services/audit-service.ts";
import { IAuditLog, IAuditLogParams, IAuditRetention } from "../types/audit.types.ts";
import { IPagination } from "@/lib/types.ts";

export function useAuditLogsQuery(params?: IAuditLogParams) {
  return useQuery<IPagination<IAuditLog>, Error>({
    queryKey: ["audit-logs", params ?? {}],
    queryFn: () => getAuditLogs(params),
    placeholderData: keepPreviousData,
  });
}

export function useAuditRetentionQuery(enabled = true) {
  return useQuery<IAuditRetention, Error>({
    queryKey: ["audit-retention"],
    queryFn: () => getAuditRetention(),
    enabled,
  });
}

export function useUpdateAuditRetentionMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<IAuditRetention, Error, number>({
    mutationFn: (retentionDays) => updateAuditRetention(retentionDays),
    onSuccess: () => {
      notifications.show({ message: t("Audit retention updated") });
      queryClient.invalidateQueries({ queryKey: ["audit-retention"] });
      queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
    },
    onError: (error) => {
      const errorMessage = error["response"]?.data?.message;
      notifications.show({
        message: errorMessage || t("Failed to update retention"),
        color: "red",
      });
    },
  });
}
