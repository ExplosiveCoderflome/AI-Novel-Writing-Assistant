import i18next from "i18next";
import ModelRoutesPage from "../ModelRoutesPage";
import SettingsPage from "../SettingsPage";
import { SettingsShell } from "../components/SettingsShell";

export default function ModelsSettingsPage() {
  return (
    <SettingsShell title={i18next.t("settings.settingsShell.5a5e0")} description={i18next.t("settings.modelsSettingsPage.6sfriu")}>
      <SettingsPage />
      <ModelRoutesPage />
    </SettingsShell>
  );
}
