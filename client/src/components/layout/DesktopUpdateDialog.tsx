import type { ReactNode } from "react";
import { AppDialogContent, Dialog, DialogTrigger } from "@/components/ui/dialog";
import { useDesktopUpdater } from "@/lib/desktop";
import DesktopUpdatePanel from "./DesktopUpdatePanel";

interface DesktopUpdateDialogProps {
  trigger: ReactNode;
}

export default function DesktopUpdateDialog({ trigger }: DesktopUpdateDialogProps) {
  const updater = useDesktopUpdater();

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <AppDialogContent
        className="max-w-2xl"
        title="版本与更新"
        description="查看桌面版状态，并在确认后下载和安装新版本。"
      >
        <DesktopUpdatePanel updater={updater} />
      </AppDialogContent>
    </Dialog>
  );
}
