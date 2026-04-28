import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { getPagePrintHtml } from "@/features/page/services/page-service";

type PaperSize = "A4" | "Letter" | "A3";
type Orientation = "portrait" | "landscape";
type MarginPreset = "narrow" | "normal" | "wide" | "custom";

interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const PAPER_MM: Record<PaperSize, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  Letter: { w: 216, h: 279 },
  A3: { w: 297, h: 420 },
};

const MARGIN_VALUES: Record<Exclude<MarginPreset, "custom">, number> = {
  narrow: 8,
  normal: 16,
  wide: 25,
};

const MM_TO_PX = 3.7795;

function buildPageCss(
  size: PaperSize,
  orientation: Orientation,
  margins: Margins,
): string {
  const dim = PAPER_MM[size];
  const w = orientation === "portrait" ? dim.w : dim.h;
  const h = orientation === "portrait" ? dim.h : dim.w;
  return `
@page {
  size: ${w}mm ${h}mm;
  margin: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm;
}
@media print {
  /* Reset scroll/height constraints so all content prints */
  html, body {
    height: auto !important;
    overflow: visible !important;
    background: white !important;
  }
  #print-outer {
    height: auto !important;
    overflow: visible !important;
  }
  #print-scroll {
    overflow: visible !important;
    height: auto !important;
    flex: none !important;
    background: none !important;
    padding: 0 !important;
    display: block !important;
  }
  .print-toolbar { display: none !important; }
  [data-pagebreak] { display: none !important; }
  .print-paper {
    box-shadow: none !important;
    margin: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
    min-height: 0 !important;
    padding: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm !important;
  }
}`;
}

