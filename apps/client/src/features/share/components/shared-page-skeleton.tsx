import type { CSSProperties } from "react";

interface SharedPageSkeletonProps {
  fullscreen?: boolean;
  py?: number | string;
}

const shellStyle = {
  width: "min(900px, 100%)",
  margin: "0 auto",
  paddingInline: "24px",
} satisfies CSSProperties;

const blockStyle = {
  background: "#eceff3",
} satisfies CSSProperties;

export default function SharedPageSkeleton({
  fullscreen = false,
  py = 0,
}: SharedPageSkeletonProps) {
  return (
    <div
      style={
        fullscreen
          ? {
              minHeight: "100vh",
              display: "flex",
              alignItems: "center",
            }
          : undefined
      }
    >
      <div
        style={{
          ...shellStyle,
          width: "100%",
          paddingTop: py,
          paddingBottom: py,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                ...blockStyle,
                height: 16,
                width: "18%",
                borderRadius: 999,
              }}
            />
            <div
              style={{
                ...blockStyle,
                height: 40,
                width: "58%",
                borderRadius: 12,
              }}
            />
            <div
              style={{
                ...blockStyle,
                height: 18,
                width: "42%",
                borderRadius: 10,
              }}
            />
          </div>

          <div
            style={{
              ...blockStyle,
              height: 220,
              borderRadius: 16,
            }}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {["100%", "96%", "92%", "88%", "84%", "79%"].map((width) => (
              <div
                key={width}
                style={{
                  ...blockStyle,
                  height: 16,
                  width,
                  borderRadius: 999,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
