import { Group, Loader, Text } from "@mantine/core";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  pageEditorAtom,
  pageEditorRuntimeModeAtom,
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
  const yjsConnectionStatus = useAtomValue(yjsConnectionStatusAtom);
  const canRenderToolbarControls = Boolean(pageEditor) && !pageEditor?.isDestroyed;
  const isLocalFallback = runtimeMode === "local";
  const loadingLabel = isLocalFallback
    ? t("Editing locally while live collaboration reconnects")
    : yjsConnectionStatus === "disconnected"
      ? t("Live editing is reconnecting...")
      : t("Connecting live editing...");

  if (!editable) {
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
          {!isLocalFallback && <Loader size="xs" />}
          <Text size="xs" c="dimmed">
            {loadingLabel}
          </Text>
        </Group>
      )}
    </div>
  );
}
