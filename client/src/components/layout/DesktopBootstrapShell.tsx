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
  bundleDesktopLogs,
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
      return "准备中";
    case "starting-server":
      return "启动本地引擎";
    case "loading-ui":
      return "加载工作区";
    case "ready":
      return "已就绪";
    case "error":
      return "启动受阻";
    default:
      return snapshot.state;
  }
}

function resolveStageLabel(snapshot: DesktopBootstrapSnapshot): string {
  switch (snapshot.stage) {
    case "launching":
      return "准备启动";
    case "app-ready":
      return "应用已就绪";
    case "splash-shown":
      return "启动页已显示";
    case "server-starting":
      return "本地服务启动中";
    case "server-healthy":
      return "本地服务已就绪";
    case "renderer-ready":
      return "界面已准备";
    case "main-window-shown":
      return "主窗口已显示";
    case "error":
      return "启动失败";
    default:
      return snapshot.stage;
  }
}

function resolveProgressHint(snapshot: DesktopBootstrapSnapshot): string {
  switch (snapshot.state) {
    case "launching":
      return "正在准备桌面运行时和启动资源。";
    case "starting-server":
      return "桌面版需要先拉起本地服务，随后才会进入主工作区。";
    case "loading-ui":
      return "本地服务已经可用，正在切入主工作台。";
    case "ready":
      return "启动链路已经完成。";
    case "error":
      return "启动过程中遇到问题，建议先查看日志再重试。";
    default:
      return snapshot.detail;
  }
}

function resolveUpdaterStatusLabel(status: DesktopUpdaterSnapshot["status"]): string {
  switch (status) {
    case "disabled":
      return "不可用";
    case "idle":
      return "待检查";
    case "checking":
      return "检查中";
    case "update-available":
      return "发现更新";
    case "downloading":
      return "下载中";
    case "downloaded":
      return "待安装";
    case "not-available":
      return "无需更新";
    case "error":
      return "检查失败";
    default:
      return status;
  }
}

