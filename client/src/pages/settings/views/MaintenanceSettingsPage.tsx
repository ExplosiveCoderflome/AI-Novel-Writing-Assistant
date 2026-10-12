import SettingsMaintenanceSection from "../components/SettingsMaintenanceSection";
import { SettingsShell } from "../components/SettingsShell";

export default function MaintenanceSettingsPage() {
  return (
    <SettingsShell title="桌面与维护" description="查看与当前使用环境相关的更新、导入和维护事项。">
      <SettingsMaintenanceSection />
    </SettingsShell>
  );
}
