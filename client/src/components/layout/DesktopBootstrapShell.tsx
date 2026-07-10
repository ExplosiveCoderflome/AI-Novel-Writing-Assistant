import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useEffect, useRef, useState } from "react";
import { Download, RefreshCw, RotateCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  checkForDesktopUpdates,
  copyDesktopLogPath,
  openDesktopLogsDirectory,
  restartDesktopApp,
  quitAndInstallDesktopUpdate,
  type DesktopBootstrapSnapshot,
  type DesktopUpdaterSnapshot,
  useDesktopUpdater,
} from "@/lib/desktop";
import { cn } from "@/lib/utils";
import DesktopBrandMark from "./DesktopBrandMark";

interface DesktopBootstrapShellProps {
  snapshot: DesktopBootstrapSnapshot;
  overlay?: boolean;
}

function resolveStateLabel(snapshot: DesktopBootstrapSnapshot): string {
  switch (snapshot.state) {
    case "launching":
      return t("gen.components.layout.DesktopBootstrapShell.gen_f76540a9");
    case "starting-server":
      return t("gen.components.layout.DesktopBootstrapShell.gen_0aeaea86");
    case "loading-ui":
      return t("gen.components.layout.DesktopBootstrapShell.gen_3a961806");
    case "ready":
      return t("gen.components.layout.DesktopBootstrapShell.gen_c30ecc7a");
    case "error":
      return t("gen.components.layout.DesktopBootstrapShell.gen_ddea5406");
    default:
      return snapshot.state;
  }
}

function resolveStageLabel(snapshot: DesktopBootstrapSnapshot): string {
  switch (snapshot.stage) {
    case "launching":
      return t("gen.components.layout.DesktopBootstrapShell.gen_86e1e425");
    case "app-ready":
      return t("gen.components.layout.DesktopBootstrapShell.gen_fd76a07b");
    case "splash-shown":
      return t("gen.components.layout.DesktopBootstrapShell.gen_cb016cfd");
    case "server-starting":
      return t("gen.components.layout.DesktopBootstrapShell.gen_9e1f9b87");
    case "server-healthy":
      return t("gen.components.layout.DesktopBootstrapShell.gen_9abfe65c");
    case "renderer-ready":
      return t("gen.components.layout.DesktopBootstrapShell.gen_ba8db5ff");
    case "main-window-shown":
      return t("gen.components.layout.DesktopBootstrapShell.mainWindowShown");
    case "error":
      return t("gen.components.layout.DesktopBootstrapShell.gen_efb08e91");
    default:
      return snapshot.stage;
  }
}

function resolveProgressHint(snapshot: DesktopBootstrapSnapshot): string {
  switch (snapshot.state) {
    case "launching":
      return t("gen.components.layout.DesktopBootstrapShell.gen_7232fb05");
    case "starting-server":
      return t("gen.components.layout.DesktopBootstrapShell.gen_7089b3c7");
    case "loading-ui":
      return t("gen.components.layout.DesktopBootstrapShell.gen_1ee6b8c8");
    case "ready":
      return t("gen.components.layout.DesktopBootstrapShell.gen_ec85a3d4");
    case "error":
      return t("gen.components.layout.DesktopBootstrapShell.gen_87c2722f");
    default:
      return snapshot.detail;
  }
}

function resolveUpdaterStatusLabel(status: DesktopUpdaterSnapshot["status"]): string {
  switch (status) {
    case "disabled":
      return t("gen.components.layout.DesktopBootstrapShell.unavailable");
    case "idle":
      return t("gen.components.layout.DesktopBootstrapShell.gen_e556fdff");
    case "checking":
      return t("gen.components.layout.DesktopBootstrapShell.gen_69ac5a39");
    case "update-available":
      return t("gen.components.layout.DesktopBootstrapShell.gen_5351384d");
    case "downloading":
      return t("gen.components.layout.DesktopBootstrapShell.downloading");
    case "downloaded":
      return t("gen.components.layout.DesktopBootstrapShell.gen_72482be2");
    case "not-available":
      return t("gen.components.layout.DesktopBootstrapShell.gen_6b498bfe");
    case "error":
      return t("gen.components.layout.DesktopBootstrapShell.gen_74bb5c74");
    default:
      return status;
  }
}

