import "katex/dist/katex.min.css";
import katex from "katex";
import { useEffect, useRef, useState } from "react";
import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import classes from "./math.module.css";
import { useTranslation } from "react-i18next";

export default function ReadonlyMathInlineView(props: NodeViewProps) {
  const { t } = useTranslation();
  const { node } = props;
  const mathResultContainer = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      katex.render(node.attrs.text, mathResultContainer.current);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "invalid");
    }
  }, [node.attrs.text]);

  const isEmpty = !node.attrs.text.trim().length;

  return (
    <NodeViewWrapper
      data-katex="true"
      className={[
        classes.mathInline,
        error ? classes.error : "",
        isEmpty ? classes.empty : "",
      ].join(" ")}
    >
      <div ref={mathResultContainer}></div>
      {isEmpty && <div>{t("Empty equation")}</div>}
      {error && <div>{t("Invalid equation")}</div>}
    </NodeViewWrapper>
  );
}
