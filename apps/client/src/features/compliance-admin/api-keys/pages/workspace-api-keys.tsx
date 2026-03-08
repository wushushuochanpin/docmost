import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { useAtom } from "jotai";
import {
  Button,
  Group,
  Paper,
  Stack,
  Switch,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { modals } from "@mantine/modals";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { getAppName } from "@/lib/config.ts";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import useUserRole from "@/hooks/use-user-role.tsx";
import Paginate from "@/components/common/paginate.tsx";
import { SearchInput } from "@/components/common/search-input.tsx";
import { updateWorkspace } from "@/features/workspace/services/workspace-service.ts";
import { IWorkspace } from "@/features/workspace/types/workspace.types.ts";
import FeatureDisabledNotice from "../../common/feature-disabled-notice.tsx";
import ApiKeyCreateModal from "../components/api-key-create-modal.tsx";
import ApiKeyTable from "../components/api-key-table.tsx";
import ApiKeyValueModal from "../components/api-key-value-modal.tsx";
import {
  useApiKeysQuery,
  useCreateApiKeyMutation,
  useRevokeApiKeyMutation,
} from "../queries/api-key-query.ts";
import { IApiKey, IApiKeyCreateResult } from "../types/api-key.types.ts";

const PAGE_LIMIT = 20;

export default function WorkspaceApiKeysPage() {
  const { t } = useTranslation();
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const { isAdmin } = useUserRole();
  const queryClient = useQueryClient();
  const [opened, setOpened] = useState(false);
  const [createdToken, setCreatedToken] = useState<IApiKeyCreateResult | null>(
    null,
  );
  const [params, setParams] = useState({
    limit: PAGE_LIMIT,
    query: "",
    cursor: undefined as string | undefined,
    beforeCursor: undefined as string | undefined,
    adminView: true,
  });

  const listQuery = useApiKeysQuery(params);
  const createMutation = useCreateApiKeyMutation(true);
  const revokeMutation = useRevokeApiKeyMutation(true);
  const updateRestrictionMutation = useMutation<
    IWorkspace,
    Error,
    boolean
  >({
    mutationFn: (restrictApiToAdmins) =>
      updateWorkspace({ restrictApiToAdmins }),
    onSuccess: (updatedWorkspace) => {
      setWorkspace(updatedWorkspace);
      queryClient.setQueryData(["workspace"], updatedWorkspace);
      notifications.show({ message: t("Updated successfully") });
      queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
    },
    onError: (error) => {
      const errorMessage = error["response"]?.data?.message;
      notifications.show({
        message: errorMessage || t("Failed to update data"),
        color: "red",
      });
    },
  });

  const pagination = listQuery.data?.meta;
  const restrictToAdmins = Boolean(
    workspace?.restrictApiToAdmins || workspace?.settings?.api?.restrictToAdmins,
  );

  const pageTitle = `${t("API management")} - ${getAppName()}`;

  const handleSearch = (value: string) => {
    setParams((current) => ({
      ...current,
      query: value,
      cursor: undefined,
      beforeCursor: undefined,
    }));
  };

  const handleCreate = async (payload: { name: string; expiresAt?: string | null }) => {
    const result = await createMutation.mutateAsync(payload);
    setCreatedToken(result);
    setOpened(false);
  };

  const openRevokeModal = (token: IApiKey) => {
    modals.openConfirmModal({
      title: t("Revoke API key"),
      centered: true,
      children: (
        <Text size="sm">
          {t("This will immediately disable the token")}{" "}
          <strong>{token.name}</strong>.
        </Text>
      ),
      labels: { confirm: t("Revoke"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => revokeMutation.mutate({ tokenId: token.id }),
    });
  };

  if (!workspace?.capabilities?.workspaceTokenManagement || !isAdmin) {
    return (
      <>
        <Helmet>
          <title>{pageTitle}</title>
        </Helmet>
        <SettingsTitle title={t("API management")} />
        <FeatureDisabledNotice title={t("API management")} />
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
      </Helmet>

      <SettingsTitle title={t("API management")} />

      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {t(
            "Manage workspace-owned tokens and control whether members can create personal API keys.",
          )}
        </Text>

        <Paper withBorder p="md" radius="md">
          <Stack gap={8}>
            <Title order={5}>{t("Restrict personal API keys to admins")}</Title>
            <Text size="sm" c="dimmed">
              {t(
                "When enabled, only workspace admins and owners can create personal API keys.",
              )}
            </Text>
            <Switch
              checked={restrictToAdmins}
              onChange={(event) =>
                updateRestrictionMutation.mutate(event.currentTarget.checked)
              }
              disabled={updateRestrictionMutation.isPending}
              label={restrictToAdmins ? t("Enabled") : t("Disabled")}
            />
          </Stack>
        </Paper>

        <Group justify="space-between" align="flex-start">
          <SearchInput
            placeholder={t("Search API keys")}
            onSearch={handleSearch}
          />
          <Button onClick={() => setOpened(true)}>{t("Create API key")}</Button>
        </Group>

        <ApiKeyTable
          items={listQuery.data?.items}
          loading={listQuery.isLoading}
          showCreator
          showOwner
          onRevoke={openRevokeModal}
        />

        <Paginate
          hasPrevPage={Boolean(pagination?.hasPrevPage)}
          hasNextPage={Boolean(pagination?.hasNextPage)}
          onPrev={() =>
            setParams((current) => ({
              ...current,
              cursor: undefined,
              beforeCursor: pagination?.prevCursor ?? undefined,
            }))
          }
          onNext={() =>
            setParams((current) => ({
              ...current,
              cursor: pagination?.nextCursor ?? undefined,
              beforeCursor: undefined,
            }))
          }
        />
      </Stack>

      <ApiKeyCreateModal
        opened={opened}
        loading={createMutation.isPending}
        onClose={() => setOpened(false)}
        onCreate={handleCreate}
      />

      <ApiKeyValueModal
        opened={Boolean(createdToken)}
        tokenName={createdToken?.name}
        tokenValue={createdToken?.token}
        onClose={() => setCreatedToken(null)}
      />
    </>
  );
}
