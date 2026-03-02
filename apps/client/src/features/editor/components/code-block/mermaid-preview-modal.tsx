import {
  ActionIcon,
  Group,
  Portal,
  Tooltip,
} from "@mantine/core";
import {
  IconFileTypePng,
  IconFileTypeSvg,
  IconX,
  IconMinus,
  IconPlus,
  IconRestore,
} from "@tabler/icons-react";
import { saveAs } from "file-saver";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import { useTranslation } from "react-i18next";
import classes from "./code-block.module.css";

interface MermaidPreviewModalProps {
  opened: boolean;
  onClose: () => void;
  svg: string;
}

type Point = {
  x: number;
  y: number;
};

type WebKitGestureEvent = Event & {
  scale: number;
  preventDefault: () => void;
};

const MIN_SCALE = 0.25;
const MAX_SCALE = 16;
const BUTTON_ZOOM_FACTOR = 1.2;
/** Initial zoom so diagram fits in viewport (contain), then user can zoom in. */
const INITIAL_FIT_ZOOM = 1;
const SVG_TRIM_PADDING = 10;
/** Stage padding (CSS .mermaidPreviewStage padding) so scaled content stays inside viewport. */
const STAGE_PADDING_PX = 28;

function clampScale(nextScale: number) {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));
}

function buildFileName(ext: "svg" | "png") {
  return `mermaid-diagram-${Date.now()}.${ext}`;
}

function getSvgSize(svgMarkup: string): { width: number; height: number } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgMarkup, "image/svg+xml");
  const svg = doc.querySelector("svg");

  if (!svg) {
    return { width: 1200, height: 800 };
  }

  const widthAttr = Number.parseFloat(svg.getAttribute("width") || "");
  const heightAttr = Number.parseFloat(svg.getAttribute("height") || "");
  if (Number.isFinite(widthAttr) && Number.isFinite(heightAttr)) {
    return { width: widthAttr, height: heightAttr };
  }

  const viewBox = (svg.getAttribute("viewBox") || "").trim().split(/\s+/);
  if (viewBox.length === 4) {
    const viewBoxWidth = Number.parseFloat(viewBox[2]);
    const viewBoxHeight = Number.parseFloat(viewBox[3]);
    if (Number.isFinite(viewBoxWidth) && Number.isFinite(viewBoxHeight)) {
      return { width: viewBoxWidth, height: viewBoxHeight };
    }
  }

  return { width: 1200, height: 800 };
}

function trimRenderedSvgWhitespace(svgElement: SVGSVGElement) {
  // Use root SVG's getBBox() so we get the full diagram bounds. Using the first <g>
  // can be wrong for Mermaid (e.g. sequence diagrams) where the first g may be a
  // small subgroup (one label), causing the modal to zoom into that part only.
  const graphicsNode = svgElement as unknown as SVGGraphicsElement;
  if (!graphicsNode || typeof graphicsNode.getBBox !== "function") {
    return null;
  }

  const bbox = graphicsNode.getBBox();
  if (!Number.isFinite(bbox.width) || !Number.isFinite(bbox.height)) {
    return null;
  }
  if (bbox.width <= 0 || bbox.height <= 0) {
    return null;
  }

  const x = bbox.x - SVG_TRIM_PADDING;
  const y = bbox.y - SVG_TRIM_PADDING;
  const width = bbox.width + SVG_TRIM_PADDING * 2;
  const height = bbox.height + SVG_TRIM_PADDING * 2;

  svgElement.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
  svgElement.setAttribute("width", `${width}`);
  svgElement.setAttribute("height", `${height}`);

  return { width, height };
}

