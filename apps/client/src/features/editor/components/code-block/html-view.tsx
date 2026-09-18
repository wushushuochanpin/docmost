import { NodeViewProps } from "@tiptap/react";
import classes from "./code-block.module.css";

interface HtmlViewProps {
  props: NodeViewProps;
}

/**
 * Live preview for `html` / `html-app` language code blocks.
 *
 * - `html` (default, safe): empty sandbox token — inline styles render, but
 *   scripts, forms, same-origin access and popups are all disabled.
 * - `html-app` (interactive): `allow-scripts allow-modals` so a self-contained
 *   single-file HTML app can actually run. `allow-same-origin` is deliberately
 *   NOT granted: scripts execute in an opaque origin and cannot read the host
 *   document's cookies / localStorage, keeping the XSS boundary.
 */
export default function HtmlView({ props }: HtmlViewProps) {
  const { node } = props;
  const source = node.textContent;
  const language =
    typeof node.attrs.language === "string" ? node.attrs.language : "";
  const interactive = language === "html-app";

  if (!source.trim()) {
    return null;
  }

  return (
    <div className={classes.htmlPreview} contentEditable={false}>
      <iframe
        sandbox={interactive ? "allow-scripts allow-modals" : ""}
        title="HTML preview"
        srcDoc={source}
        loading="lazy"
        style={{
          width: "100%",
          height: interactive ? "600px" : "420px",
          border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
          borderRadius: 12,
          background: "#ffffff",
        }}
      />
    </div>
  );
}
