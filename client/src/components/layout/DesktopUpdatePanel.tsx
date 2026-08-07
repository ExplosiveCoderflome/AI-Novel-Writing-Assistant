import { useState } from "react";
import { Download, RefreshCw, RotateCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  checkForDesktopUpdates,
  quitAndInstallDesktopUpdate,
  type DesktopUpdaterSnapshot,
} from "@/lib/desktop";
import { cn } from "@/lib/utils";
import {
  formatDesktopVersion,
  getDesktopChannelLabel,
  getDesktopInstallModeLabel,
  getDesktopUpdaterHint,
  getDesktopUpdaterStatusLabel,
} from "./desktopUpdaterPresentation";

interface DesktopUpdatePanelProps {
  updater: DesktopUpdaterSnapshot;
  showEnvironment?: boolean;
}

function formatCheckedAt(value: string | null): string {
  if (!value) {
    return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "latest check";
  }
  return parsed.toLocaleString("zh-CN", { hour12: false });
}

export default function DesktopUpdatePanel({ updater, showEnvironment = true }: DesktopUpdatePanelProps) {
  const [isBusy, setIsBusy] = useState(false);
  const showDownloadButton = updater.status === "update-available";
  const showInstallButton = updater.status === "downloaded";
  const showCheckButton = updater.status !== "downloading" && !showDownloadButton && !showInstallButton;

  const runAction = async (action: "check" | "install") => {
    setIsBusy(true);
    try {
      if (action === "install") {
        await quitAndInstallDesktopUpdate();
      } else {
        await checkForDesktopUpdates();
      }
    } catch {
      toast.error(action === "install" ? "Failed to restart installation, please try again later." : "Failed to complete version check, please confirm network connection and try again.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {showEnvironment ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{getDesktopInstallModeLabel(updater)}</Badge>
          <Badge variant="outline">{getDesktopChannelLabel(updater.channel)}</Badge>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-muted/25 p-3">
          <div className="text-xs text-muted-foreground">Native version</div>
          <div className="mt-1 font-semibold">{formatDesktopVersion(updater.currentVersion)}</div>
        </div>
        <div className="rounded-xl border bg-muted/25 p-3">
          <div className="text-xs text-muted-foreground">Update status</div>
          <div className="mt-1 font-semibold">{getDesktopUpdaterStatusLabel(updater.status)}</div>
        </div>
        <div className="rounded-xl border bg-muted/25 p-3">
          <div className="text-xs text-muted-foreground">Available versions</div>
          <div className="mt-1 font-semibold">
            {updater.availableVersion ? formatDesktopVersion(updater.availableVersion) : "—"}
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-muted/20 p-4">
        <p className="text-sm leading-6 text-muted-foreground">{getDesktopUpdaterHint(updater)}</p>
        {typeof updater.progressPercent === "number" ? (
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Download progress</span>
              <span>{Math.round(updater.progressPercent)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${Math.max(0, Math.min(100, updater.progressPercent))}%` }}
              />
            </div>
          </div>
        ) : null}
        <div className="mt-3 text-xs text-muted-foreground">Check time:{formatCheckedAt(updater.lastCheckedAt)}</div>
      </div>

      <div className="flex flex-wrap gap-2">
        {showCheckButton ? (
          <Button
            type="button"
            variant={updater.status === "error" ? "default" : "outline"}
            disabled={isBusy || updater.status === "checking" || !updater.isSupported}
            onClick={() => void runAction("check")}
          >
            <RefreshCw className={cn("h-4 w-4", updater.status === "checking" && "animate-spin")} aria-hidden="true" />
            {updater.status === "checking" ? "Checking" : updater.status === "error" || updater.status === "not-available" ? "Checking again" : "Checking for updates"}
          </Button>
        ) : null}
        {showDownloadButton ? (
          <Button type="button" disabled={isBusy} onClick={() => void runAction("check")}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Download updates
                                </Button>
        ) : null}
        {showInstallButton ? (
          <Button type="button" disabled={isBusy || !updater.canInstall} onClick={() => void runAction("install")}>
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            Save your work and restart installation
                                </Button>
        ) : null}
      </div>
    </div>
  );
}