export default function MermaidPreviewModal({
  opened,
  onClose,
  svg,
}: MermaidPreviewModalProps) {
  const { t } = useTranslation();
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<Point | null>(null);
  const dragOriginRef = useRef<Point>({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const lastGestureScaleRef = useRef(1);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const initialSvgSize = useMemo(() => getSvgSize(svg), [svg]);
  const [svgSize, setSvgSize] = useState(initialSvgSize);

  useEffect(() => {
    setSvgSize(initialSvgSize);
  }, [initialSvgSize, svg]);

  useEffect(() => {
    if (!opened) {
      return;
    }

    setZoom(INITIAL_FIT_ZOOM);
    setPan({ x: 0, y: 0 });
    setIsDragging(false);
    dragStartRef.current = null;
    dragOriginRef.current = { x: 0, y: 0 };
    lastGestureScaleRef.current = 1;
  }, [opened, svg]);

  useEffect(() => {
    if (!opened) {
      return;
    }

    const preventBrowserZoom = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
      }
    };

    const preventGestureZoom = (event: Event) => {
      event.preventDefault();
    };

    window.addEventListener("wheel", preventBrowserZoom, {
      passive: false,
      capture: true,
    });
    window.addEventListener("gesturestart", preventGestureZoom, {
      passive: false,
      capture: true,
    });
    window.addEventListener("gesturechange", preventGestureZoom, {
      passive: false,
      capture: true,
    });

    return () => {
      window.removeEventListener("wheel", preventBrowserZoom, {
        capture: true,
      });
      window.removeEventListener("gesturestart", preventGestureZoom, {
        capture: true,
      });
      window.removeEventListener("gesturechange", preventGestureZoom, {
        capture: true,
      });
    };
  }, [opened]);

  useEffect(() => {
    if (!opened) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [opened, onClose]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !opened) {
      return;
    }

    const updateViewportSize = () => {
      const rect = viewport.getBoundingClientRect();
      setViewportSize({
        width: rect.width,
        height: rect.height,
      });
    };

    updateViewportSize();
    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(viewport);

    return () => observer.disconnect();
  }, [opened]);

  const baseScale = useMemo(() => {
    if (!viewportSize.width || !viewportSize.height) {
      return 1;
    }

    // Contain: diagram fits in viewport, keep ratio; either full width or full height, no distortion.
    // Account for stage padding so the whole card (svg + padding) stays inside viewport.
    const w = svgSize.width + STAGE_PADDING_PX;
    const h = svgSize.height + STAGE_PADDING_PX;
    return Math.min(
      viewportSize.width / w,
      viewportSize.height / h,
    );
  }, [svgSize.height, svgSize.width, viewportSize.height, viewportSize.width]);

  useEffect(() => {
    if (!opened) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const renderedSvg = stageRef.current?.querySelector("svg");
      if (!renderedSvg) {
        return;
      }

      const trimmed = trimRenderedSvgWhitespace(renderedSvg);
      if (!trimmed) {
        return;
      }

      setSvgSize((prev) => {
        if (
          Math.abs(prev.width - trimmed.width) < 0.01 &&
          Math.abs(prev.height - trimmed.height) < 0.01
        ) {
          return prev;
        }
        return trimmed;
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [opened, svg]);

  const getPanLimits = useCallback(
    (nextZoom: number) => {
      if (!viewportSize.width || !viewportSize.height) {
        return { x: 0, y: 0 };
      }

      const totalScale = baseScale * nextZoom;
      const scaledWidth = svgSize.width * totalScale;
      const scaledHeight = svgSize.height * totalScale;
      return {
        x: Math.max(0, (scaledWidth - viewportSize.width) / 2),
        y: Math.max(0, (scaledHeight - viewportSize.height) / 2),
      };
    },
    [baseScale, svgSize.height, svgSize.width, viewportSize.height, viewportSize.width],
  );

  const clampPan = useCallback(
    (nextPan: Point, nextZoom: number): Point => {
      const limit = getPanLimits(nextZoom);
      return {
        x: Math.min(limit.x, Math.max(-limit.x, nextPan.x)),
        y: Math.min(limit.y, Math.max(-limit.y, nextPan.y)),
      };
    },
    [getPanLimits],
  );

  const panLimits = useMemo(() => getPanLimits(zoom), [getPanLimits, zoom]);
  const canPan = panLimits.x > 0 || panLimits.y > 0;

  const getAnchorFromClient = useCallback(
    (clientX: number, clientY: number): Point => {
      const viewport = viewportRef.current;
      if (!viewport) {
        return { x: 0, y: 0 };
      }
      const rect = viewport.getBoundingClientRect();
      return {
        x: clientX - rect.left - rect.width / 2,
        y: clientY - rect.top - rect.height / 2,
      };
    },
    [],
  );

  const applyZoom = useCallback(
    (
      targetZoomOrUpdater: number | ((prevZoom: number) => number),
      anchor: Point = { x: 0, y: 0 },
    ) => {
      setZoom((prevZoom) => {
        const rawTargetZoom =
          typeof targetZoomOrUpdater === "function"
            ? targetZoomOrUpdater(prevZoom)
            : targetZoomOrUpdater;
        const nextZoom = clampScale(rawTargetZoom);
        setPan((prevPan) => {
          const prevScale = baseScale * prevZoom;
          const nextScale = baseScale * nextZoom;
          if (prevScale <= 0 || nextScale <= 0) {
            return clampPan(prevPan, nextZoom);
          }

          const nextPan = {
            x: anchor.x - ((anchor.x - prevPan.x) * nextScale) / prevScale,
            y: anchor.y - ((anchor.y - prevPan.y) * nextScale) / prevScale,
          };
          return clampPan(nextPan, nextZoom);
        });
        return nextZoom;
      });
    },
    [baseScale, clampPan],
  );

  const zoomIn = useCallback(() => {
    applyZoom((prevZoom) => prevZoom * BUTTON_ZOOM_FACTOR);
  }, [applyZoom]);

  const zoomOut = useCallback(() => {
    applyZoom((prevZoom) => prevZoom / BUTTON_ZOOM_FACTOR);
  }, [applyZoom]);

  const resetView = useCallback(() => {
    setZoom(INITIAL_FIT_ZOOM);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    setPan((prevPan) => {
      const clamped = clampPan(prevPan, zoom);
      if (clamped.x === prevPan.x && clamped.y === prevPan.y) {
        return prevPan;
      }
      return clamped;
    });
  }, [clampPan, zoom, viewportSize.width, viewportSize.height]);

  const handleWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      const anchor = getAnchorFromClient(event.clientX, event.clientY);
      const factor = Math.exp(-event.deltaY * 0.0025);
      applyZoom((prevZoom) => prevZoom * factor, anchor);
    },
    [applyZoom, getAnchorFromClient],
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !opened) {
      return;
    }

    const handleGestureStart = (event: Event) => {
      const gestureEvent = event as WebKitGestureEvent;
      lastGestureScaleRef.current = gestureEvent.scale || 1;
      gestureEvent.preventDefault();
    };

    const handleGestureChange = (event: Event) => {
      const gestureEvent = event as WebKitGestureEvent;
      gestureEvent.preventDefault();
      const currentScale = gestureEvent.scale || 1;
      const delta = currentScale / (lastGestureScaleRef.current || 1);
      lastGestureScaleRef.current = currentScale;

      const maybeClientX = (gestureEvent as Event & { clientX?: number }).clientX;
      const maybeClientY = (gestureEvent as Event & { clientY?: number }).clientY;
      const anchor =
        typeof maybeClientX === "number" && typeof maybeClientY === "number"
          ? getAnchorFromClient(maybeClientX, maybeClientY)
          : { x: 0, y: 0 };

      applyZoom((prevZoom) => prevZoom * delta, anchor);
    };

    viewport.addEventListener("gesturestart", handleGestureStart, {
      passive: false,
    });
    viewport.addEventListener("gesturechange", handleGestureChange, {
      passive: false,
    });

    return () => {
      viewport.removeEventListener("gesturestart", handleGestureStart);
      viewport.removeEventListener("gesturechange", handleGestureChange);
    };
  }, [applyZoom, getAnchorFromClient, opened]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!canPan) {
        return;
      }

      event.preventDefault();
      dragStartRef.current = { x: event.clientX, y: event.clientY };
      dragOriginRef.current = { ...pan };
      setIsDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [canPan, pan],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragStartRef.current || !isDragging) {
        return;
      }

      const deltaX = event.clientX - dragStartRef.current.x;
      const deltaY = event.clientY - dragStartRef.current.y;
      const nextPan = {
        x: dragOriginRef.current.x + deltaX,
        y: dragOriginRef.current.y + deltaY,
      };
      setPan(clampPan(nextPan, zoom));
    },
    [clampPan, isDragging, zoom],
  );

  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      dragStartRef.current = null;
      setIsDragging(false);
    },
    [],
  );

  const getCurrentSvgMarkup = useCallback(() => {
    const renderedSvg = stageRef.current?.querySelector("svg");
    return renderedSvg?.outerHTML ?? svg;
  }, [svg]);

  const downloadSvg = useCallback(() => {
    const currentSvg = getCurrentSvgMarkup();
    const blob = new Blob([currentSvg], { type: "image/svg+xml;charset=utf-8" });
    saveAs(blob, buildFileName("svg"));
  }, [getCurrentSvgMarkup]);

  const downloadPng = useCallback(async () => {
    const currentSvg = getCurrentSvgMarkup();
    const svgBlob = new Blob([currentSvg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    try {
      const { width, height } = getSvgSize(currentSvg);
      const image = new Image();
      image.decoding = "async";

      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Image decoding failed"));
        image.src = url;
      });

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width));
      canvas.height = Math.max(1, Math.round(height));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Canvas context is not available");
      }

      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      const pngBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("Failed to convert to PNG"));
            return;
          }
          resolve(blob);
        }, "image/png");
      });

      saveAs(pngBlob, buildFileName("png"));
    } finally {
      URL.revokeObjectURL(url);
    }
  }, [getCurrentSvgMarkup]);

  if (!opened) {
    return null;
  }

  return (
    <Portal>
      <div className={classes.mermaidPreviewOverlay} role="dialog" aria-modal="true">
        <ActionIcon
          variant="filled"
          radius="xl"
          size="xl"
          className={classes.mermaidPreviewCloseButton}
          onClick={onClose}
          aria-label={t("Close")}
        >
          <IconX size={18} />
        </ActionIcon>

        <div
          ref={viewportRef}
          className={classes.mermaidPreviewViewport}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              onClose();
            }
          }}
          onWheel={handleWheel}
        >
          <div
            ref={stageRef}
            className={classes.mermaidPreviewStage}
            style={{
              transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${baseScale * zoom})`,
              transition: isDragging ? "none" : "transform 120ms ease-out",
              cursor: canPan ? (isDragging ? "grabbing" : "grab") : "default",
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
          >
            <div dangerouslySetInnerHTML={{ __html: svg }} />
          </div>
        </div>

        <Group gap={6} className={classes.mermaidPreviewToolbar}>
          <Tooltip label={t("Zoom out")} withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              className={classes.mermaidPreviewToolbarIcon}
              onClick={zoomOut}
            >
              <IconMinus size={16} />
            </ActionIcon>
          </Tooltip>
          <div className={classes.mermaidPreviewZoomValue}>{Math.round(zoom * 100)}%</div>
          <Tooltip label={t("Zoom in")} withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              className={classes.mermaidPreviewToolbarIcon}
              onClick={zoomIn}
            >
              <IconPlus size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("Reset")} withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              className={classes.mermaidPreviewToolbarIcon}
              onClick={resetView}
            >
              <IconRestore size={16} />
            </ActionIcon>
          </Tooltip>
          <div className={classes.mermaidPreviewToolbarDivider} />
          <Tooltip label={t("Download PNG")} withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              className={classes.mermaidPreviewToolbarIcon}
              onClick={() => {
                void downloadPng().catch((error: unknown) => {
                  console.error("Failed to download Mermaid PNG", error);
                });
              }}
            >
              <IconFileTypePng size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={t("Download SVG")} withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              className={classes.mermaidPreviewToolbarIcon}
              onClick={downloadSvg}
            >
              <IconFileTypeSvg size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </div>
    </Portal>
  );
}
