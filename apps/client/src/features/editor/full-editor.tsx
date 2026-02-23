import classes from "@/features/editor/styles/editor.module.css";
import React from "react";
import { TitleEditor } from "@/features/editor/title-editor";
import PageEditor from "@/features/editor/page-editor";
import { Container } from "@mantine/core";
import { useAtom } from "jotai";
import { userAtom } from "@/features/user/atoms/current-user-atom.ts";
import { getEditorFontScale } from "@/features/editor/utils/editor-font-size-utils";

const MemoizedTitleEditor = React.memo(TitleEditor);
const MemoizedPageEditor = React.memo(PageEditor);

export interface FullEditorProps {
  pageId: string;
  slugId: string;
  title: string;
  content: string;
  spaceSlug: string;
  editable: boolean;
}

export function FullEditor({
  pageId,
  title,
  slugId,
  content,
  spaceSlug,
  editable,
}: FullEditorProps) {
  const [user] = useAtom(userAtom);
  const fullPageWidth = user.settings?.preferences?.fullPageWidth;
  const editorFontScale = getEditorFontScale(
    user.settings?.preferences?.editorFontSize,
  );

  return (
    <Container
      fluid={fullPageWidth}
      size={!fullPageWidth && 900}
      className={classes.editor}
      style={{ "--editor-font-scale": editorFontScale } as React.CSSProperties}
    >
      <div className={classes.titleSection}>
        <MemoizedTitleEditor
          pageId={pageId}
          slugId={slugId}
          title={title}
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
