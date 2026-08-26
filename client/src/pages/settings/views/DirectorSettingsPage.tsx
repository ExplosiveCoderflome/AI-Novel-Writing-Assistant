import { useState } from "react";
import AutoDirectorSettingsSection from "../AutoDirectorSettingsSection";
import SettingsActionResult from "../SettingsActionResult";
import { SettingsShell } from "../components/SettingsShell";

export default function DirectorSettingsPage() {
  const [message, setMessage] = useState("");
  return (
    <SettingsShell title="自动导演" description="设置问题处理、自动确认和创作提醒；每本书开始后会按当时设置保留自己的执行规则。">
      <AutoDirectorSettingsSection onActionResult={setMessage} collapseAdvanced />
      <SettingsActionResult message={message} />
    </SettingsShell>
  );
}
