import "@/features/editor/styles/index.css";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorProvider } from "@tiptap/react";
import { getReadonlyExtensions } from "@/features/editor/extensions/readonly-extensions.ts";
import { Document } from "@tiptap/extension-document";
import { Heading } from "@docmost/editor-ext/src/lib/heading/heading.ts";
import { Text } from "@tiptap/extension-text";
import { Placeholder } from "@tiptap/extension-placeholder";
import { useAtom, useStore } from "jotai";
import { userAtom } from "@/features/user/atoms/current-user-atom.ts";
import { readOnlyEditorAtom } from "@/features/editor/atoms/editor-atoms.ts";
import { useEditorScroll } from "./hooks/use-editor-scroll";
import {
  extractEditorFontSizeFromUser,
  getEditorFontScale,
} from "@/features/editor/utils/editor-font-size-utils";
import { editorFontSizePreferenceAtom } from "@/features/editor/atoms/editor-view-preference-atoms.ts";
import classes from "@/features/editor/styles/editor.module.css";
import { Container } from "@mantine/core";
import { normalizeProsemirrorContent } from "@/features/editor/utils/prosemirror-content.ts";

interface PageEditorProps {
  title: string;
  content: any;
  pageId?: string;
}

export default function ReadonlyPageEditor({
  title,
  content,
  pageId,
}: PageEditorProps) {
  const store = useStore();
  const isComponentMounted = useRef(false);
  const editorCreated = useRef(false);
  const [extensions, setExtensions] = useState<any[] | null>(null);

  const canScroll = useCallback(
    () => isComponentMounted.current && editorCreated.current,
    [isComponentMounted, editorCreated],
  );
  const initialScrollTo = window.location.hash
    ? window.location.hash.slice(1)
    : "";
  const { handleScrollTo } = useEditorScroll({ canScroll, initialScrollTo });
  const [user] = useAtom(userAtom);
  const [localEditorFontSize] = useAtom(editorFontSizePreferenceAtom);
  const editorFontScale = getEditorFontScale(
    localEditorFontSize ?? extractEditorFontSizeFromUser(user),
  );
  const fullPageWidth = user.settings?.preferences?.fullPageWidth;
  const normalizedContent = useMemo(
    () => normalizeProsemirrorContent(content),
    [content],
  );

  useEffect(() => {
    isComponentMounted.current = true;
  }, []);

  useEffect(() => {
    let cancelled = false;
    editorCreated.current = false;
    setExtensions(null);
    store.set(readOnlyEditorAtom as any, null);

    void getReadonlyExtensions(normalizedContent).then((nextExtensions) => {
      if (!cancelled) {
        setExtensions(nextExtensions);
      }
    });

    return () => {
      cancelled = true;
      store.set(readOnlyEditorAtom as any, null);
    };
  }, [normalizedContent, store]);

  const titleExtensions = [
    Document.extend({
      content: "heading",
    }),
    Heading,
    Text,
    Placeholder.configure({
      placeholder: "Untitled",
      showOnlyWhenEditable: false,
    }),
  ];

  return (
    <Container
      fluid={fullPageWidth}
      size={!fullPageWidth && 900}
      p={0}
      className={classes.editor}
      style={{ "--editor-font-scale": editorFontScale } as React.CSSProperties}
    >
      <div
        className={classes.docLayout}
      >
      <div className={classes.readonlyTitleSection}>
        <div className={classes.surfaceTitle}>
          <EditorProvider
            editable={false}
            immediatelyRender={true}
            extensions={titleExtensions}
            content={title}
          ></EditorProvider>
        </div>
      </div>

      {extensions ? (
        <EditorProvider
          editable={false}
          immediatelyRender={true}
          extensions={extensions}
          content={normalizedContent}
          onCreate={({ editor }) => {
            if (editor) {
              if (pageId) {
                // @ts-ignore
                editor.storage.pageId = pageId;
              }
              // @ts-ignore
              store.set(readOnlyEditorAtom as any, editor);

              handleScrollTo(editor);
              editorCreated.current = true;
            }
          }}
        ></EditorProvider>
      ) : (
        <div style={{ paddingTop: 12 }}>
          <div
            style={{
              height: 18,
              width: "100%",
              borderRadius: 999,
              background: "var(--ui-bg-subtle)",
              marginBottom: 12,
            }}
          />
          <div
            style={{
              height: 18,
              width: "96%",
              borderRadius: 999,
              background: "var(--ui-bg-subtle)",
              marginBottom: 12,
            }}
          />
          <div
            style={{
              height: 18,
              width: "92%",
              borderRadius: 999,
              background: "var(--ui-bg-subtle)",
              marginBottom: 12,
            }}
          />
          <div
            style={{
              height: 18,
              width: "88%",
              borderRadius: 999,
              background: "var(--ui-bg-subtle)",
            }}
          />
        </div>
      )}
      <div style={{ paddingBottom: "20vh" }}></div>
    </div>
    </Container>
  );
}
