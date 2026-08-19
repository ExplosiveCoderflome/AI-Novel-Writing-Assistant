import i18next from "i18next";
import { Palette, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsShell } from "../components/SettingsShell";
import { useTheme } from "@/components/theme/ThemeProvider";

const palettes = [
  { value: "ink", label: i18next.t("settings.appearanceSettingsPage.fqlu"), description: i18next.t("settings.appearanceSettingsPage.1ji8se") },
  { value: "paper", label: i18next.t("settings.appearanceSettingsPage.i57m"), description: i18next.t("settings.appearanceSettingsPage.ui4s6d") },
  { value: "night", label: i18next.t("settings.appearanceSettingsPage.fvda"), description: i18next.t("settings.appearanceSettingsPage.7ha9wj") },
] as const;

export default function AppearanceSettingsPage() {
  const { mode, palette, density, setMode, setPalette, setDensity, reset } = useTheme();
  return (
    <SettingsShell title={i18next.t("settings.settingsShell.avfjvj")} description={i18next.t("settings.appearanceSettingsPage.g5wn8y")}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Palette className="h-4 w-4" />{i18next.t("settings.appearanceSettingsPage.ff7req")}</CardTitle>
          <CardDescription>{i18next.t("settings.appearanceSettingsPage.1y0vsg")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <label className="block space-y-2 text-sm font-medium">
            <span>{i18next.t("settings.appearanceSettingsPage.deijey")}</span>
            <Select value={mode} onValueChange={(value) => setMode(value as typeof mode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="system">{i18next.t("theme.themeToggle.iiuf2s")}</SelectItem>
                <SelectItem value="light">{i18next.t("settings.appearanceSettingsPage.javh")}</SelectItem>
                <SelectItem value="dark">{i18next.t("settings.appearanceSettingsPage.jezl")}</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>{i18next.t("settings.appearanceSettingsPage.aiax0r")}</span>
            <Select value={palette} onValueChange={(value) => setPalette(value as typeof palette)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {palettes.map((item) => <SelectItem key={item.value} value={item.value}>{item.label} · {item.description}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>{i18next.t("settings.appearanceSettingsPage.ff7zcm")}</span>
            <Select value={density} onValueChange={(value) => setDensity(value as typeof density)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="comfortable">{i18next.t("settings.appearanceSettingsPage.mwxc")}</SelectItem>
                <SelectItem value="compact">{i18next.t("dict.gen_03e59bb3")}</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={reset}><RotateCcw className="mr-2 h-4 w-4" />{i18next.t("settings.appearanceSettingsPage.nylcss")}</Button>
          </div>
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
