import type { CSSProperties } from "react";
import classes from "./shared-page-skeleton.module.css";

interface SharedPageSkeletonProps {
  fullscreen?: boolean;
  py?: number | string;
}

const sectionPatterns = [
  ["100%", "96%", "88%", "84%"],
  ["36%"],
  ["100%", "94%", "91%", "82%"],
  ["42%"],
  ["98%", "100%", "87%"],
];

export default function SharedPageSkeleton({
  fullscreen = false,
  py = 0,
}: SharedPageSkeletonProps) {
  return (
    <div
      className={[classes.viewport, fullscreen ? classes.viewportFullscreen : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className={classes.shell}
        style={
          {
            "--shared-page-skeleton-py":
              typeof py === "number" ? `${py}px` : py,
          } as CSSProperties
        }
      >
        <div className={classes.header}>
          <div className={`${classes.block} ${classes.kicker}`} />
          <div className={`${classes.block} ${classes.titleLg}`} />
          <div className={`${classes.block} ${classes.titleMd}`} />
          <div className={`${classes.block} ${classes.meta}`} />
        </div>

        <div className={classes.body}>
          {sectionPatterns.map((section, sectionIndex) => (
            <section key={sectionIndex} className={classes.section}>
              {section.map((width, lineIndex) => (
                <div
                  key={`${sectionIndex}-${lineIndex}`}
                  className={[
                    classes.block,
                    lineIndex === 0 && section.length === 1
                      ? classes.sectionHeading
                      : classes.line,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ width }}
                />
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
