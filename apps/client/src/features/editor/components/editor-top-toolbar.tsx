import { Group, Text } from "@mantine/core";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { pageEditorAtom } from "@/features/editor/atoms/editor-atoms.ts";
import { EditorStickyToolbar } from "@/features/editor/components/bubble-menu/editor-sticky-toolbar.tsx";
import classes from "./editor-top-toolbar.module.css";

interface EditorTopToolbarProps {
  editable: boolean;
}

export function EditorTopToolbar({ editable }: EditorTopToolbarProps) {
  const { t } = useTranslation();
  const pageEditor = useAtomValue(pageEditorAtom);
  const canRenderToolbarControls = Boolean(pageEditor) && !pageEditor?.isDestroyed;

  if (!editable) {
    return null;
  }

  return (
    <div className={classes.topToolbar} id="page-toolbar-anchor">
      {canRenderToolbarControls ? (
        <EditorStickyToolbar editor={pageEditor} />
      ) : (
        <Group wrap="nowrap" className={classes.loadingHint}>
          <Text size="xs" c="dimmed">
            {t("Editor is loading...")}
          </Text>
        </Group>
      )}
    </div>
  );
}
