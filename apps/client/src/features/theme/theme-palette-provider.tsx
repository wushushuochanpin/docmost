import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  getStoredPalette,
  setStoredPalette,
  syncPaletteToDocument,
  type AppPalette,
} from "./theme-palette.ts";
import { getStoredThemeOption } from "./theme-options.ts";

type ThemePaletteContextValue = {
  palette: AppPalette;
  setPalette: (next: AppPalette) => void;
};

const ThemePaletteContext = createContext<ThemePaletteContextValue | null>(
  null,
);

export function ThemePaletteProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [palette, setPaletteState] = useState<AppPalette>(() => {
    const p = getStoredPalette();
    const opt = getStoredThemeOption();
    if (opt === "dark-gray" && p === "default") {
      setStoredPalette("gray");
      return "gray";
    }
    return p;
  });

  const setPalette = useCallback((next: AppPalette) => {
    setStoredPalette(next);
    setPaletteState(next);
    syncPaletteToDocument(next);
  }, []);

  useEffect(() => {
    syncPaletteToDocument(palette);
  }, [palette]);

  return (
    <ThemePaletteContext.Provider value={{ palette, setPalette }}>
      {children}
    </ThemePaletteContext.Provider>
  );
}

export function useThemePalette(): ThemePaletteContextValue {
  const ctx = useContext(ThemePaletteContext);
  if (!ctx) {
    throw new Error("useThemePalette must be used within ThemePaletteProvider");
  }
  return ctx;
}
