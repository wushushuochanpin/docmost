import { NodeViewContent, NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { Group } from "@mantine/core";
import classes from "./code-block.module.css";
import React, { Suspense } from "react";
import { CodeBlockCopyMenu } from "./code-block-copy-menu";

const MermaidView = React.lazy(
  () => import("@/features/editor/components/code-block/mermaid-view.tsx"),
);

const HtmlView = React.lazy(
  () => import("@/features/editor/components/code-block/html-view.tsx"),
);

export default function ReadonlyCodeBlockView(props: NodeViewProps) {
  const { node } = props;
  const language =
    typeof node.attrs.language === "string" ? node.attrs.language : "";
  const isMermaid = language === "mermaid";
  const isHtml = language === "html" || language === "html-app";
  const codeText = node.textContent;

  return (
    <NodeViewWrapper className="codeBlock">
      <Group
        justify="flex-end"
        contentEditable={false}
        className={classes.menuGroup}
      >
        <CodeBlockCopyMenu text={codeText} language={language} />
      </Group>

      <NodeViewContent
        as={"pre" as any}
        spellCheck="false"
        className={`language-${language || "plaintext"}`}
        hidden={(isMermaid || isHtml) && codeText.length > 0}
      />

      {isMermaid && (
        <Suspense fallback={null}>
          <MermaidView props={props} />
        </Suspense>
      )}

      {isHtml && (
        <Suspense fallback={null}>
          <HtmlView props={props} />
        </Suspense>
      )}
    </NodeViewWrapper>
  );
}
