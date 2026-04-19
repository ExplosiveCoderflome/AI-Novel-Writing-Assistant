import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  APP_RUNTIME,
  APP_RUNTIME_IS_PACKAGED,
  APP_RUNTIME_IS_PORTABLE,
  APP_UPDATE_CHANNEL,
  APP_VERSION,
} from "@/lib/constants";
import { checkForDesktopUpdates, quitAndInstallDesktopUpdate, useDesktopUpdater } from "@/lib/desktop";

function formatUpdaterStatus(status: string): string {
  switch (status) {
    case "disabled":
      return "Disabled";
    case "idle":
      return "Idle";
    case "checking":
      return "Checking";
    case "update-available":
      return "Update available";
    case "downloading":
      return "Downloading";
    case "downloaded":
      return "Ready to install";
    case "not-available":
      return "Up to date";
    case "error":
      return "Update error";
    default:
      return status;
  }
}

export default function DesktopUpdateCard() {
  const updater = useDesktopUpdater();
  const [isBusy, setIsBusy] = useState(false);

  if (APP_RUNTIME !== "desktop") {
    return null;
  }

  const installModeLabel = APP_RUNTIME_IS_PORTABLE ? "Portable" : "Installed build";
  const showDownloadButton = updater.status === "update-available";
  const showInstallButton = updater.status === "downloaded";
  const showCheckButton = updater.status !== "downloading" && !showInstallButton;

  return (
    <Card className="border-slate-300/80 bg-slate-50/80">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Desktop Beta Channel</CardTitle>
          <Badge variant="outline">{installModeLabel}</Badge>
          <Badge variant="outline">Channel {APP_UPDATE_CHANNEL}</Badge>
        </div>
        <CardDescription>
          Current binary version {APP_VERSION}. Installed NSIS builds can check GitHub Releases in the background and
          install updates after confirmation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-md border bg-background p-3">
            <div className="text-xs text-muted-foreground">Current version</div>
            <div className="mt-1 font-medium">{APP_VERSION}</div>
          </div>
          <div className="rounded-md border bg-background p-3">
            <div className="text-xs text-muted-foreground">Update status</div>
            <div className="mt-1 font-medium">{formatUpdaterStatus(updater.status)}</div>
          </div>
          <div className="rounded-md border bg-background p-3">
            <div className="text-xs text-muted-foreground">Available version</div>
            <div className="mt-1 font-medium">{updater.availableVersion ?? "-"}</div>
          </div>
        </div>

        <div className="rounded-md border bg-background p-4 text-sm text-muted-foreground">
          {APP_RUNTIME_IS_PORTABLE
            ? "Portable builds stay on manual replacement and never enter the auto-update chain."
            : !APP_RUNTIME_IS_PACKAGED
              ? "Development desktop runs expose the updater UI but do not download release assets."
              : updater.message}
          {typeof updater.progressPercent === "number" ? ` Download progress: ${Math.round(updater.progressPercent)}%.` : ""}
        </div>

        <div className="flex flex-wrap gap-3">
          {showCheckButton ? (
            <Button
              onClick={async () => {
                setIsBusy(true);
                try {
                  await checkForDesktopUpdates();
                } finally {
                  setIsBusy(false);
                }
              }}
              disabled={isBusy || updater.status === "checking" || !updater.isSupported}
            >
              {showDownloadButton
                ? "Download update"
                : updater.status === "checking"
                  ? "Checking..."
                  : "Check for updates"}
            </Button>
          ) : null}
          {showInstallButton ? (
            <Button
              onClick={async () => {
                setIsBusy(true);
                try {
                  await quitAndInstallDesktopUpdate();
                } finally {
                  setIsBusy(false);
                }
              }}
              disabled={isBusy || !updater.canInstall}
            >
              Restart and install
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
