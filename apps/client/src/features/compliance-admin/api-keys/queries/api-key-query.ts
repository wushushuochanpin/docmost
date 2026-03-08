import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  createApiKey,
  getApiKeys,
  revokeApiKey,
} from "../services/api-key-service.ts";
import {
  IApiKey,
  IApiKeyCreateResult,
  IApiKeyListParams,
  ICreateApiKeyInput,
  IRevokeApiKeyInput,
} from "../types/api-key.types.ts";
import { IPagination } from "@/lib/types.ts";

export function useApiKeysQuery(params?: IApiKeyListParams) {
  return useQuery<IPagination<IApiKey>, Error>({
    queryKey: ["api-key-list", params ?? {}],
    queryFn: () => getApiKeys(params),
    placeholderData: keepPreviousData,
  });
}

export function useCreateApiKeyMutation(adminView?: boolean) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<IApiKeyCreateResult, Error, ICreateApiKeyInput>({
    mutationFn: (data) => createApiKey(data, adminView),
    onSuccess: () => {
      notifications.show({ message: t("API key created successfully") });
      queryClient.invalidateQueries({ queryKey: ["api-key-list"] });
      queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
    },
    onError: (error) => {
      const errorMessage = error["response"]?.data?.message;
      notifications.show({
        message: errorMessage || t("Failed to create API key"),
        color: "red",
      });
    },
  });
}

export function useRevokeApiKeyMutation(adminView?: boolean) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<void, Error, IRevokeApiKeyInput>({
    mutationFn: (data) => revokeApiKey(data, adminView),
    onSuccess: () => {
      notifications.show({ message: t("Revoked successfully") });
      queryClient.invalidateQueries({ queryKey: ["api-key-list"] });
      queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
    },
    onError: (error) => {
      const errorMessage = error["response"]?.data?.message;
      notifications.show({
        message: errorMessage || t("Failed to revoke API key"),
        color: "red",
      });
    },
  });
}
