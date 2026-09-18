import { NodeViewContent, NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { ActionIcon, Group, Select, Tooltip } from "@mantine/core";
import { CopyButton } from "@/components/common/copy-button";
import { useEffect, useState } from "react";
import { IconCheck, IconCode, IconCopy, IconEye } from "@tabler/icons-react";
import classes from "./code-block.module.css";
import React from "react";
import { Suspense } from "react";
import { useTranslation } from "react-i18next";

const MermaidView = React.lazy(
  () => import("@/features/editor/components/code-block/mermaid-view.tsx"),
);

const HtmlView = React.lazy(
  () => import("@/features/editor/components/code-block/html-view.tsx"),
);

export default function CodeBlockView(props: NodeViewProps) {
  const { t } = useTranslation();
  const { node, updateAttributes, extension, editor, getPos } = props;
  const { language } = node.attrs;
  const isHtml = language === "html";
  const [languageValue, setLanguageValue] = useState<string | null>(
    language || null,
  );
  const [isSelected, setIsSelected] = useState(false);
  const [showHtmlSource, setShowHtmlSource] = useState(false);

  useEffect(() => {
    const updateSelection = () => {
      const { state } = editor;
      const { from, to } = state.selection;
      // Check if the selection intersects with the node's range
      const isNodeSelected =
        (from >= getPos() && from < getPos() + node.nodeSize) ||
        (to > getPos() && to <= getPos() + node.nodeSize);
      setIsSelected(isNodeSelected);
    };

    editor.on("selectionUpdate", updateSelection);
    return () => {
      editor.off("selectionUpdate", updateSelection);
    };
  }, [editor, getPos(), node.nodeSize]);

  // Falling back to another language must not keep the html preview toggle
  // state around for a block that is no longer html.
  useEffect(() => {
    if (!isHtml) {
      setShowHtmlSource(false);
    }
  }, [isHtml]);

  function changeLanguage(language: string) {
    setLanguageValue(language);
    updateAttributes({
      language: language,
    });
  }

  const hideSource =
    node.textContent.length > 0 &&
    (((language === "mermaid" && !editor.isEditable) ||
      (language === "mermaid" && !isSelected)) ||
      (isHtml && !showHtmlSource));

  return (
    <NodeViewWrapper className="codeBlock">
      <Group
        justify="flex-end"
        contentEditable={false}
        className={classes.menuGroup}
      >
        <Select
          placeholder="auto"
          checkIconPosition="right"
          data={extension.options.lowlight.listLanguages().sort()}
          value={languageValue}
          onChange={changeLanguage}
          searchable
          style={{ maxWidth: "130px" }}
          classNames={{ input: classes.selectInput }}
          disabled={!editor.isEditable}
        />

        {isHtml && editor.isEditable && (
          <Tooltip
            label={showHtmlSource ? t("Preview") : t("View code")}
            withArrow
            position="right"
          >
            <ActionIcon
              color={showHtmlSource ? "teal" : "gray"}
              variant="subtle"
              onClick={() => setShowHtmlSource((value) => !value)}
            >
              {showHtmlSource ? <IconEye size={16} /> : <IconCode size={16} />}
            </ActionIcon>
          </Tooltip>
        )}

        <CopyButton value={node?.textContent} timeout={2000}>
          {({ copied, copy }) => (
            <Tooltip
              label={copied ? t("Copied") : t("Copy")}
              withArrow
              position="right"
            >
              <ActionIcon
                color={copied ? "teal" : "gray"}
                variant="subtle"
                onClick={copy}
              >
                {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      </Group>

      <pre spellCheck="false" hidden={hideSource}>
        {/* @ts-ignore */}
        <NodeViewContent as="code" className={`language-${language}`} />
      </pre>

      {language === "mermaid" && (
        <Suspense fallback={null}>
          <MermaidView props={props} />
        </Suspense>
      )}

      {isHtml && !showHtmlSource && (
        <Suspense fallback={null}>
          <HtmlView props={props} />
        </Suspense>
      )}
    </NodeViewWrapper>
  );
}
