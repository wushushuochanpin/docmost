const COLOR_SCHEME_STORAGE_KEY = "mantine-color-scheme-value";

export type ShareColorScheme = "light" | "dark";
type StoredColorScheme = ShareColorScheme | "auto";

function isStoredColorScheme(value: string | null): value is StoredColorScheme {
  return value === "light" || value === "dark" || value === "auto";
}

function resolveSystemColorScheme(): ShareColorScheme {
  if (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }

  return "light";
}

export function resolveShareColorScheme(
  value?: string | null,
): ShareColorScheme {
  if (value === "dark") {
    return "dark";
  }

  if (value === "auto") {
    return resolveSystemColorScheme();
  }

  return "light";
}

export function getStoredShareColorScheme(): StoredColorScheme {
  if (typeof window === "undefined") {
    return "light";
  }

  const storedValue = window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY);
  return isStoredColorScheme(storedValue) ? storedValue : "light";
}

export function syncShareColorSchemeToDocument(): ShareColorScheme {
  const colorScheme = resolveShareColorScheme(getStoredShareColorScheme());

  if (typeof document !== "undefined") {
    document.documentElement.setAttribute(
      "data-mantine-color-scheme",
      colorScheme,
    );
  }

  return colorScheme;
}

export function getCurrentShareColorScheme(): ShareColorScheme {
  if (typeof document !== "undefined") {
    const current = document.documentElement.getAttribute(
      "data-mantine-color-scheme",
    );

    if (current === "light" || current === "dark") {
      return current;
    }
  }

  return syncShareColorSchemeToDocument();
}

export function setShareColorScheme(
  colorScheme: StoredColorScheme,
): ShareColorScheme {
  const resolvedColorScheme = resolveShareColorScheme(colorScheme);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, colorScheme);
  }

  if (typeof document !== "undefined") {
    document.documentElement.setAttribute(
      "data-mantine-color-scheme",
      resolvedColorScheme,
    );
  }

  return resolvedColorScheme;
}

export function toggleShareColorScheme(): ShareColorScheme {
  return setShareColorScheme(
    getCurrentShareColorScheme() === "dark" ? "light" : "dark",
  );
}
