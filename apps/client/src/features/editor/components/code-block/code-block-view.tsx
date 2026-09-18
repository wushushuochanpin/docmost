import { NodeViewContent, NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { ActionIcon, Group, Select, Tooltip } from "@mantine/core";
import { useEffect, useState } from "react";
import { IconCode, IconEye } from "@tabler/icons-react";
import classes from "./code-block.module.css";
import React from "react";
import { Suspense } from "react";
import { useTranslation } from "react-i18next";
import { CodeBlockCopyMenu } from "./code-block-copy-menu";

const MermaidView = React.lazy(
  () => import("@/features/editor/components/code-block/mermaid-view.tsx"),
);

const HtmlView = React.lazy(
  () => import("@/features/editor/components/code-block/html-view.tsx"),
);

export default function CodeBlockView(props: NodeViewProps) {
  const { t } = useTranslation();
  const { node, updateAttributes, extension, editor, getPos } = props;
  const language =
    typeof node.attrs.language === "string" ? node.attrs.language : "";
  // `html` = static styled card (scripts disabled); `html-app` = runnable
  // single-file HTML app (scripts allowed in an isolated origin).
  const isHtml = language === "html" || language === "html-app";
  const [languageValue, setLanguageValue] = useState<string | null>(
    language || null,
  );
  const [isSelected, setIsSelected] = useState(false);
  const [showHtmlSource, setShowHtmlSource] = useState(false);
  const codeText = node.textContent;

  const lowlightLanguages = extension.options.lowlight
    .listLanguages()
    .sort();
  const selectData = [
    ...lowlightLanguages,
    { value: "html-app", label: "HTML 交互应用（允许脚本）" },
  ];

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

  useEffect(() => {
    setLanguageValue(language || null);
  }, [language]);

  // Falling back to another language must not keep the html preview toggle
  // state around for a block that is no longer html.
  useEffect(() => {
    if (!isHtml) {
      setShowHtmlSource(false);
    }
  }, [isHtml]);

  function changeLanguage(language: string | null) {
    setLanguageValue(language || null);
    updateAttributes({
      language: language || null,
    });
  }

  const hideSource =
    codeText.length > 0 &&
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
          data={selectData}
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

        <CodeBlockCopyMenu text={codeText} language={language} />
      </Group>

      <NodeViewContent
        as={"pre" as any}
        spellCheck="false"
        className={`language-${language || "plaintext"}`}
        hidden={hideSource}
      />

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
