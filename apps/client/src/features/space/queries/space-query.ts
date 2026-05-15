import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  UseQueryResult,
} from "@tanstack/react-query";
import {
  IAddSpaceMember,
  IChangeSpaceMemberRole,
  IRemoveSpaceMember,
  ISpace,
} from "@/features/space/types/space.types";
import {
  addSpaceMember,
  changeMemberRole,
  createSidebarCategory,
  getSpaceById,
  getSidebarCategories,
  getSpaceMembers,
  getSpaces,
  deleteSidebarCategory,
  removeSpaceMember,
  reorderSidebarCategories,
  createSpace,
  updateSidebarCategory,
  updateSpace,
  deleteSpace,
} from "@/features/space/services/space-service.ts";
import { notifications } from "@mantine/notifications";
import { IPagination, QueryParams } from "@/lib/types.ts";
import { useTranslation } from "react-i18next";
import { queryClient } from "@/query-client.ts";
import { getRecentChanges } from "@/features/page/services/page-service.ts";
import { useEffect } from "react";
import { validate as isValidUuid } from "uuid";
import {
  ICreateSidebarCategoryInput,
  IDeleteSidebarCategoryInput,
  IDeleteSidebarCategoryResult,
  IReorderSidebarCategoriesInput,
  ISidebarCategory,
  IUpdateSidebarCategoryInput,
} from "@/features/space/types/sidebar-category.types.ts";

function invalidateSpaceSidebarNavigation(spaceId: string) {
  queryClient.invalidateQueries({
    queryKey: ["sidebar-categories", spaceId],
  });
  queryClient.invalidateQueries({
    predicate: (query) => {
      if (query.queryKey[0] !== "root-sidebar-pages") {
        return false;
      }

      const params = query.queryKey[1] as { spaceId?: string } | undefined;
      return params?.spaceId === spaceId;
    },
  });
}

export function useGetSpacesQuery(
  params?: QueryParams,
): UseQueryResult<IPagination<ISpace>, Error> {
  return useQuery({
    queryKey: ["spaces", params],
    queryFn: () => getSpaces(params),
    placeholderData: keepPreviousData,
    refetchOnMount: true,
  });
}

export function useSpaceQuery(spaceId: string): UseQueryResult<ISpace, Error> {
  const query = useQuery({
    queryKey: ["space", spaceId],
    queryFn: () => getSpaceById(spaceId),
    enabled: !!spaceId,
  });
  useEffect(() => {
    if (query.data) {
      if (isValidUuid(spaceId)) {
        queryClient.setQueryData(["space", query.data.slug], query.data);
      } else {
        queryClient.setQueryData(["space", query.data.id], query.data);
      }
    }
  }, [query.data]);

  return query;
}

export const prefetchSpace = (spaceSlug: string, spaceId?: string) => {
  queryClient.prefetchQuery({
    queryKey: ["space", spaceSlug],
    queryFn: () => getSpaceById(spaceSlug),
  });

  if (spaceId) {
    // this endpoint only accepts uuid for now
    queryClient.prefetchInfiniteQuery({
      queryKey: ["recent-changes", spaceId],
      queryFn: () => getRecentChanges({ spaceId }),
      initialPageParam: undefined,
    });
  }
};

export function useCreateSpaceMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<ISpace, Error, Partial<ISpace>>({
    mutationFn: (data) => createSpace(data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["spaces"],
      });
      notifications.show({ message: t("Space created successfully") });
    },
    onError: (error) => {
      const errorMessage = error["response"]?.data?.message;
      notifications.show({ message: errorMessage, color: "red" });
    },
  });
}

