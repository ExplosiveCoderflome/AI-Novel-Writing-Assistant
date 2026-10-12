import { Download, RefreshCw, RotateCw } from "lucide-react";
import { APP_RUNTIME, APP_VERSION } from "@/lib/constants";
import { useDesktopUpdater } from "@/lib/desktop";
import { cn } from "@/lib/utils";
import DesktopUpdateDialog from "./DesktopUpdateDialog";
import { formatDesktopVersion } from "./desktopUpdaterPresentation";

interface AppVersionBadgeProps {
  className?: string;
}

export default function AppVersionBadge({ className }: AppVersionBadgeProps) {
  const updater = useDesktopUpdater();
  const versionLabel = formatDesktopVersion(APP_VERSION);
  const isDesktop = APP_RUNTIME === "desktop";
  const currentDesktopVersion = updater.currentVersion === "0.0.0" ? versionLabel : formatDesktopVersion(updater.currentVersion);

  if (isDesktop) {
    const isAvailable = updater.status === "update-available";
    const isDownloaded = updater.status === "downloaded";
    const isDownloading = updater.status === "downloading";
    const isChecking = updater.status === "checking";
    const label = isDownloaded
      ? "重启安装"
      : isAvailable
        ? "立即更新"
        : isDownloading
          ? `更新 ${Math.round(updater.progressPercent ?? 0)}%`
          : isChecking
            ? "检查更新"
            : currentDesktopVersion;
    const Icon = isDownloaded ? RotateCw : isAvailable || isDownloading ? Download : isChecking ? RefreshCw : null;

    return (
      <DesktopUpdateDialog
        trigger={(
          <button
            type="button"
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isAvailable || isDownloaded
                ? "border-amber-400/70 bg-amber-100 text-amber-900 hover:bg-amber-200"
                : "border-border/70 bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
              className,
            )}
            title="打开版本与更新"
            aria-label={`打开版本与更新，${label}`}
          >
            {Icon ? <Icon className={cn("h-3 w-3", isChecking && "animate-spin")} aria-hidden="true" /> : null}
            {label}
            {isAvailable || isDownloaded ? <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" /> : null}
          </button>
        )}
      />
    );
  }

  return (
    <span
      className={cn(
        "shrink-0 rounded-md border border-border/70 bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground",
        className,
      )}
      title={`当前版本 ${versionLabel}`}
      aria-label={`当前版本 ${versionLabel}`}
    >
      {versionLabel}
    </span>
  );
}
