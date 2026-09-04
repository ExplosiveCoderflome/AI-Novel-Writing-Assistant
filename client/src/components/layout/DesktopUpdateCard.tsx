import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_RUNTIME } from "@/lib/constants";
import { useDesktopUpdater } from "@/lib/desktop";
import DesktopUpdatePanel from "./DesktopUpdatePanel";

export default function DesktopUpdateCard() {
  const updater = useDesktopUpdater();

  if (APP_RUNTIME !== "desktop") {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>桌面版更新</CardTitle>
        <CardDescription>查看详细版本状态，也可以直接点击工作区顶部的版本号快速打开更新面板。</CardDescription>
      </CardHeader>
      <CardContent>
        <DesktopUpdatePanel updater={updater} />
      </CardContent>
    </Card>
  );
}
