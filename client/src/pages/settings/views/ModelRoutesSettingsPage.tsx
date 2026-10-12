import ModelRoutesPage from "../ModelRoutesPage";
import { SettingsShell } from "../components/SettingsShell";

export default function ModelRoutesSettingsPage() {
  return (
    <SettingsShell title="模型路由管理" description="为不同创作任务选择模型，并设置结构化输出备用模型。">
      <ModelRoutesPage />
    </SettingsShell>
  );
}
