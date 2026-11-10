import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import styles from "./teleprompter.module.css";

interface Props {
  title: string;
  text: string;
  onClose: () => void;
}

// Wrap text ahead of time so enlarging the current visual line never changes
// the document height or moves the reading position.
function wrapText(text: string, width: number): string[] {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context || width <= 0) return text.split("\n");
  context.font = "28px system-ui, sans-serif";
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const character of Array.from(paragraph)) {
      if (line && context.measureText(line + character).width > width) {
        lines.push(line);
        line = character;
      } else {
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
}

export default function Teleprompter({ title, text, onClose }: Props) {
  const { t } = useTranslation();
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [speed, setSpeed] = useState(40);
  const [playing, setPlaying] = useState(true);
  const [active, setActive] = useState(-1);
  const lines = useMemo(
    () => wrapText([title, text].filter(Boolean).join("\n\n"), width),
    [title, text, width],
  );

  useEffect(() => {
    const element = content.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (
        event.code === "Space" &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLButtonElement)
      ) {
        event.preventDefault();
        setPlaying((value) => !value);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    let frame = 0;
    let previous: number | undefined;
    let position = element.scrollTop;
    const tick = (now: number) => {
      if (playing && previous !== undefined) {
        position += speed * Math.min((now - previous) / 1000, 0.1);
        element.scrollTop = position;
        if (position >= element.scrollHeight - element.clientHeight)
          setPlaying(false);
      } else {
        position = element.scrollTop;
      }
      previous = now;
      const center =
        element.getBoundingClientRect().top + element.clientHeight / 2;
      const children = content.current?.children;
      if (children?.length) {
        const first = (children[0] as HTMLElement).getBoundingClientRect();
        const lineHeight = first.height;
        const index = Math.floor((center - first.top) / lineHeight);
        setActive(index >= 0 && index < children.length ? index : -1);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, lines]);

  const togglePlayback = () => {
    const element = viewport.current;
    if (
      !playing &&
      element &&
      element.scrollTop >= element.scrollHeight - element.clientHeight - 1
    ) {
      element.scrollTop = 0;
    }
    setPlaying((value) => !value);
  };

  return createPortal(
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={t("Teleprompter")}
    >
      <div className={styles.controls}>
        <strong>{t("Teleprompter")}</strong>
        <button type="button" autoFocus onClick={togglePlayback}>
          {playing ? t("Pause") : t("Play")}
        </button>
        <label className={styles.speed}>
          {t("Speed")}{" "}
          <input
            type="range"
            min="10"
            max="150"
            step="10"
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
          />{" "}
          <span>{speed}</span>
        </label>
        <button type="button" onClick={onClose}>
          {t("Exit")} · Esc
        </button>
      </div>
      <div className={styles.guide} aria-hidden="true" />
      <div
        className={styles.viewport}
        ref={viewport}
        onWheel={() => setPlaying(false)}
        onTouchStart={() => setPlaying(false)}
      >
        <div className={styles.content} ref={content}>
          {lines.map((line, index) => (
            <div
              key={index}
              className={`${styles.line} ${active === index ? styles.active : ""}`}
            >
              {line || "\u00a0"}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
