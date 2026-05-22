import classes from "@/features/editor/styles/editor.module.css";
import React from "react";
import { TitleEditor } from "@/features/editor/title-editor";
import PageEditor from "@/features/editor/page-editor";
import { Container } from "@mantine/core";
import { useAtom } from "jotai";
import { userAtom } from "@/features/user/atoms/current-user-atom.ts";
import { editorFontSizePreferenceAtom } from "@/features/editor/atoms/editor-view-preference-atoms.ts";
import {
  extractEditorFontSizeFromUser,
  getEditorFontScale,
} from "@/features/editor/utils/editor-font-size-utils";
import { markEditorBootstrapStage } from "@/features/editor/lib/editor-bootstrap-metrics";

const MemoizedTitleEditor = React.memo(TitleEditor);
const MemoizedPageEditor = React.memo(PageEditor);

export interface FullEditorProps {
  pageId: string;
  slugId: string;
  title: string;
  content: any;
  updatedAt: Date | string;
  spaceSlug: string;
  editable: boolean;
}

export function FullEditor({
  pageId,
  title,
  slugId,
  content,
  updatedAt,
  spaceSlug,
  editable,
}: FullEditorProps) {
  const [user] = useAtom(userAtom);
  const [localEditorFontSize] = useAtom(editorFontSizePreferenceAtom);
  const fullPageWidth = user.settings?.preferences?.fullPageWidth;
  const editorFontScale = getEditorFontScale(
    localEditorFontSize ?? extractEditorFontSizeFromUser(user),
  );

  React.useEffect(() => {
    markEditorBootstrapStage(pageId, "editor-shell-mounted");
  }, [pageId]);

  return (
    <Container
      fluid={fullPageWidth}
      size={!fullPageWidth && 900}
      p={0}
      className={`${classes.editor} ${classes.docLayout}`}
      style={{ "--editor-font-scale": editorFontScale } as React.CSSProperties}
    >
      <div id="page-content-rail-anchor" className={classes.titleSection}>
        <MemoizedTitleEditor
          key={pageId}
          pageId={pageId}
          slugId={slugId}
          title={title}
          updatedAt={updatedAt}
          spaceSlug={spaceSlug}
          editable={editable}
          className={classes.surfaceTitle}
        />
      </div>
      <MemoizedPageEditor
        pageId={pageId}
        editable={editable}
        content={content}
      />
    </Container>
  );
}