function resolveUpdaterHint(updater: DesktopUpdaterSnapshot, bootstrapState: DesktopBootstrapSnapshot["state"]): string {
  if (!updater.isSupported) {
    if (updater.isPortable) {
      return t("gen.components.layout.DesktopBootstrapShell.portableVersionRequiresDownloadNewInstallPackageManualReplacement");
    }

    if (!updater.isPackaged) {
      return t("gen.components.layout.DesktopBootstrapShell.gen_d025a051");
    }

    return updater.message;
  }

  switch (updater.status) {
    case "idle":
      return bootstrapState === "error"
        ? t("gen.components.layout.DesktopBootstrapShell.gen_f34eb924")
        : t("gen.components.layout.DesktopBootstrapShell.gen_250275f3");
    case "checking":
      return t("gen.components.layout.DesktopBootstrapShell.gen_1f92214e");
    case "update-available":
      return `桌面版 ${updater.availableVersion ?? t("gen.components.layout.DesktopBootstrapShell.gen_b6c4f3de")} 可用，建议先下载更新包。`;
    case "downloading":
      return t("gen.components.layout.DesktopBootstrapShell.gen_4afc4dfb");
    case "downloaded":
      return t("gen.components.layout.DesktopBootstrapShell.gen_faf996b1");
    case "not-available":
      return t("gen.components.layout.DesktopBootstrapShell.gen_1f0f97e4");
    case "error":
      return updater.message || t("gen.components.layout.DesktopBootstrapShell.gen_1979e92d");
    default:
      return updater.message;
  }
}

function formatSnapshotTime(value: string): string {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("zh-CN", {
    hour12: false,
  });
}

