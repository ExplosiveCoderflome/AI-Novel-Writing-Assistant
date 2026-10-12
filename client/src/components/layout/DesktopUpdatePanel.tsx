import { useState } from "react";
import { Download, RefreshCw, RotateCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  checkForDesktopUpdates,
  bundleDesktopLogs,
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
    return "尚未检查";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "最近检查";
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
      toast.error(action === "install" ? "未能重启安装，请稍后重试。" : "未能完成版本检查，请确认网络连接后重试。");
    } finally {
      setIsBusy(false);
    }
  };

  const exportLogs = async () => {
    try {
      const filePath = await bundleDesktopLogs();
      if (filePath) toast.success("日志包已保存，可以发送给开发者。");
    } catch {
      toast.error("日志包保存失败，请稍后重试。");
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
          <div className="text-xs text-muted-foreground">本机版本</div>
          <div className="mt-1 font-semibold">{formatDesktopVersion(updater.currentVersion)}</div>
        </div>
        <div className="rounded-xl border bg-muted/25 p-3">
          <div className="text-xs text-muted-foreground">更新状态</div>
          <div className="mt-1 font-semibold">{getDesktopUpdaterStatusLabel(updater.status)}</div>
        </div>
        <div className="rounded-xl border bg-muted/25 p-3">
          <div className="text-xs text-muted-foreground">可用版本</div>
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
              <span>下载进度</span>
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
        <div className="mt-3 text-xs text-muted-foreground">检查时间：{formatCheckedAt(updater.lastCheckedAt)}</div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" onClick={() => void exportLogs()}>
          下载近期日志包
        </Button>
        {showCheckButton ? (
          <Button
            type="button"
            variant={updater.status === "error" ? "default" : "outline"}
            disabled={isBusy || updater.status === "checking" || !updater.isSupported}
            onClick={() => void runAction("check")}
          >
            <RefreshCw className={cn("h-4 w-4", updater.status === "checking" && "animate-spin")} aria-hidden="true" />
            {updater.status === "checking"
              ? "正在检查"
              : updater.status === "error" || updater.status === "not-available"
                ? "重新检查"
                : "检查更新"}
          </Button>
        ) : null}
        {showDownloadButton ? (
          <Button type="button" disabled={isBusy} onClick={() => void runAction("check")}>
            <Download className="h-4 w-4" aria-hidden="true" />
            下载更新
          </Button>
        ) : null}
        {showInstallButton ? (
          <Button type="button" disabled={isBusy || !updater.canInstall} onClick={() => void runAction("install")}>
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            保存工作并重启安装
          </Button>
        ) : null}
      </div>
    </div>
  );
}
