import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { useAtom } from "jotai";
import { Button, Group, Stack, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { getAppName } from "@/lib/config.ts";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import useUserRole from "@/hooks/use-user-role.tsx";
import Paginate from "@/components/common/paginate.tsx";
import { SearchInput } from "@/components/common/search-input.tsx";
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

export default function UserApiKeysPage() {
  const { t } = useTranslation();
  const [workspace] = useAtom(workspaceAtom);
  const { isAdmin } = useUserRole();
  const [opened, setOpened] = useState(false);
  const [createdToken, setCreatedToken] = useState<IApiKeyCreateResult | null>(
    null,
  );
  const [params, setParams] = useState({
    limit: PAGE_LIMIT,
    query: "",
    cursor: undefined as string | undefined,
    beforeCursor: undefined as string | undefined,
  });

  const listQuery = useApiKeysQuery(params);
  const createMutation = useCreateApiKeyMutation(false);
  const revokeMutation = useRevokeApiKeyMutation(false);

  const disableCreate =
    (workspace?.restrictApiToAdmins ||
      workspace?.settings?.api?.restrictToAdmins) &&
    !isAdmin;

  const pagination = listQuery.data?.meta;

  const pageTitle = `${t("API keys")} - ${getAppName()}`;

  const resetCursors = () =>
    setParams((current) => ({
      ...current,
      cursor: undefined,
      beforeCursor: undefined,
    }));

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
    resetCursors();
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

  if (!workspace?.capabilities?.integrationTokens) {
    return (
      <>
        <Helmet>
          <title>{pageTitle}</title>
        </Helmet>
        <SettingsTitle title={t("API keys")} />
        <FeatureDisabledNotice title={t("API keys")} />
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
      </Helmet>

      <SettingsTitle title={t("API keys")} />

      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {t(
            "Create and revoke personal tokens for scripts, integrations, and internal tools.",
          )}
        </Text>

        {disableCreate && (
          <FeatureDisabledNotice
            title={t("API keys")}
            message={t("Workspace policy currently restricts API key creation to admins.")}
          />
        )}

        <Group justify="space-between" align="flex-start">
          <SearchInput
            placeholder={t("Search API keys")}
            onSearch={handleSearch}
          />
          <Button onClick={() => setOpened(true)} disabled={disableCreate}>
            {t("Create API key")}
          </Button>
        </Group>

        <ApiKeyTable
          items={listQuery.data?.items}
          loading={listQuery.isLoading}
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