export default function PrintPreviewPage() {
  const { pageId } = useParams<{ pageId: string }>();

  const [title, setTitle] = useState("");
  const [bodyHtml, setBodyHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [size, setSize] = useState<PaperSize>("A4");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [preset, setPreset] = useState<MarginPreset>("normal");
  const [margins, setMargins] = useState<Margins>({
    top: 16,
    right: 16,
    bottom: 16,
    left: 16,
  });
  const [pageBreaks, setPageBreaks] = useState<number[]>([]);

  const styleRef = useRef<HTMLStyleElement | null>(null);
  const paperRef = useRef<HTMLDivElement>(null);

  const dim = PAPER_MM[size];
  const paperW = orientation === "portrait" ? dim.w : dim.h;
  const paperH = orientation === "portrait" ? dim.h : dim.w;
  const previewW = Math.round(paperW * MM_TO_PX);
  const pageHeightPx = Math.round(paperH * MM_TO_PX);

  useEffect(() => {
    if (!pageId) return;
    getPagePrintHtml(pageId)
      .then(({ title, bodyHtml }) => {
        setTitle(title);
        setBodyHtml(bodyHtml);
        document.title = title ? `打印 — ${title}` : "打印预览";
      })
      .catch(() => setError("页面加载失败，请检查权限后重试。"));
  }, [pageId]);

  // Recalculate page breaks after content renders or settings change
  useEffect(() => {
    if (!paperRef.current || bodyHtml === null) return;
    const measure = () => {
      const totalH = paperRef.current!.offsetHeight;
      // Printable height per page = paper height minus top+bottom margins
      const printableH = (paperH - margins.top - margins.bottom) * MM_TO_PX;
      const topPadPx = margins.top * MM_TO_PX;
      const breaks: number[] = [];
      let y = topPadPx + printableH;
      while (y < totalH - 5) {
        breaks.push(Math.round(y));
        y += printableH;
      }
      setPageBreaks(breaks);
    };
    // Delay to let images and fonts settle
    const t = setTimeout(measure, 400);
    return () => clearTimeout(t);
  }, [bodyHtml, paperH, margins.top, margins.bottom]);

  useEffect(() => {
    if (!styleRef.current) {
      const el = document.createElement("style");
      el.id = "print-page-style";
      document.head.appendChild(el);
      styleRef.current = el;
    }
    styleRef.current.textContent = buildPageCss(size, orientation, margins);
  }, [size, orientation, margins]);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700&display=swap";
    document.head.appendChild(link);
    return () => link.remove();
  }, []);

  function applyPreset(p: MarginPreset) {
    setPreset(p);
    if (p !== "custom") {
      const v = MARGIN_VALUES[p];
      setMargins({ top: v, right: v, bottom: v, left: v });
    }
  }

  function setMarginField(field: keyof Margins, value: string) {
    const num = Math.max(0, Math.min(50, Number(value) || 0));
    setMargins((m) => ({ ...m, [field]: num }));
    setPreset("custom");
  }

  const btnBase: React.CSSProperties = {
    padding: "4px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    background: "white",
    cursor: "pointer",
    fontSize: 13,
    lineHeight: "22px",
  };
  const btnActive: React.CSSProperties = {
    ...btnBase,
    background: "#2563eb",
    color: "white",
    borderColor: "#2563eb",
  };

  return (
    <div
      id="print-outer"
      style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100%" }}
    >
      {/* Toolbar */}
      <div
        className="print-toolbar"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "10px 20px",
          background: "white",
          borderBottom: "1px solid #e5e7eb",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, color: "#6b7280", whiteSpace: "nowrap" }}>纸张</span>
          <select
            value={size}
            onChange={(e) => setSize(e.target.value as PaperSize)}
            style={{ ...btnBase, padding: "4px 8px" }}
          >
            <option value="A4">A4</option>
            <option value="Letter">Letter</option>
            <option value="A3">A3</option>
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, color: "#6b7280", whiteSpace: "nowrap" }}>方向</span>
          <div style={{ display: "flex", gap: 4 }}>
            <button style={orientation === "portrait" ? btnActive : btnBase} onClick={() => setOrientation("portrait")}>纵向</button>
            <button style={orientation === "landscape" ? btnActive : btnBase} onClick={() => setOrientation("landscape")}>横向</button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, color: "#6b7280", whiteSpace: "nowrap" }}>页边距</span>
          <div style={{ display: "flex", gap: 4 }}>
            {(["narrow", "normal", "wide"] as const).map((p) => (
              <button key={p} style={preset === p ? btnActive : btnBase} onClick={() => applyPreset(p)}>
                {p === "narrow" ? "窄" : p === "normal" ? "标准" : "宽"}
              </button>
            ))}
            <button style={preset === "custom" ? btnActive : btnBase} onClick={() => applyPreset("custom")}>自定义</button>
          </div>
        </div>

        {preset === "custom" && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
            {(["top", "right", "bottom", "left"] as const).map((f) => (
              <label key={f} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <span style={{ color: "#6b7280" }}>
                  {f === "top" ? "上" : f === "right" ? "右" : f === "bottom" ? "下" : "左"}
                </span>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={margins[f]}
                  onChange={(e) => setMarginField(f, e.target.value)}
                  style={{ width: 44, padding: "2px 4px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13, textAlign: "center" }}
                />
                <span style={{ color: "#9ca3af" }}>mm</span>
              </label>
            ))}
          </div>
        )}

        {bodyHtml !== null && pageBreaks.length > 0 && (
          <span style={{ fontSize: 13, color: "#6b7280" }}>
            共 {pageBreaks.length + 1} 页
          </span>
        )}

        <div style={{ marginLeft: "auto" }}>
          <button
            onClick={() => window.print()}
            style={{
              padding: "6px 20px",
              background: "#2563eb",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            打印
          </button>
        </div>
      </div>

      {/* Gray canvas — fills full remaining height */}
      <div
        id="print-scroll"
        style={{
          flex: 1,
          overflow: "auto",
          background: "#e5e7eb",
          padding: "32px 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {error ? (
          <div style={{ color: "#ef4444", marginTop: 40, fontSize: 15 }}>{error}</div>
        ) : bodyHtml === null ? (
          <div style={{ color: "#6b7280", marginTop: 40, fontSize: 15 }}>加载中…</div>
        ) : (
          /* Wrapper for paper + break overlays */
          <div style={{ position: "relative", width: previewW, flexShrink: 0 }}>
            {/* Paper sheet */}
            <div
              ref={paperRef}
              className="print-paper"
              style={{
                width: "100%",
                minHeight: pageHeightPx,
                background: "white",
                boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
                padding: `${margins.top * MM_TO_PX}px ${margins.right * MM_TO_PX}px ${margins.bottom * MM_TO_PX}px ${margins.left * MM_TO_PX}px`,
                boxSizing: "border-box",
                fontFamily: '"Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Arial, sans-serif',
                fontSize: 12,
                lineHeight: 1.72,
                color: "#111827",
              }}
            >
              {title && (
                <h1 style={{ margin: "0 0 18px", fontSize: 24, fontWeight: 700, lineHeight: 1.25 }}>
                  {title}
                </h1>
              )}
              <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
            </div>

            {/* Page break indicators — hidden in print */}
            {pageBreaks.map((y, i) => (
              <div
                key={i}
                data-pagebreak=""
                style={{
                  position: "absolute",
                  top: y,
                  left: 0,
                  right: 0,
                  pointerEvents: "none",
                  zIndex: 10,
                }}
              >
                {/* Break band */}
                <div style={{ height: 2, background: "rgba(37,99,235,0.35)" }} />
                {/* Page label */}
                <div
                  style={{
                    position: "absolute",
                    top: -18,
                    right: 0,
                    fontSize: 11,
                    color: "#2563eb",
                    background: "rgba(219,234,254,0.9)",
                    padding: "1px 7px",
                    borderRadius: "3px 3px 0 0",
                    lineHeight: "16px",
                  }}
                >
                  第 {i + 1} 页 / {pageBreaks.length + 1}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .print-paper p, .print-paper ul, .print-paper ol,
        .print-paper blockquote, .print-paper figure,
        .print-paper pre, .print-paper table, .print-paper details {
          margin-top: 0; margin-bottom: 0.9em;
        }
        .print-paper h1, .print-paper h2, .print-paper h3 {
          margin: 1.2em 0 0.5em; line-height: 1.25; font-weight: 700; page-break-after: avoid;
        }
        .print-paper h1 { font-size: 22px; }
        .print-paper h2 { font-size: 18px; }
        .print-paper h3 { font-size: 15px; }
        .print-paper ul, .print-paper ol { padding-left: 1.4rem; }
        .print-paper li + li { margin-top: 0.3em; }
        .print-paper a { color: #1d4ed8; text-decoration: none; }
        .print-paper img { display: block; max-width: 100%; height: auto; page-break-inside: avoid; }
        .print-paper table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .print-paper th, .print-paper td {
          border: 1px solid #d1d5db; padding: 8px 10px; vertical-align: top; word-break: break-word;
        }
        .print-paper th { background: #f3f4f6; font-weight: 700; }
        .print-paper code, .print-paper pre, .print-paper kbd {
          font-family: Consolas, "SFMono-Regular", monospace;
        }
        .print-paper pre {
          padding: 12px 14px; border: 1px solid #dbe3ee; border-radius: 8px;
          background: #f8fafc; white-space: pre-wrap; word-break: break-word;
        }
        .print-paper :not(pre) > code {
          padding: 0.08rem 0.28rem; border-radius: 4px; background: #f3f4f6;
        }
        .print-paper blockquote {
          padding-left: 12px; border-left: 3px solid #cbd5e1; color: #475569;
        }
        .print-paper hr { border: none; border-top: 1px solid #d1d5db; margin: 1.2em 0; }
        .print-paper .share-code-block {
          border: 1px solid #d6dce7; border-radius: 10px; background: #f8fafc;
          overflow: hidden; page-break-inside: avoid;
        }
        .print-paper .share-code-block__meta {
          padding: 8px 12px; border-bottom: 1px solid #d6dce7; background: #eef2f7;
          color: #475569; font-size: 11px; font-weight: 700; text-transform: uppercase;
        }
        .print-paper .share-code-block pre { margin: 0; border: none; border-radius: 0; background: transparent; }
        .print-paper .pdf-media-placeholder {
          padding: 10px 12px; border: 1px dashed #cbd5e1; border-radius: 8px;
          color: #475569; background: #f8fafc;
        }
        .print-paper [data-type="attachment"] a {
          display: inline-flex; align-items: center; min-height: 32px;
          padding: 0 12px; border: 1px solid #d1d5db; border-radius: 999px; color: #111827;
        }
      `}</style>
    </div>
  );
}
