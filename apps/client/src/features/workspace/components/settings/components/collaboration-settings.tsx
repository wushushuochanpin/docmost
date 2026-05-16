import { Group, Switch, Text, Tooltip } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useAtom } from "jotai";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { updateWorkspace } from "@/features/workspace/services/workspace-service.ts";
import { isCollaborationEnabled } from "@/lib/config.ts";
import useUserRole from "@/hooks/use-user-role.tsx";
import { useQueryClient } from "@tanstack/react-query";

export default function CollaborationSettings() {
  const { t } = useTranslation();
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const { isAdmin } = useUserRole();
  const queryClient = useQueryClient();
  const instanceCollaborationEnabled = isCollaborationEnabled();
  const workspaceCollaborationEnabled =
    workspace?.settings?.collaboration?.enabled !== false;
  const [checked, setChecked] = useState(workspaceCollaborationEnabled);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setChecked(workspaceCollaborationEnabled);
  }, [workspaceCollaborationEnabled]);

  const applyChange = async (value: boolean) => {
    setIsSaving(true);
    try {
      const updatedWorkspace = await updateWorkspace({
        collaborationEnabled: value,
      });
      setChecked(value);
      setWorkspace(updatedWorkspace);
      queryClient.invalidateQueries({ queryKey: ["collab-token"] });
      queryClient.invalidateQueries({ queryKey: ["workspace"] });
      notifications.show({ message: t("Updated successfully") });
    } catch (err) {
      notifications.show({
        message: err?.response?.data?.message ?? t("Failed to update data"),
        color: "red",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.checked;

    if (value) {
      void applyChange(true);
      return;
    }

    modals.openConfirmModal({
      title: t("Turn off live collaboration"),
      children: (
        <Text size="sm">
          {t(
            "When turned off, editing pages switch to local saving and other members will not see typed changes in real time.",
          )}
        </Text>
      ),
      centered: true,
      labels: { confirm: t("Confirm"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => void applyChange(false),
    });
  };

  const disabled = !isAdmin || !instanceCollaborationEnabled || isSaving;
  const tooltipLabel = !instanceCollaborationEnabled
    ? t("Live collaboration is disabled for this deployment.")
    : !isAdmin
      ? t("Only workspace admins can change this setting.")
      : "";

  return (
    <Group justify="space-between" wrap="nowrap" gap="xl">
      <div>
        <Text size="md">{t("Live collaboration")}</Text>
        <Text size="sm" c="dimmed">
          {t(
            "Allow multiple members to edit the same page together and see collaborator cursors. When off, editing uses local saving.",
          )}
        </Text>
      </div>

      <Tooltip label={tooltipLabel} disabled={!tooltipLabel} refProp="rootRef">
        <Switch
          checked={instanceCollaborationEnabled && checked}
          onChange={handleChange}
          disabled={disabled}
          aria-label={t("Toggle live collaboration")}
        />
      </Tooltip>
    </Group>
  );
}
