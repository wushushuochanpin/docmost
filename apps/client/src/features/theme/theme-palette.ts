/**
 * Theme palette: optional color variant on top of Mantine light/dark.
 * "default" = use resolver only (no data-app-palette). Others override via theme-palettes.css.
 */
export type AppPalette =
  | "default"
  | "soft"
  | "gray"
  | "blue-gray"
  | "warm"
  | "green";

export const APP_PALETTE_STORAGE_KEY = "app-palette";

const VALID_PALETTES: AppPalette[] = [
  "default",
  "soft",
  "gray",
  "blue-gray",
  "warm",
  "green",
];

export function getStoredPalette(): AppPalette {
  if (typeof window === "undefined") return "default";
  const raw = window.localStorage.getItem(APP_PALETTE_STORAGE_KEY);
  if (raw && VALID_PALETTES.includes(raw as AppPalette)) {
    return raw as AppPalette;
  }
  return "default";
}

export function setStoredPalette(palette: AppPalette): void {
  if (typeof window === "undefined") return;
  if (palette === "default") {
    window.localStorage.removeItem(APP_PALETTE_STORAGE_KEY);
  } else {
    window.localStorage.setItem(APP_PALETTE_STORAGE_KEY, palette);
  }
}

export function syncPaletteToDocument(palette: AppPalette): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (palette === "default") {
    root.removeAttribute("data-app-palette");
  } else {
    root.setAttribute("data-app-palette", palette);
  }
}