export function useGetSpaceBySlugQuery(
  spaceId: string,
): UseQueryResult<ISpace, Error> {
  return useQuery({
    queryKey: ["space", spaceId],
    queryFn: () => getSpaceById(spaceId),
    enabled: !!spaceId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSidebarCategoriesQuery(
  spaceId?: string,
): UseQueryResult<ISidebarCategory[], Error> {
  return useQuery({
    queryKey: ["sidebar-categories", spaceId],
    queryFn: () => getSidebarCategories(spaceId!),
    enabled: Boolean(spaceId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateSpaceMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<ISpace, Error, Partial<ISpace>>({
    mutationFn: (data) => updateSpace(data),
    onSuccess: (data, variables) => {
      notifications.show({ message: t("Space updated successfully") });

      const space = queryClient.getQueryData([
        "space",
        variables.spaceId,
      ]) as ISpace;
      if (space) {
        const updatedSpace = { ...space, ...data };
        queryClient.setQueryData(["space", variables.spaceId], updatedSpace);
        queryClient.setQueryData(["space", data.slug], updatedSpace);
      }

      queryClient.invalidateQueries({
        queryKey: ["spaces"],
      });
    },
    onError: (error) => {
      const errorMessage = error["response"]?.data?.message;
      notifications.show({ message: errorMessage, color: "red" });
    },
  });
}

export function useCreateSidebarCategoryMutation() {
  const { t } = useTranslation();

  return useMutation<ISidebarCategory, Error, ICreateSidebarCategoryInput>({
    mutationFn: (data) => createSidebarCategory(data),
    onSuccess: (data) => {
      notifications.show({ message: t("Category created") });
      invalidateSpaceSidebarNavigation(data.spaceId);
    },
    onError: (error) => {
      notifications.show({
        message: error["response"]?.data?.message || t("Failed to create category"),
        color: "red",
      });
    },
  });
}

export function useUpdateSidebarCategoryMutation() {
  const { t } = useTranslation();

  return useMutation<ISidebarCategory, Error, IUpdateSidebarCategoryInput>({
    mutationFn: (data) => updateSidebarCategory(data),
    onSuccess: (data) => {
      notifications.show({ message: t("Category updated") });
      invalidateSpaceSidebarNavigation(data.spaceId);
    },
    onError: (error) => {
      notifications.show({
        message: error["response"]?.data?.message || t("Failed to update category"),
        color: "red",
      });
    },
  });
}

export function useDeleteSidebarCategoryMutation() {
  const { t } = useTranslation();

  return useMutation<
    IDeleteSidebarCategoryResult,
    Error,
    IDeleteSidebarCategoryInput & { spaceId: string }
  >({
    mutationFn: ({ categoryId }) => deleteSidebarCategory({ categoryId }),
    onSuccess: (_data, variables) => {
      notifications.show({ message: t("Category deleted") });
      invalidateSpaceSidebarNavigation(variables.spaceId);
    },
    onError: (error) => {
      notifications.show({
        message: error["response"]?.data?.message || t("Failed to delete category"),
        color: "red",
      });
    },
  });
}

export function useReorderSidebarCategoriesMutation() {
  const { t } = useTranslation();

  return useMutation<ISidebarCategory[], Error, IReorderSidebarCategoriesInput>({
    mutationFn: (data) => reorderSidebarCategories(data),
    onSuccess: (data, variables) => {
      notifications.show({ message: t("Categories reordered") });
      queryClient.setQueryData(["sidebar-categories", variables.spaceId], data);
      invalidateSpaceSidebarNavigation(variables.spaceId);
    },
    onError: (error) => {
      notifications.show({
        message:
          error["response"]?.data?.message || t("Failed to reorder categories"),
        color: "red",
      });
    },
  });
}

export function useDeleteSpaceMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (data: Partial<ISpace>) => deleteSpace(data.id),
    onSuccess: (data, variables) => {
      notifications.show({ message: t("Space deleted successfully") });

      if (variables.slug) {
        queryClient.removeQueries({
          queryKey: ["space", variables.slug],
          exact: true,
        });
      }

      // Remove space-specific queries
      if (variables.id) {
        queryClient.removeQueries({
          queryKey: ["space", variables.id],
          exact: true,
        });

        // Invalidate recent changes
        queryClient.invalidateQueries({
          queryKey: ["recent-changes"],
        });

        queryClient.invalidateQueries({
          queryKey: ["recent-changes", variables.id],
        });
      }

      // Update spaces list cache
      /* const spaces = queryClient.getQueryData(["spaces"]) as any;
      if (spaces) {
        spaces.items = spaces.items?.filter(
          (space: ISpace) => space.id !== variables.id,
        );
        queryClient.setQueryData(["spaces"], spaces);
      }*/

      // Invalidate all spaces queries to refresh lists
      queryClient.invalidateQueries({
        predicate: (item) => ["spaces"].includes(item.queryKey[0] as string),
      });
    },
    onError: (error) => {
      const errorMessage = error["response"]?.data?.message;
      notifications.show({ message: errorMessage, color: "red" });
    },
  });
}

export function useSpaceMembersInfiniteQuery(
  spaceId: string,
  query?: string,
) {
  return useInfiniteQuery({
    queryKey: ["spaceMembers", spaceId, query],
    queryFn: ({ pageParam }) =>
      getSpaceMembers(spaceId, { cursor: pageParam, limit: 50, query }),
    enabled: !!spaceId,
    placeholderData: keepPreviousData,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasNextPage ? lastPage.meta.nextCursor : undefined,
  });
}

export function useAddSpaceMemberMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<void, Error, IAddSpaceMember>({
    mutationFn: (data) => addSpaceMember(data),
    onSuccess: (data, variables) => {
      notifications.show({ message: t("Members added successfully") });
      queryClient.invalidateQueries({
        queryKey: ["spaceMembers", variables.spaceId],
      });
    },
    onError: (error) => {
      const errorMessage = error["response"]?.data?.message;
      notifications.show({ message: errorMessage, color: "red" });
    },
  });
}

export function useRemoveSpaceMemberMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<void, Error, IRemoveSpaceMember>({
    mutationFn: (data) => removeSpaceMember(data),
    onSuccess: (data, variables) => {
      notifications.show({ message: t("Member removed successfully") });
      queryClient.invalidateQueries({
        queryKey: ["spaceMembers", variables.spaceId],
      });
    },
    onError: (error) => {
      const errorMessage = error["response"]?.data?.message;
      notifications.show({ message: errorMessage, color: "red" });
    },
  });
}

export function useChangeSpaceMemberRoleMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<void, Error, IChangeSpaceMemberRole>({
    mutationFn: (data) => changeMemberRole(data),
    onSuccess: (data, variables) => {
      notifications.show({ message: t("Member role updated successfully") });
      // due to pagination levels, change in cache instead
      queryClient.refetchQueries({
        queryKey: ["spaceMembers", variables.spaceId],
      });
    },
    onError: (error) => {
      const errorMessage = error["response"]?.data?.message;
      notifications.show({ message: errorMessage, color: "red" });
    },
  });
}
