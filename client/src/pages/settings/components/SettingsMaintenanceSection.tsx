import i18next from "i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import DesktopLegacyDataImportCard from "@/components/layout/DesktopLegacyDataImportCard";
import DesktopUpdateCard from "@/components/layout/DesktopUpdateCard";
import { APP_RUNTIME } from "@/lib/constants";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

export default function SettingsMaintenanceSection() {
  if (APP_RUNTIME !== "desktop") {
    return (
      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle>{i18next.t("dict.gen_e58e3369")}</CardTitle>
          <CardDescription className={AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}>{i18next.t("settings.settingsMaintenanceSection.yrmyvb")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle>{i18next.t("dict.gen_e58e3369")}</CardTitle>
          <CardDescription className={AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}>{i18next.t("settings.settingsMaintenanceSection.gy7p4w")}</CardDescription>
        </CardHeader>
        <CardContent className={`text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{i18next.t("settings.settingsMaintenanceSection.x3uyhv")}</CardContent>
      </Card>
      <DesktopUpdateCard />
      <DesktopLegacyDataImportCard compact />
    </div>
  );
}