function DesktopBootstrapUpdatePanel({ snapshot }: { snapshot: DesktopBootstrapSnapshot }) {
  const updater = useDesktopUpdater();
  const didRequestStartupCheckRef = useRef(false);
  const [isBusy, setIsBusy] = useState(false);
  const isPromptingUpdate = updater.status === "update-available" || updater.status === "downloaded";
  const isCheckingOrDownloading = updater.status === "checking" || updater.status === "downloading";
  const showDownloadButton = updater.status === "update-available";
  const showInstallButton = updater.status === "downloaded";
  const showCheckButton = updater.isSupported && !showDownloadButton && !showInstallButton && updater.status !== "downloading";

  useEffect(() => {
    if (didRequestStartupCheckRef.current || !updater.isSupported) {
      return;
    }

    if (updater.lastCheckedAt || updater.status !== "idle") {
      return;
    }

    if (snapshot.state !== "launching" && snapshot.state !== "starting-server" && snapshot.state !== "error") {
      return;
    }

    didRequestStartupCheckRef.current = true;
    void checkForDesktopUpdates().catch(() => {
      didRequestStartupCheckRef.current = false;
    });
  }, [snapshot.state, updater.isSupported, updater.lastCheckedAt, updater.status]);

  const runUpdaterAction = async (action: "check" | "install") => {
    setIsBusy(true);
    try {
      if (action === "install") {
        await quitAndInstallDesktopUpdate();
      } else {
        await checkForDesktopUpdates();
      }
    } catch (error) {
      console.error("[desktop] updater action failed.", error);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-3xl border p-5",
        isPromptingUpdate
          ? "border-amber-300/70 bg-amber-300/10"
          : "border-slate-800 bg-slate-900/70",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">{t("gen.components.layout.DesktopBootstrapShell.gen_beed7a8c")}</div>
        <Badge
          variant="outline"
          className={cn(
            "border-slate-600 bg-slate-950/60 text-slate-100",
            isPromptingUpdate ? "border-amber-300/80 bg-amber-300/15 text-amber-100" : null,
          )}
        >
          {resolveUpdaterStatusLabel(updater.status)}
        </Badge>
      </div>

      <div className="mt-3 grid gap-2 text-sm text-slate-300">
        <div className="flex items-center justify-between gap-3">
          <span>{t("gen.components.layout.DesktopBootstrapShell.gen_bfedfa19")}</span>
          <span className="font-medium text-slate-100">{updater.currentVersion}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>{t("gen.components.layout.DesktopBootstrapShell.gen_29afa32e")}</span>
          <span className="font-medium text-slate-100">{updater.availableVersion ?? "-"}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-slate-400">
          <span>{t("gen.components.layout.DesktopBootstrapShell.gen_e2aaac6d")}</span>
          <span className="font-medium text-slate-200">{formatSnapshotTime(updater.lastCheckedAt ?? "")}</span>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-300">
        {resolveUpdaterHint(updater, snapshot.state)}
        {typeof updater.progressPercent === "number" ? ` 下载进度 ${Math.round(updater.progressPercent)}%。` : ""}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {showCheckButton ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700 hover:text-white"
            disabled={isBusy || updater.status === "checking"}
            onClick={() => void runUpdaterAction("check")}
          >
            <RefreshCw className={cn("h-4 w-4", updater.status === "checking" ? "animate-spin" : null)} aria-hidden="true" />
            {updater.status === "checking" ? t("gen.components.layout.DesktopBootstrapShell.gen_69ac5a39") : updater.status === "error" || updater.status === "not-available" ? t("gen.components.layout.DesktopBootstrapShell.gen_a1ad5204") : t("gen.components.layout.DesktopBootstrapShell.gen_4ff13370")}
          </Button>
        ) : null}
        {showDownloadButton ? (
          <Button
            type="button"
            size="sm"
            className="bg-amber-300 text-slate-950 hover:bg-amber-200"
            disabled={isBusy || isCheckingOrDownloading}
            onClick={() => void runUpdaterAction("check")}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            下载更新
          </Button>
        ) : null}
        {showInstallButton ? (
          <Button
            type="button"
            size="sm"
            className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"
            disabled={isBusy || !updater.canInstall}
            onClick={() => void runUpdaterAction("install")}
          >
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            重启安装
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export default function DesktopBootstrapShell({ snapshot, overlay = false }: DesktopBootstrapShellProps) {
  const surfaceClassName = overlay
    ? "bg-background/88 backdrop-blur-xl"
    : "bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.16),transparent_38%),linear-gradient(145deg,#08101f_0%,#122033_55%,#101d2e_100%)]";

  return (
    <div className={cn("fixed inset-0 z-[90] flex items-center justify-center px-6 py-8", surfaceClassName)}>
      <div className="w-full max-w-3xl overflow-hidden rounded-[30px] border border-slate-700/50 bg-slate-950/82 text-slate-50 shadow-[0_24px_90px_rgba(2,6,23,0.5)]">
        <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="space-y-6 border-b border-slate-800/80 px-8 py-8 lg:border-b-0 lg:border-r">
            <div className="flex items-center gap-4">
              <DesktopBrandMark className="h-20 w-20" />
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/20">
                    桌面版 Beta
                  </Badge>
                  <Badge variant="outline" className="border-slate-600 bg-slate-900/70 text-slate-100">
                    {resolveStageLabel(snapshot)}
                  </Badge>
                </div>
                <h1 className="text-3xl font-semibold tracking-tight">{t("gen.components.layout.DesktopBootstrapShell.aiNovelStudioBoard")}</h1>
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl font-semibold tracking-tight">{snapshot.title}</h2>
              <p className="max-w-xl text-sm leading-7 text-slate-300">{snapshot.detail}</p>
            </div>

            <div className="space-y-3">
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                {snapshot.state === "error" ? (
                  <span className="block h-full w-full rounded-full bg-rose-400" />
                ) : (
                  <span className="block h-full w-1/2 animate-[desktop-shell-progress_1.4s_ease-in-out_infinite] rounded-full bg-[linear-gradient(90deg,#76e5ff_0%,#f6b24c_100%)]" />
                )}
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-4 text-sm leading-6 text-slate-300">
                这个页面只会在桌面版启动时短暂出现，用来承接本地服务启动，避免先看到白屏或空白窗口。
              </div>
            </div>
          </section>

          <section className="space-y-5 px-8 py-8">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">{t("gen.components.layout.DesktopBootstrapShell.gen_75ea7b29")}</div>
              <div className="mt-3 space-y-3 text-sm text-slate-200">
                <div className="flex items-center justify-between gap-3">
                  <span>{t("gen.components.layout.DesktopBootstrapShell.gen_3fea7ca7")}</span>
                  <span className="font-medium">{resolveStateLabel(snapshot)}</span>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-slate-300">
                  {resolveProgressHint(snapshot)}
                </div>
                <div className="flex items-center justify-between gap-3 text-slate-400">
                  <span>{t("gen.components.layout.DesktopBootstrapShell.gen_06dc9b38")}</span>
                  <span className="font-medium text-slate-200">{formatSnapshotTime(snapshot.updatedAt)}</span>
                </div>
              </div>
            </div>

            <DesktopBootstrapUpdatePanel snapshot={snapshot} />

            <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">{t("gen.components.layout.DesktopBootstrapShell.gen_3c3bac28")}</div>
              <div className="mt-3 text-sm leading-6 text-slate-300">
                如果启动卡住、本地服务提前退出，或者你要定位启动耗时，可以直接查看桌面端日志。
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  variant="secondary"
                  className="bg-slate-50 text-slate-950 hover:bg-white"
                  onClick={() => void openDesktopLogsDirectory()}
                >
                  打开日志目录
                </Button>
                <Button
                  variant="outline"
                  className="border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700 hover:text-white"
                  onClick={() => void copyDesktopLogPath()}
                >
                  复制日志路径
                </Button>
                {snapshot.state === "error" && snapshot.canRetry ? (
                  <Button
                    className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"
                    onClick={() => void restartDesktopApp()}
                  >
                    重新启动
                  </Button>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
