import { NodeViewContent, NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { ActionIcon, Group, Tooltip } from "@mantine/core";
import { CopyButton } from "@/components/common/copy-button";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import classes from "./code-block.module.css";
import React, { Suspense } from "react";
import { useTranslation } from "react-i18next";

const MermaidView = React.lazy(
  () => import("@/features/editor/components/code-block/mermaid-view.tsx"),
);

export default function ReadonlyCodeBlockView(props: NodeViewProps) {
  const { t } = useTranslation();
  const { node } = props;
  const { language } = node.attrs;
  const isMermaid = language === "mermaid";

  return (
    <NodeViewWrapper className="codeBlock">
      <Group
        justify="flex-end"
        contentEditable={false}
        className={classes.menuGroup}
      >
        <CopyButton value={node.textContent} timeout={2000}>
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

      <pre spellCheck="false" hidden={isMermaid && node.textContent.length > 0}>
        {/* @ts-ignore */}
        <NodeViewContent as="code" className={`language-${language}`} />
      </pre>

      {isMermaid && (
        <Suspense fallback={null}>
          <MermaidView props={props} />
        </Suspense>
      )}
    </NodeViewWrapper>
  );
}
