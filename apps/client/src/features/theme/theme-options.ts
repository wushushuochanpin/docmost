import type { MantineColorScheme } from "@mantine/core";
import type { AppPalette } from "./theme-palette.ts";

/** Single theme option shown in UI (Light, Light (Soft), Dark, etc.) */
export type ThemeOptionValue =
  | "light"
  | "light-soft"
  | "dark"
  | "dark-gray"
  | "dark-blue"
  | "dark-warm"
  | "dark-green"
  | "auto";

export interface ThemeOption {
  value: ThemeOptionValue;
  colorScheme: MantineColorScheme;
  palette: AppPalette;
}

export const THEME_OPTIONS: ThemeOption[] = [
  { value: "light", colorScheme: "light", palette: "default" },
  { value: "light-soft", colorScheme: "light", palette: "soft" },
  { value: "dark", colorScheme: "dark", palette: "default" },
  { value: "dark-gray", colorScheme: "dark", palette: "gray" },
  { value: "dark-blue", colorScheme: "dark", palette: "blue-gray" },
  { value: "dark-warm", colorScheme: "dark", palette: "warm" },
  { value: "dark-green", colorScheme: "dark", palette: "green" },
  { value: "auto", colorScheme: "auto", palette: "default" },
];

const VALID_OPTION_VALUES: ThemeOptionValue[] = THEME_OPTIONS.map(
  (o) => o.value,
);

export const APP_THEME_OPTION_KEY = "app-theme-option";

export function getStoredThemeOption(): ThemeOptionValue | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(APP_THEME_OPTION_KEY);
  if (raw && VALID_OPTION_VALUES.includes(raw as ThemeOptionValue)) {
    return raw as ThemeOptionValue;
  }
  return null;
}

export function setStoredThemeOption(value: ThemeOptionValue): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(APP_THEME_OPTION_KEY, value);
}

export function getCurrentThemeOption(
  colorScheme: MantineColorScheme,
  palette: AppPalette,
): ThemeOptionValue {
  if (colorScheme === "auto") return "auto";
  if (colorScheme === "light") {
    return palette === "soft" ? "light-soft" : "light";
  }
  if (colorScheme === "dark") {
    if (palette === "default") return "dark";
    if (palette === "gray") return "dark-gray";
    if (palette === "blue-gray") return "dark-blue";
    if (palette === "warm") return "dark-warm";
    if (palette === "green") return "dark-green";
    return "dark";
  }
  return "light";
}

export function getThemeOptionByValue(
  value: ThemeOptionValue,
): ThemeOption | undefined {
  return THEME_OPTIONS.find((o) => o.value === value);
}
