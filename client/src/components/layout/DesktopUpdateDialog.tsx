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
        title="Versions and updates"
        description="Check the desktop version status and download and install the new version after confirmation."
      >
        <DesktopUpdatePanel updater={updater} />
      </AppDialogContent>
    </Dialog>
  );
}
