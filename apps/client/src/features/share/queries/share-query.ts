import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  UseQueryResult,
} from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  ICreateShare,
  IReshareShareInput,
  IShare,
  ISharedItem,
  ISharedPage,
  ISharedPageTree,
  IShareForPage,
  IShareInfoInput,
  IUpdateShare,
  IVerifyShareAccessInput,
  IVerifyShareAccessOutput,
} from "@/features/share/types/share.types.ts";
import {
  createShare,
  deleteShare,
  reshareShare,
  getSharedPageTree,
  getShareForPage,
  getShareInfo,
  getSharePageInfo,
  getShares,
  updateShare,
  verifyShareAccess,
} from "@/features/share/services/share-service.ts";
import { IPagination, QueryParams } from "@/lib/types.ts";

interface ShareQueryOptions {
  enabled?: boolean;
}

export function useGetSharesQuery(
  params?: QueryParams,
): UseQueryResult<IPagination<ISharedItem>, Error> {
  return useQuery({
    queryKey: ["share-list", params],
    queryFn: () => getShares(params),
    placeholderData: keepPreviousData,
  });
}

export function useGetShareByIdQuery(
  shareId?: string,
  accessToken?: string,
  metadataOnly?: boolean,
  refetchIntervalMs?: number,
  options?: ShareQueryOptions,
): UseQueryResult<IShare, Error> {
  const query = useQuery({
    queryKey: ["share-by-id", shareId, accessToken, metadataOnly],
    queryFn: () => getShareInfo(shareId!, accessToken, metadataOnly),
    enabled: (options?.enabled ?? true) && !!shareId,
    retry: false,
    refetchInterval: refetchIntervalMs || false,
  });

  return query;
}

export function useSharePageQuery(
  shareInput: Partial<IShareInfoInput>,
): UseQueryResult<ISharedPage, Error> {
  const query = useQuery({
    queryKey: ["shares", shareInput],
    queryFn: () => getSharePageInfo(shareInput),
    enabled: !!shareInput.pageId,
    retry: false,
  });

  return query;
}

export function useShareForPageQuery(
  pageId: string,
): UseQueryResult<IShareForPage, Error> {
  const query = useQuery({
    queryKey: ["share-for-page", pageId],
    queryFn: () => getShareForPage(pageId),
    enabled: !!pageId,
    staleTime: 60 * 1000,
    retry: false,
  });

  return query;
}

export function useCreateShareMutation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation<any, Error, ICreateShare>({
    mutationFn: (data) => createShare(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        predicate: (item) =>
          ["share-for-page", "share-list"].includes(item.queryKey[0] as string),
      });
    },
    onError: (error) => {
      notifications.show({ message: t("Failed to share page"), color: "red" });
    },
  });
}

export function useUpdateShareMutation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation<any, Error, IUpdateShare>({
    mutationFn: (data) => updateShare(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        predicate: (item) =>
          ["share-for-page", "share-list"].includes(item.queryKey[0] as string),
      });
    },
    onError: (error, params) => {
      if (error?.["status"] === 404) {
        queryClient.removeQueries({
          predicate: (item) =>
            ["share-for-page"].includes(item.queryKey[0] as string),
        });

        notifications.show({
          message: t("Share not found"),
          color: "red",
        });
        return;
      }

      notifications.show({
        message: error?.["response"]?.data?.message || "Share not found",
        color: "red",
      });
    },
  });
}

export function useDeleteShareMutation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (shareId: string) => deleteShare(shareId),
    onSuccess: (data) => {
      queryClient.removeQueries({
        predicate: (item) =>
          ["share-for-page"].includes(item.queryKey[0] as string),
      });

      queryClient.invalidateQueries({
        predicate: (item) =>
          ["share-list"].includes(item.queryKey[0] as string),
      });

      notifications.show({ message: t("Share deleted successfully") });
    },
    onError: (error) => {
      if (error?.["status"] === 404) {
        queryClient.removeQueries({
          predicate: (item) =>
            ["share-for-page"].includes(item.queryKey[0] as string),
        });
      }

      notifications.show({
        message: error?.["response"]?.data?.message || "Failed to delete share",
        color: "red",
      });
    },
  });
}

export function useGetSharedPageTreeQuery(
  shareId?: string,
  accessToken?: string,
  options?: ShareQueryOptions,
): UseQueryResult<ISharedPageTree, Error> {
  return useQuery({
    queryKey: ["shared-page-tree", shareId, accessToken],
    queryFn: () => getSharedPageTree(shareId!, accessToken),
    enabled: (options?.enabled ?? true) && !!shareId,
    placeholderData: keepPreviousData,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
}

export function useVerifyShareAccessMutation() {
  return useMutation<IVerifyShareAccessOutput, Error, IVerifyShareAccessInput>({
    mutationFn: (data) => verifyShareAccess(data),
  });
}

export function useReshareShareMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<any, Error, IReshareShareInput>({
    mutationFn: (data) => reshareShare(data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (item) =>
          ["share-for-page", "share-list"].includes(item.queryKey[0] as string),
      });
      notifications.show({
        message: t("Share link regenerated"),
      });
    },
    onError: (error) => {
      notifications.show({
        message:
          error?.["response"]?.data?.message || "Failed to regenerate share",
        color: "red",
      });
    },
  });
}
