import { Group, Loader, Text } from "@mantine/core";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  pageEditorAtom,
  pageEditorRuntimeModeAtom,
  pageEditorSessionStatusAtom,
  yjsConnectionStatusAtom,
} from "@/features/editor/atoms/editor-atoms.ts";
import { EditorStickyToolbar } from "@/features/editor/components/bubble-menu/editor-sticky-toolbar.tsx";
import classes from "./editor-top-toolbar.module.css";

interface EditorTopToolbarProps {
  editable: boolean;
}

export function EditorTopToolbar({ editable }: EditorTopToolbarProps) {
  const { t } = useTranslation();
  const pageEditor = useAtomValue(pageEditorAtom);
  const runtimeMode = useAtomValue(pageEditorRuntimeModeAtom);
  const sessionStatus = useAtomValue(pageEditorSessionStatusAtom);
  const yjsConnectionStatus = useAtomValue(yjsConnectionStatusAtom);
  const canRenderToolbarControls = Boolean(pageEditor) && !pageEditor?.isDestroyed;
  const isLocalFallback = runtimeMode === "local";
  const isPendingTakeover = sessionStatus === "pending_takeover";
  const isBlockedByOther = sessionStatus === "blocked_by_other";
  const isTakenOver =
    sessionStatus === "takeover_requested" || sessionStatus === "revoked";
  const loadingLabel = isLocalFallback
    ? t("Editing locally while live collaboration reconnects")
    : isPendingTakeover
      ? t("Waiting for another tab to hand off editing...")
      : isTakenOver
        ? t("Editing moved to another tab")
    : yjsConnectionStatus === "disconnected"
      ? t("Live editing is reconnecting...")
      : t("Connecting live editing...");

  if (!editable || isBlockedByOther || isPendingTakeover || isTakenOver) {
    return null;
  }

  return (
    <div
      className={classes.topToolbar}
      id="page-toolbar-anchor"
      data-runtime-mode={runtimeMode}
    >
      {canRenderToolbarControls ? (
        <EditorStickyToolbar editor={pageEditor} />
      ) : (
        <Group wrap="nowrap" className={classes.loadingHint}>
          {!isLocalFallback && !isTakenOver && <Loader size="xs" />}
          <Text size="xs" c="dimmed">
            {loadingLabel}
          </Text>
        </Group>
      )}
    </div>
  );
}
