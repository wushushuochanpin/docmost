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
  const paragraphs = text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (!context || width <= 0) return paragraphs;
  context.font = "28px system-ui, sans-serif";
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    let line = "";
    for (const character of Array.from(paragraph)) {
      if (line && context.measureText(line + character).width > width) {
        if (line.trim()) lines.push(line);
        line = character;
      } else {
        line += character;
      }
    }
    if (line.trim()) lines.push(line);
  }
  return lines;
}

// A 20-character line uses the selected speed. Bound the adjustment so short
// headings and long lines remain readable without stopping the continuous scroll.
export function getLineDurationFactor(line: string): number {
  const length = Array.from(line).filter(
    (character) => !/\s/u.test(character),
  ).length;
  return Math.max(0.5, Math.min(2, length / 20));
}

export default function Teleprompter({ title, text, onClose }: Props) {
  const { t } = useTranslation();
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [speed, setSpeed] = useState(40);
  const [playing, setPlaying] = useState(true);
  const [restartCount, setRestartCount] = useState(0);
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

  const lineFactors = useMemo(() => lines.map(getLineDurationFactor), [lines]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    let frame = 0;
    let previous: number | undefined;
    let position = element.scrollTop;
    const tick = (now: number) => {
      const center =
        element.getBoundingClientRect().top + element.clientHeight / 2;
      const contentElement = content.current;
      const first = contentElement?.firstElementChild as HTMLElement | null;
      const lineHeight = first?.offsetHeight ?? 0;
      const firstTop =
        contentElement && first
          ? contentElement.getBoundingClientRect().top + first.offsetTop
          : 0;
      const index =
        lineHeight > 0 ? Math.floor((center - firstTop) / lineHeight) : -1;
      const currentIndex = index >= 0 && index < lines.length ? index : -1;
      setActive(currentIndex);

      if (playing && previous !== undefined) {
        const factor = currentIndex >= 0 ? lineFactors[currentIndex] : 1;
        position += (speed / factor) * Math.min((now - previous) / 1000, 0.1);
        element.scrollTop = position;
        if (position >= element.scrollHeight - element.clientHeight)
          setPlaying(false);
      } else {
        position = element.scrollTop;
      }
      previous = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, lines, lineFactors, restartCount]);

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

  const restartPlayback = () => {
    if (viewport.current) viewport.current.scrollTop = 0;
    setPlaying(true);
    setRestartCount((value) => value + 1);
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
        <button type="button" onClick={restartPlayback}>
          {t("Play from beginning")}
        </button>
        <div className={styles.speed} role="group" aria-label={t("Speed")}>
          <span>{t("Speed")}</span>
          <button
            type="button"
            aria-label={t("Decrease speed")}
            disabled={speed <= 10}
            onClick={() => setSpeed((value) => Math.max(10, value - 10))}
          >
            −
          </button>
          <output aria-live="polite">{speed}</output>
          <button
            type="button"
            aria-label={t("Increase speed")}
            disabled={speed >= 150}
            onClick={() => setSpeed((value) => Math.min(150, value + 10))}
          >
            +
          </button>
        </div>
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
