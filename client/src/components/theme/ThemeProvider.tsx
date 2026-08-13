import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type ThemePalette = "ink" | "paper" | "night";
export type ThemeDensity = "comfortable" | "compact";

export interface ThemePreference {
  mode: ThemeMode;
  palette: ThemePalette;
  density: ThemeDensity;
}

const STORAGE_KEY = "ai-novel.theme.preference";
const DEFAULT_PREFERENCE: ThemePreference = {
  mode: "system",
  palette: "ink",
  density: "comfortable",
};

interface ThemeContextValue extends ThemePreference {
  setMode: (mode: ThemeMode) => void;
  setPalette: (palette: ThemePalette) => void;
  setDensity: (density: ThemeDensity) => void;
  reset: () => void;
  resolvedMode: "light" | "dark";
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readPreference(): ThemePreference {
  if (typeof window === "undefined") return DEFAULT_PREFERENCE;
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<ThemePreference> | null;
    return {
      mode: value?.mode === "light" || value?.mode === "dark" || value?.mode === "system" ? value.mode : DEFAULT_PREFERENCE.mode,
      palette: value?.palette === "ink" || value?.palette === "paper" || value?.palette === "night" ? value.palette : DEFAULT_PREFERENCE.palette,
      density: value?.density === "comfortable" || value?.density === "compact" ? value.density : DEFAULT_PREFERENCE.density,
    };
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

function getSystemMode(): "light" | "dark" {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);
  const [systemMode, setSystemMode] = useState<"light" | "dark">(getSystemMode);
  const resolvedMode = preference.mode === "system" ? systemMode : preference.mode;

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preference));
  }, [preference]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolvedMode === "dark");
    root.dataset.theme = preference.palette;
    root.dataset.density = preference.density;
    root.style.colorScheme = resolvedMode;
  }, [preference.density, preference.palette, resolvedMode]);

  useEffect(() => {
    if (preference.mode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemMode(media.matches ? "dark" : "light");
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, [preference.mode]);

  const value = useMemo<ThemeContextValue>(() => ({
    ...preference,
    resolvedMode,
    setMode: (mode) => setPreference((current) => ({ ...current, mode })),
    setPalette: (palette) => setPreference((current) => ({ ...current, palette })),
    setDensity: (density) => setPreference((current) => ({ ...current, density })),
    reset: () => setPreference(DEFAULT_PREFERENCE),
  }), [preference, resolvedMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme 必须在 ThemeProvider 内使用。");
  return value;
}

export const THEME_STORAGE_KEY = STORAGE_KEY;
