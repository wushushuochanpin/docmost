import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { useAtom } from "jotai";
import {
  Button,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { getAppName } from "@/lib/config.ts";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import useUserRole from "@/hooks/use-user-role.tsx";
import Paginate from "@/components/common/paginate.tsx";
import FeatureDisabledNotice from "../../common/feature-disabled-notice.tsx";
import AuditLogTable from "../components/audit-log-table.tsx";
import {
  useAuditLogsQuery,
  useAuditRetentionQuery,
  useUpdateAuditRetentionMutation,
} from "../queries/audit-query.ts";

const PAGE_LIMIT = 50;

const EVENT_OPTIONS = [
  "workspace.updated",
  "user.login",
  "user.role_changed",
  "user.deactivated",
  "user.activated",
  "api_key.created",
  "api_key.deleted",
  "share.created",
  "share.deleted",
  "page.restricted",
  "page.permission_added",
  "page.permission_removed",
].map((value) => ({
  value,
  label: value,
}));

const RESOURCE_OPTIONS = [
  "workspace",
  "user",
  "page",
  "space",
  "group",
  "share",
  "api_key",
  "workspace_invitation",
  "attachment",
  "license",
].map((value) => ({
  value,
  label: value,
}));

export default function AuditLogsPage() {
  const { t } = useTranslation();
  const [workspace] = useAtom(workspaceAtom);
  const { isOwner } = useUserRole();
  const [params, setParams] = useState({
    limit: PAGE_LIMIT,
    event: undefined as string | undefined,
    resourceType: undefined as string | undefined,
    cursor: undefined as string | undefined,
    beforeCursor: undefined as string | undefined,
  });
  const [retentionDays, setRetentionDays] = useState<number | string>(90);

  const logsQuery = useAuditLogsQuery(params);
  const retentionQuery = useAuditRetentionQuery(
    Boolean(workspace?.capabilities?.auditLogs && isOwner),
  );
  const updateRetentionMutation = useUpdateAuditRetentionMutation();

  useEffect(() => {
    if (typeof retentionQuery.data?.retentionDays === "number") {
      setRetentionDays(retentionQuery.data.retentionDays);
    }
  }, [retentionQuery.data?.retentionDays]);

  const pagination = logsQuery.data?.meta;
  const pageTitle = `${t("Audit log")} - ${getAppName()}`;

  if (!workspace?.capabilities?.auditLogs || !isOwner) {
    return (
      <>
        <Helmet>
          <title>{pageTitle}</title>
        </Helmet>
        <SettingsTitle title={t("Audit log")} />
        <FeatureDisabledNotice title={t("Audit log")} />
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
      </Helmet>

      <SettingsTitle title={t("Audit log")} />

      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {t(
            "Review security-sensitive activity across members, tokens, sharing, and workspace settings.",
          )}
        </Text>

        <Paper withBorder p="md" radius="md">
          <Stack gap={8}>
            <Text fw={600}>{t("Audit retention")}</Text>
            <Text size="sm" c="dimmed">
              {t("Choose how long audit events are kept before cleanup tasks remove them.")}
            </Text>
            <Group align="flex-end">
              <NumberInput
                label={t("Retention days")}
                min={7}
                max={3650}
                value={retentionDays}
                onChange={setRetentionDays}
                clampBehavior="strict"
              />
              <Button
                onClick={() =>
                  updateRetentionMutation.mutate(Number(retentionDays))
                }
                loading={updateRetentionMutation.isPending}
                disabled={!retentionDays}
              >
                {t("Save")}
              </Button>
            </Group>
          </Stack>
        </Paper>

        <Group align="flex-end">
          <Select
            label={t("Event")}
            placeholder={t("All events")}
            data={EVENT_OPTIONS}
            clearable
            searchable
            value={params.event ?? null}
            onChange={(value) =>
              setParams((current) => ({
                ...current,
                event: value ?? undefined,
                cursor: undefined,
                beforeCursor: undefined,
              }))
            }
          />
          <Select
            label={t("Resource")}
            placeholder={t("All resources")}
            data={RESOURCE_OPTIONS}
            clearable
            searchable
            value={params.resourceType ?? null}
            onChange={(value) =>
              setParams((current) => ({
                ...current,
                resourceType: value ?? undefined,
                cursor: undefined,
                beforeCursor: undefined,
              }))
            }
          />
          <Button
            variant="default"
            onClick={() =>
              setParams({
                limit: PAGE_LIMIT,
                event: undefined,
                resourceType: undefined,
                cursor: undefined,
                beforeCursor: undefined,
              })
            }
          >
            {t("Reset")}
          </Button>
        </Group>

        <AuditLogTable
          items={logsQuery.data?.items}
          loading={logsQuery.isLoading}
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
    </>
  );
}
