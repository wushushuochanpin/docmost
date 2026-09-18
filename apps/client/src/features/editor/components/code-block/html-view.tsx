import { NodeViewProps } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import classes from "./code-block.module.css";

interface HtmlViewProps {
  props: NodeViewProps;
}

const MIN_HEIGHT = 240;
const MAX_HEIGHT = 4000;

/**
 * Live preview for `html` / `html-app` language code blocks.
 *
 * - `html` (default, safe): empty sandbox token — inline styles render, but
 *   scripts, forms, same-origin access and popups are all disabled.
 * - `html-app` (interactive): `allow-scripts allow-modals` so a self-contained
 *   single-file HTML app can actually run. `allow-same-origin` is deliberately
 *   NOT granted: scripts execute in an opaque origin and cannot read the host
 *   document's cookies / localStorage, keeping the XSS boundary.
 *
 * The preview height is drag-resizable; the chosen value is persisted on the
 * node as `htmlHeight`, so it survives reload, collaborator sync and is used
 * by the share renderer.
 */
export default function HtmlView({ props }: HtmlViewProps) {
  const { t } = useTranslation();
  const { node, editor, updateAttributes } = props;
  const source = node.textContent;
  const language =
    typeof node.attrs.language === "string" ? node.attrs.language : "";
  const interactive = language === "html-app";

  const storedHeight = node.attrs.htmlHeight
    ? Number(node.attrs.htmlHeight)
    : null;
  const defaultHeight = interactive ? 600 : 420;

  const [height, setHeight] = useState<number>(
    storedHeight && storedHeight > 0 ? storedHeight : defaultHeight,
  );
  const heightRef = useRef(height);
  heightRef.current = height;

  useEffect(() => {
    if (storedHeight && storedHeight > 0) {
      setHeight(storedHeight);
    }
  }, [storedHeight]);

  if (!source.trim()) {
    return null;
  }

  const onHandlePointerDown = (event: React.PointerEvent) => {
    if (!editor.isEditable) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    const startY = event.clientY;
    const startHeight = heightRef.current;

    const onMove = (moveEvent: PointerEvent) => {
      const next = Math.min(
        MAX_HEIGHT,
        Math.max(MIN_HEIGHT, startHeight + (moveEvent.clientY - startY)),
      );
      setHeight(next);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      updateAttributes({ htmlHeight: Math.round(heightRef.current) });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className={classes.htmlPreview} contentEditable={false}>
      <iframe
        sandbox={interactive ? "allow-scripts allow-modals" : ""}
        title="HTML preview"
        srcDoc={source}
        loading="lazy"
        style={{
          width: "100%",
          height: `${height}px`,
          border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
          borderRadius: 12,
          background: "#ffffff",
        }}
      />
      {editor.isEditable && (
        <div
          className={classes.htmlResizeHandle}
          onPointerDown={onHandlePointerDown}
          title={t("Drag to resize")}
        >
          <div className={classes.htmlResizeHandleGrip} />
        </div>
      )}
    </div>
  );
}
