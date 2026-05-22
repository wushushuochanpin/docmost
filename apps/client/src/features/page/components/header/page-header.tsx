import classes from "./page-header.module.css";
import PageHeaderMenu from "@/features/page/components/header/page-header-menu.tsx";
import { EditorTopToolbar } from "@/features/editor/components/editor-top-toolbar.tsx";
import { ActionIcon, Tooltip } from "@mantine/core";
import { IconList, IconX } from "@tabler/icons-react";
import useToggleAside from "@/hooks/use-toggle-aside.tsx";
import { useAtom, useAtomValue } from "jotai";
import { asideStateAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom.ts";
import { useTranslation } from "react-i18next";
import { IPage } from "@/features/page/types/page.types.ts";
import {
  isPageEditorSessionWritable,
  pageEditorSessionStatusAtom,
} from "@/features/editor/atoms/editor-atoms.ts";
import { isEditorSessionEnabled } from "@/lib/config";

interface Props {
  readOnly?: boolean;
  pageId?: string;
  page: IPage;
  editable?: boolean;
  showEditorToolbar?: boolean;
}

export default function PageHeader({
  readOnly,
  pageId,
  page,
  editable,
  showEditorToolbar,
}: Props) {
  const { t } = useTranslation();
  const toggleAside = useToggleAside();
  const [asideState, setAsideState] = useAtom(asideStateAtom);
  const editorSessionStatus = useAtomValue(pageEditorSessionStatusAtom);
  const isTocOpen = asideState.isAsideOpen && asideState.tab === "toc";
  const shouldGateEditorSession = Boolean(
    showEditorToolbar && editable && isEditorSessionEnabled(),
  );
  const sessionAllowsEdit =
    !shouldGateEditorSession ||
    isPageEditorSessionWritable(
      isEditorSessionEnabled(),
      editorSessionStatus,
    );
  const effectiveEditable = Boolean(editable && sessionAllowsEdit);
  const effectiveReadOnly = Boolean(
    readOnly || (shouldGateEditorSession && !sessionAllowsEdit),
  );

  const closeToc = () => {
    setAsideState({ tab: "toc", isAsideOpen: false });
  };

  return (
    <div className={classes.header}>
      <div className={classes.row}>
        <div className={classes.leftRail}>
          {showEditorToolbar && (
            <>
              <Tooltip label={t("Table of contents")} openDelay={250} withArrow>
                <ActionIcon
                  variant="subtle"
                  onClick={() => toggleAside("toc")}
                >
                  <IconList size={18} stroke={1.75} />
                </ActionIcon>
              </Tooltip>

              {isTocOpen && (
                <Tooltip
                  label={t("Close table of contents")}
                  openDelay={250}
                  withArrow
                >
                  <ActionIcon variant="subtle" onClick={closeToc}>
                    <IconX size={18} stroke={1.75} />
                  </ActionIcon>
                </Tooltip>
              )}
            </>
          )}
        </div>

        {showEditorToolbar && pageId && (
          <div className={classes.toolbarLayer}>
            <EditorTopToolbar editable={effectiveEditable} />
          </div>
        )}

        <div className={classes.actions}>
          <PageHeaderMenu
            readOnly={effectiveReadOnly}
            pageId={pageId}
            page={page}
          />
        </div>
      </div>
    </div>
  );
}
