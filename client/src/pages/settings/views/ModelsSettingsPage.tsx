import ModelRoutesPage from "../ModelRoutesPage";
import SettingsPage from "../SettingsPage";
import { SettingsShell } from "../components/SettingsShell";

export default function ModelsSettingsPage() {
  return (
    <SettingsShell title="模型与厂商" description="管理可用模型、任务路由和结构化输出备用模型。">
      <SettingsPage />
      <ModelRoutesPage />
    </SettingsShell>
  );
}