function resolveUpdaterHint(updater: DesktopUpdaterSnapshot, bootstrapState: DesktopBootstrapSnapshot["state"]): string {
  if (!updater.isSupported) {
    if (updater.isPortable) {
      return "便携版需要下载新版安装包后手动替换。";
    }

    if (!updater.isPackaged) {
      return "开发运行不会连接发布更新通道，打包安装版会自动检查桌面版本。";
    }

    return updater.message;
  }

  switch (updater.status) {
    case "idle":
      return bootstrapState === "error"
        ? "启动受阻时会同步检查桌面版本，方便先安装可用修复。"
        : "进入工作区前会检查桌面版本，有可用版本时会在这里提示。";
    case "checking":
      return "版本检查中，有可用版本时会提示下载。";
    case "update-available":
      return `桌面版 ${updater.availableVersion ?? "新版本"} 可用，建议先下载更新包。`;
    case "downloading":
      return "更新包下载中，请保持应用打开。";
    case "downloaded":
      return "更新包已下载，重启应用后完成安装。";
    case "not-available":
      return "本机安装版本与发布通道保持同步。";
    case "error":
      return updater.message || "版本检查失败，可以稍后重试。";
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
          ? "border-warning/45 bg-warning/10"
          : "border-border/60 bg-background/55",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">版本检查</div>
        <Badge
          variant="outline"
          className={cn(
            "border-border bg-muted/60 text-foreground",
            isPromptingUpdate ? "border-warning/50 bg-warning/10 text-warning" : null,
          )}
        >
          {resolveUpdaterStatusLabel(updater.status)}
        </Badge>
      </div>

      <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
        <div className="flex items-center justify-between gap-3">
          <span>本机版本</span>
          <span className="font-medium text-foreground">{updater.currentVersion}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>可用版本</span>
          <span className="font-medium text-foreground">{updater.availableVersion ?? "-"}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-muted-foreground">
          <span>检查时间</span>
          <span className="font-medium text-foreground">{formatSnapshotTime(updater.lastCheckedAt ?? "")}</span>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-border/60 bg-muted/35 px-4 py-3 text-sm leading-6 text-muted-foreground">
        {resolveUpdaterHint(updater, snapshot.state)}
        {typeof updater.progressPercent === "number" ? ` 下载进度 ${Math.round(updater.progressPercent)}%。` : ""}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {showCheckButton ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-border bg-background text-foreground hover:bg-muted"
            disabled={isBusy || updater.status === "checking"}
            onClick={() => void runUpdaterAction("check")}
          >
            <RefreshCw className={cn("h-4 w-4", updater.status === "checking" ? "animate-spin" : null)} aria-hidden="true" />
            {updater.status === "checking" ? "检查中" : updater.status === "error" || updater.status === "not-available" ? "重新检查" : "检查更新"}
          </Button>
        ) : null}
        {showDownloadButton ? (
          <Button
            type="button"
            size="sm"
            className="bg-warning text-warning-foreground hover:bg-warning/90"
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
            className="bg-primary text-primary-foreground hover:bg-primary/90"
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
    : "bg-[radial-gradient(circle_at_18%_18%,hsl(var(--info)/0.22),transparent_34%),radial-gradient(circle_at_88%_82%,hsl(var(--primary)/0.18),transparent_38%),hsl(var(--background))]";

  return (
    <div className={cn("fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto px-5 py-6 sm:px-8", surfaceClassName)}>
      <div className="relative w-full max-w-5xl overflow-hidden rounded-[32px] border border-border/70 bg-card/88 text-card-foreground shadow-[0_32px_120px_-48px_hsl(var(--foreground)/0.55)] backdrop-blur-2xl">
        <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-info/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative grid gap-0 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
          <section className="flex min-h-[420px] flex-col justify-between border-b border-border/60 px-7 py-8 sm:px-10 sm:py-10 lg:border-b-0 lg:border-r">
            <div>
              <div className="flex items-start justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="rounded-[24px] bg-primary/10 p-2 ring-1 ring-primary/20"><DesktopBrandMark className="h-16 w-16" /></div>
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.24em] text-info">AI NOVEL STUDIO</div>
                    <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">AI 小说创作工作台</h1>
                  </div>
                </div>
                <Badge variant="outline" className="hidden border-info/30 bg-info/10 text-info sm:inline-flex">桌面版 · {resolveStageLabel(snapshot)}</Badge>
              </div>

              <div className="mt-20 max-w-xl">
                <div className="flex items-center gap-2 text-sm font-medium text-info"><span className="h-2 w-2 animate-pulse rounded-full bg-info" />{resolveStateLabel(snapshot)}</div>
                <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.04em] sm:text-5xl">{snapshot.title}</h2>
                <p className="mt-5 max-w-lg text-sm leading-7 text-muted-foreground">{snapshot.detail}</p>
              </div>
            </div>

            <div className="mt-12 space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground"><span>正在连接你的创作空间</span><span>{resolveStageLabel(snapshot)}</span></div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                {snapshot.state === "error" ? <span className="block h-full w-full rounded-full bg-destructive" /> : <span className="block h-full w-1/2 animate-[desktop-shell-progress_1.4s_ease-in-out_infinite] rounded-full bg-[linear-gradient(90deg,hsl(var(--info)),hsl(var(--primary)))]" />}
              </div>
              <p className="text-xs leading-5 text-muted-foreground">启动页只在准备本地服务时短暂出现，工作区就绪后会自动进入。</p>
            </div>
          </section>

          <section className="space-y-4 bg-muted/20 px-7 py-8 sm:px-8 sm:py-10">
            <div className="rounded-2xl border border-border/60 bg-background/55 p-5">
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">启动状态</div>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">当前阶段</span><span className="font-medium">{resolveStateLabel(snapshot)}</span></div>
                <div className="rounded-xl border border-border/60 bg-muted/35 px-3.5 py-3 text-sm leading-6 text-muted-foreground">{resolveProgressHint(snapshot)}</div>
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>最近更新</span><span>{formatSnapshotTime(snapshot.updatedAt)}</span></div>
              </div>
            </div>

            <DesktopBootstrapUpdatePanel snapshot={snapshot} />

            <details className="group rounded-2xl border border-border/60 bg-background/45 p-5">
              <summary className="cursor-pointer list-none text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">日志与排查 <span className="float-right transition-transform group-open:rotate-180">⌄</span></summary>
              <div className="mt-4 text-sm leading-6 text-muted-foreground">如果启动卡住或本地服务提前退出，可以打开日志目录定位问题。</div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => void bundleDesktopLogs()}>下载近期日志包</Button>
                <Button variant="outline" size="sm" onClick={() => void openDesktopLogsDirectory()}>打开日志目录</Button>
                <Button variant="outline" size="sm" onClick={() => void copyDesktopLogPath()}>复制日志路径</Button>
                {snapshot.state === "error" && snapshot.canRetry ? <Button size="sm" onClick={() => void restartDesktopApp()}>重新启动</Button> : null}
              </div>
            </details>
          </section>
        </div>
      </div>
    </div>
  );
}
