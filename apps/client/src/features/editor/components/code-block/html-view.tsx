import { NodeViewProps } from "@tiptap/react";
import classes from "./code-block.module.css";

interface HtmlViewProps {
  props: NodeViewProps;
}

/**
 * Live preview for `html` language code blocks.
 *
 * The user-authored HTML is rendered inside a sandboxed `<iframe>` with an
 * empty sandbox token list: inline styles and layout render as expected, but
 * scripts, forms, same-origin access and popups are all disabled. This keeps
 * untrusted author markup from touching the host document (XSS boundary) —
 * the same security posture the share page uses for embeds.
 */
export default function HtmlView({ props }: HtmlViewProps) {
  const { node } = props;
  const source = node.textContent;

  if (!source.trim()) {
    return null;
  }

  return (
    <div className={classes.htmlPreview} contentEditable={false}>
      <iframe
        sandbox=""
        title="HTML preview"
        srcDoc={source}
        loading="lazy"
        style={{
          width: "100%",
          height: "420px",
          border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
          borderRadius: 12,
          background: "#ffffff",
        }}
      />
    </div>
  );
}
