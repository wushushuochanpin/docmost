import { NodeViewProps } from "@tiptap/react";
import { useEffect, useState } from "react";
import mermaid from "mermaid";
import { v4 as uuidv4 } from "uuid";
import classes from "./code-block.module.css";
import { useTranslation } from "react-i18next";
import { useComputedColorScheme } from "@mantine/core";
import DOMPurify from "dompurify";
import { useDisclosure } from "@mantine/hooks";
import MermaidPreviewModal from "./mermaid-preview-modal.tsx";

interface MermaidViewProps {
  props: NodeViewProps;
}

export default function MermaidView({ props }: MermaidViewProps) {
  const { t } = useTranslation();
  const computedColorScheme = useComputedColorScheme();
  const { node } = props;
  const [preview, setPreview] = useState<string>("");
  const [diagramSvg, setDiagramSvg] = useState<string>("");
  const [opened, { open, close }] = useDisclosure(false);

  // Update Mermaid config when theme changes.
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      suppressErrorRendering: true,
      theme: computedColorScheme === "light" ? "default" : "dark",
    });
  }, [computedColorScheme]);

  // Re-render the diagram whenever the node content or theme changes.
  useEffect(() => {
    const id = `mermaid-${uuidv4()}`;
    if (node.textContent.length > 0) {
      mermaid
        .render(id, node.textContent)
        .then((item) => {
          setPreview(item.svg);
          setDiagramSvg(item.svg);
        })
        .catch((err) => {
          setDiagramSvg("");
          if (props.editor.isEditable) {
            setPreview(
              `<div class="${classes.error}">${t("Mermaid diagram error:")} ${DOMPurify.sanitize(err)}</div>`,
            );
          } else {
            setPreview(
              `<div class="${classes.error}">${t("Invalid Mermaid diagram")}</div>`,
            );
          }
        });
    } else {
      setPreview("");
      setDiagramSvg("");
    }
  }, [node.textContent, computedColorScheme]);

  useEffect(() => {
    if (!diagramSvg && opened) {
      close();
    }
  }, [diagramSvg, opened, close]);

  return (
    <>
      <div
        className={`${classes.mermaid} ${diagramSvg ? classes.mermaidClickable : ""}`}
        contentEditable={false}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!diagramSvg) return;
          open();
        }}
        dangerouslySetInnerHTML={{ __html: preview }}
      ></div>

      <MermaidPreviewModal opened={opened} onClose={close} svg={diagramSvg} />
    </>
  );
}
