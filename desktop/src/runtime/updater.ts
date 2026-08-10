import fs from "node:fs";
import path from "node:path";
import { autoUpdater } from "electron-updater";
import { appendDesktopLog, logDesktopError } from "./logging";
import type { DesktopReleaseMetadata } from "./releaseMetadata";
import { createUpdaterSnapshot, desktopUpdaterStore } from "./state";
import { applyDesktopAutoUpdaterPolicy, resolveDesktopUpdaterSupport } from "./updaterPolicy";

export interface DesktopUpdaterController {
  checkForUpdates: () => Promise<void>;
  quitAndInstall: () => void;
  scheduleInitialCheck: (delayMs?: number) => void;
}

interface DesktopUpdaterOptions {
  currentVersion: string;
  releaseMetadata: DesktopReleaseMetadata;
  isPackaged: boolean;
  isPortable: boolean;
}

function markUpdaterSnapshot(snapshot: ReturnType<typeof createUpdaterSnapshot>): void {
  desktopUpdaterStore.setSnapshot(snapshot);
}

function hasPackagedUpdateFeedConfig(): boolean {
  return fs.existsSync(path.join(process.resourcesPath, "app-update.yml"));
}

export function initializeDesktopUpdater(options: DesktopUpdaterOptions): DesktopUpdaterController {
  const hasFeedConfig = hasPackagedUpdateFeedConfig();
  const support = resolveDesktopUpdaterSupport({
    releaseMetadata: options.releaseMetadata,
    isPackaged: options.isPackaged,
    isPortable: options.isPortable,
    hasFeedConfig,
    disabledByEnvironment: process.env.AI_NOVEL_DESKTOP_DISABLE_UPDATER?.trim() === "true",
  });

  markUpdaterSnapshot(createUpdaterSnapshot({
    status: support.supported ? "idle" : "disabled",
    message: support.message,
    currentVersion: options.currentVersion,
    availableVersion: null,
    progressPercent: null,
    bytesPerSecond: null,
    channel: options.releaseMetadata.updateChannel,
    isPortable: options.isPortable,
    isPackaged: options.isPackaged,
    isSupported: support.supported,
    canInstall: false,
    lastCheckedAt: null,
  }));

  if (!support.supported) {
    return {
      async checkForUpdates() {
        return undefined;
      },
      quitAndInstall() {
        return undefined;
      },
      scheduleInitialCheck() {
        return undefined;
      },
    };
  }

  applyDesktopAutoUpdaterPolicy(autoUpdater, options.releaseMetadata);

  autoUpdater.on("checking-for-update", () => {
    appendDesktopLog("desktop.updater", "Checking GitHub Releases for desktop updates.");
    markUpdaterSnapshot(createUpdaterSnapshot({
      ...desktopUpdaterStore.getSnapshot(),
      status: "checking",
      message: "正在检查桌面版更新。",
      canInstall: false,
      lastCheckedAt: new Date().toISOString(),
      progressPercent: null,
      bytesPerSecond: null,
    }));
  });

  autoUpdater.on("update-available", (info) => {
    appendDesktopLog("desktop.updater", `Update ${info.version} is available and waiting for download approval.`);
    markUpdaterSnapshot(createUpdaterSnapshot({
      ...desktopUpdaterStore.getSnapshot(),
      status: "update-available",
      message: `桌面版 v${info.version} 可用，由你确认后开始下载。`,
      availableVersion: info.version,
      canInstall: false,
      progressPercent: null,
      bytesPerSecond: null,
      lastCheckedAt: new Date().toISOString(),
    }));
  });

  autoUpdater.on("update-not-available", () => {
    appendDesktopLog("desktop.updater", "No newer desktop build is available.");
    markUpdaterSnapshot(createUpdaterSnapshot({
      ...desktopUpdaterStore.getSnapshot(),
      status: "not-available",
      message: "当前安装包符合此更新通道的最新版本。",
      availableVersion: null,
      canInstall: false,
      progressPercent: null,
      bytesPerSecond: null,
      lastCheckedAt: new Date().toISOString(),
    }));
  });

  autoUpdater.on("download-progress", (progress) => {
    markUpdaterSnapshot(createUpdaterSnapshot({
      ...desktopUpdaterStore.getSnapshot(),
      status: "downloading",
      message: "正在下载桌面版更新。",
      progressPercent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      canInstall: false,
    }));
  });

  autoUpdater.on("update-downloaded", (info) => {
    appendDesktopLog("desktop.updater", `Update ${info.version} finished downloading and is ready to install.`);
    markUpdaterSnapshot(createUpdaterSnapshot({
      ...desktopUpdaterStore.getSnapshot(),
      status: "downloaded",
      message: `桌面版 v${info.version} 准备完成，重启应用后安装。`,
      availableVersion: info.version,
      canInstall: true,
      progressPercent: 100,
      bytesPerSecond: null,
      lastCheckedAt: new Date().toISOString(),
    }));
  });

  autoUpdater.on("error", (error) => {
    logDesktopError("desktop.updater", error);
    markUpdaterSnapshot(createUpdaterSnapshot({
      ...desktopUpdaterStore.getSnapshot(),
      status: "error",
      message: "未能完成版本检查，请确认网络连接后重试。",
      canInstall: false,
      progressPercent: null,
      bytesPerSecond: null,
      lastCheckedAt: new Date().toISOString(),
    }));
  });

  const checkForUpdates = async (): Promise<void> => {
    try {
      const snapshot = desktopUpdaterStore.getSnapshot();
      if (snapshot.status === "checking" || snapshot.status === "downloading" || snapshot.status === "downloaded") {
        return;
      }

      if (snapshot.status === "update-available") {
        appendDesktopLog("desktop.updater", `Downloading approved update ${snapshot.availableVersion ?? "unknown"}.`);
        markUpdaterSnapshot(createUpdaterSnapshot({
          ...snapshot,
          status: "downloading",
          message: "正在下载桌面版更新。",
          canInstall: false,
          progressPercent: 0,
          bytesPerSecond: null,
          lastCheckedAt: new Date().toISOString(),
        }));
        await autoUpdater.downloadUpdate();
        return;
      }

      await autoUpdater.checkForUpdates();
    } catch (error) {
      logDesktopError("desktop.updater", error);
      throw error;
    }
  };

  const scheduleInitialCheck = (delayMs = 1_000): void => {
    const timer = setTimeout(() => {
      void checkForUpdates().catch((error) => {
        logDesktopError("desktop.updater.schedule", error);
      });
    }, delayMs);
    timer.unref();
  };

  return {
    checkForUpdates,
    quitAndInstall() {
      appendDesktopLog("desktop.updater", "Restarting app to apply downloaded update.");
      autoUpdater.quitAndInstall(false, true);
    },
    scheduleInitialCheck,
  };
}
