import SettingsPage from "../SettingsPage";
import { SettingsShell } from "../components/SettingsShell";

export default function ModelsSettingsPage() {
  return (
    <SettingsShell title="模型与厂商" description="添加并管理创作可用的模型厂商与模型。">
      <SettingsPage />
    </SettingsShell>
  );
}
