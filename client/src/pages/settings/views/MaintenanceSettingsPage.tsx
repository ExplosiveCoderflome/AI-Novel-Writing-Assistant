import i18next from "i18next";
import SettingsMaintenanceSection from "../components/SettingsMaintenanceSection";
import { SettingsShell } from "../components/SettingsShell";

export default function MaintenanceSettingsPage() {
  return (
    <SettingsShell title={i18next.t("settings.settingsShell.11hieg")} description={i18next.t("settings.maintenanceSettingsPage.qkqaws")}>
      <SettingsMaintenanceSection />
    </SettingsShell>
  );
}
