import api from "@/lib/api-client";
import type { DurableProvider } from "@/features/editor/durable/durable-provider";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useParams } from "react-router-dom";
import {
  activeHistoryIdAtom,
  historyAtoms,
} from "@/features/page-history/atoms/history-atoms";
import { usePageHistoryQuery } from "@/features/page-history/queries/page-history-query";
import {
  pageEditorAtom,
  titleEditorAtom,
} from "@/features/editor/atoms/editor-atoms";
import { useSpaceAbility } from "@/features/space/permissions/use-space-ability";
import { useSpaceQuery } from "@/features/space/queries/space-query";
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from "@/features/space/permissions/permissions.type";

export function useHistoryRestore() {
  const { t } = useTranslation();
  const identity = useRef(0);

  const activeHistoryId = useAtomValue(activeHistoryIdAtom);
  const { data: activeHistoryData } = usePageHistoryQuery(activeHistoryId);

  const mainEditor = useAtomValue(pageEditorAtom);
  const mainEditorTitle = useAtomValue(titleEditorAtom);
  const setHistoryModalOpen = useSetAtom(historyAtoms);

  const { spaceSlug } = useParams();
  const { data: space } = useSpaceQuery(spaceSlug);
  const spaceAbility = useSpaceAbility(space?.membership?.permissions);

  useEffect(() => {
    identity.current++;
    return () => {
      identity.current++;
    };
  }, [mainEditor, activeHistoryId]);

  const canRestore =
    !!activeHistoryData &&
    spaceAbility.can(SpaceCaslAction.Manage, SpaceCaslSubject.Page);

  const handleRestore = useCallback(
    async (version: string | null, confirmation: number) => {
      if (!activeHistoryData || confirmation !== identity.current) return;
      const provider = (mainEditor?.storage as any)?.durableProvider as
        | DurableProvider
        | undefined;
      if (provider) {
        if (!version || !provider.canRestore) {
          notifications.show({
            color: "orange",
            message: t("文档正在保存或暂时无法编辑，请稍后重试。"),
          });
          return;
        }
        try {
          const result = await provider.restore(activeHistoryData.id, version);
          if (confirmation !== identity.current) return;
          mainEditorTitle?.commands.setContent(result.title ?? "", {
            emitUpdate: false,
          });
          setHistoryModalOpen(false);
          notifications.show({ message: t("Successfully restored") });
        } catch {
          notifications.show({
            color: "orange",
            message: t(
              "文档可能已变化或恢复结果尚未确认，请核对最新文档后重新确认。",
            ),
          });
        }
        return;
      }

      mainEditorTitle
        .chain()
        .clearContent()
        .setContent(activeHistoryData.title, { emitUpdate: true })
        .run();

      mainEditor
        .chain()
        .clearContent()
        .setContent(activeHistoryData.content)
        .run();

      setHistoryModalOpen(false);
      notifications.show({ message: t("Successfully restored") });
    },
    [activeHistoryData, mainEditor, mainEditorTitle, setHistoryModalOpen, t],
  );

  const confirmRestore = useCallback(async () => {
    if (!activeHistoryData) return;
    const current = ++identity.current;
    let version: string | null = null;
    const provider = (mainEditor?.storage as any)?.durableProvider as
      | DurableProvider
      | undefined;
    if (provider) {
      if (!provider.canRestore) {
        notifications.show({
          color: "orange",
          message: t("文档正在保存或暂时无法编辑，请稍后重试。"),
        });
        return;
      }
      try {
        const { data } = await api.get<{ versionToken: string }>(
          `/document-runtime/${activeHistoryData?.pageId}`,
        );
        if (current !== identity.current) return;
        version = data.versionToken;
      } catch {
        notifications.show({
          color: "red",
          message: t("无法确认最新版本，请重试。"),
        });
        return;
      }
    }

    modals.openConfirmModal({
      zIndex: 400,
      title: t("Please confirm your action"),
      children: (
        <Text size="sm">
          {t(
            "Are you sure you want to restore this version? Any changes not versioned will be lost.",
          )}
        </Text>
      ),
      labels: { confirm: t("Confirm"), cancel: t("Cancel") },
      onConfirm: () => handleRestore(version, current),
    });
  }, [t, handleRestore, mainEditor, activeHistoryData]);

  return { canRestore, confirmRestore };
}
