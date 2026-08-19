import i18next from "i18next";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme, type ThemeMode } from "./ThemeProvider";

const nextMode: Record<ThemeMode, ThemeMode> = { light: "dark", dark: "system", system: "light" };
const labels: Record<ThemeMode, string> = { light: i18next.t("theme.themeToggle.ebnfbe"), dark: i18next.t("theme.themeToggle.eep926"), system: i18next.t("theme.themeToggle.iiuf2s") };

export default function ThemeToggle() {
  const { mode, resolvedMode, setMode } = useTheme();
  const Icon = mode === "system" ? Monitor : resolvedMode === "dark" ? Moon : Sun;
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="h-9 w-9"
      aria-label={i18next.t("theme.themeToggle.c9iryf", { val1: (labels[mode]) })}
      title={i18next.t("theme.themeToggle.c9iryf", { val1: (labels[mode]) })}
      onClick={() => setMode(nextMode[mode])}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
