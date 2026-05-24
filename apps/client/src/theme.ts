import {
  createTheme,
  CSSVariablesResolver,
  MantineColorsTuple,
} from "@mantine/core";

const blue: MantineColorsTuple = [
  "#e7f3ff",
  "#d0e4ff",
  "#a1c6fa",
  "#6ea6f6",
  "#458bf2",
  "#2b7af1",
  "#0b60d8",
  "#1b72f2",
  "#0056c1",
  "#004aac",
];

const red: MantineColorsTuple = [
  "#ffebeb",
  "#fad7d7",
  "#eeadad",
  "#e3807f",
  "#da5a59",
  "#d54241",
  "#d43535",
  "#bc2727",
  "#a82022",
  "#93151b",
];

const sansFontFamily = [
  "Inter",
  "'PingFang SC'",
  "'Hiragino Sans GB'",
  "'Microsoft YaHei'",
  "'Noto Sans CJK SC'",
  "'Noto Sans SC'",
  "'Source Han Sans SC'",
  "'WenQuanYi Micro Hei'",
  "-apple-system",
  "BlinkMacSystemFont",
  "'Segoe UI'",
  "Roboto",
  "Helvetica",
  "Arial",
  "sans-serif",
].join(", ");

export const theme = createTheme({
  colors: {
    blue,
    red,
  },
  primaryColor: "blue",
  defaultRadius: "md",
  fontFamily: sansFontFamily,
  headings: {
    fontFamily: sansFontFamily,
    fontWeight: "600",
  },
});

export const mantineCssResolver: CSSVariablesResolver = (theme) => ({
  variables: {
    "--input-error-size": theme.fontSizes.sm,
    "--ui-bg-canvas": "#f7f8fa",
    "--ui-bg-surface": "#ffffff",
    "--ui-bg-subtle": "#f2f4f7",
    "--ui-text-primary": "#111827",
    "--ui-text-secondary": "#5b6473",
    "--ui-text-tertiary": "#8b95a7",
    "--ui-border-default": "#e6e8ec",
    "--ui-border-hover": "#d5dae1",
    "--ui-border-active": "#99a2b3",
    "--ui-accent-primary": "#2563eb",
    "--ui-accent-hover": "#1d4ed8",
    "--ui-shadow-sm": "0 1px 3px rgba(17, 24, 39, 0.08)",
    "--ui-shadow-md":
      "0 8px 32px rgba(17, 24, 39, 0.12), 0 2px 8px rgba(17, 24, 39, 0.06)",
    "--ui-shadow-lg":
      "0 16px 48px rgba(17, 24, 39, 0.16), 0 4px 16px rgba(17, 24, 39, 0.08)",
  },
  light: {
    "--mantine-color-body": "var(--ui-bg-canvas)",
    "--mantine-color-default-border": "var(--ui-border-default)",
    "--mantine-color-dimmed": "#4b5563",
    "--mantine-color-dark-light-color": "#4e5359",
    "--mantine-color-dark-light-hover": "var(--mantine-color-gray-light-hover)",
    // Override the semantic error color so input error text / borders /
    // required asterisks meet WCAG AA 4.5:1 contrast on the filled-input
    // background (#f1f3f5). red.6 (#d43535) lands at 4.36:1; red.7 (#bc2727)
    // gives ~5.7:1. Does not affect other red usages.
    "--mantine-color-error": "var(--mantine-color-red-7)",
    // Bump subtle-gray icon/text color from gray.6 (#868e96, 2.99:1 on filled
    // input — fails WCAG AA 3:1 for non-text) to gray.7 (#495057, 7.35:1).
    // Affects ActionIcon variant="subtle" color="gray" (password visibility
    // toggle, row action menus, etc.).
    "--mantine-color-gray-light-color": "var(--mantine-color-gray-7)",
    // Bump input placeholder color from gray.5 (#adb5bd, 1.87:1 on filled
    // input — fails WCAG AA 4.5:1) to #686868 (5.01:1 on filled, 5.57:1 on
    // white). Halfway between Mantine's gray.6 and gray.7 so the placeholder
    // stays visually distinct from real text while clearing the bar with a
    // safe margin. Affects placeholders across all Mantine inputs.
    "--mantine-color-placeholder": "#686868",
    // Bump variant="light" red text from red.6 (#d43535, 4.17:1 on the
    // 10% red-over-white blended pink background — fails WCAG AA 4.5:1)
    // to red.7 (#bc2727, 5.26:1). Affects every <Button color="red"
    // variant="light"> and matching Badge / Text usages (destructive
    // actions, red badges).
    "--mantine-color-red-light-color": "var(--mantine-color-red-7)",
    // Bump variant="light" green text. Green is inherently bright in
    // luminance, so even Mantine's green.9 (#2b8a3e, 3.78:1) fails 4.5:1
    // on the light-green bg. Use a custom dark green (#1b5e20, Material
    // green 900) outside the standard palette range. New contrast:
    // ~6.8:1. Affects every <Badge color="green" variant="light"> and
    // matching Button / Text usages.
    "--mantine-color-green-light-color": "#1B5E20",
  },
  dark: {
    "--ui-bg-canvas": "#1e1e1e",
    "--ui-bg-surface": "#252526",
    "--ui-bg-subtle": "#2d2d2d",
    "--ui-text-primary": "#e4e4e7",
    "--ui-text-secondary": "#a1a1aa",
    "--ui-text-tertiary": "#71717a",
    "--ui-border-default": "#3c3c3c",
    "--ui-border-hover": "#505050",
    "--ui-border-active": "#6b6b6b",
    "--ui-accent-primary": "#3b82f6",
    "--ui-accent-hover": "#60a5fa",
    "--ui-shadow-sm": "0 1px 3px rgba(0, 0, 0, 0.3)",
    "--ui-shadow-md":
      "0 8px 32px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.2)",
    "--ui-shadow-lg":
      "0 16px 48px rgba(0, 0, 0, 0.5), 0 4px 16px rgba(0, 0, 0, 0.3)",
    "--mantine-color-body": "var(--ui-bg-canvas)",
    "--mantine-color-default-border": "var(--ui-border-default)",
  },
});
