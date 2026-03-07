export type ShareColorScheme = "light";

export function applyShareReaderTheme(): ShareColorScheme {
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.setAttribute("data-mantine-color-scheme", "light");
    root.removeAttribute("data-app-palette");
  }

  return "light";
}
