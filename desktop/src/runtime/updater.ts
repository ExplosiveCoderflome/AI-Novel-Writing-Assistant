import fs from "node:fs";
import path from "node:path";
import { autoUpdater } from "electron-updater";
import { appendDesktopLog, logDesktopError } from "./logging";
import { createUpdaterSnapshot, desktopUpdaterStore } from "./state";

export interface DesktopUpdaterController {
  checkForUpdates: () => Promise<void>;
  quitAndInstall: () => void;
  scheduleInitialCheck: (delayMs?: number) => void;
}

interface DesktopUpdaterOptions {
  currentVersion: string;
  updateChannel: string;
  isPackaged: boolean;
  isPortable: boolean;
}

function markUpdaterSnapshot(snapshot: ReturnType<typeof createUpdaterSnapshot>): void {
  desktopUpdaterStore.setSnapshot(snapshot);
}

function isUpdaterSupported(options: DesktopUpdaterOptions): boolean {
  if (!options.isPackaged) {
    return false;
  }

  if (options.isPortable) {
    return false;
  }

  return process.env.AI_NOVEL_DESKTOP_DISABLE_UPDATER?.trim() !== "true";
}

function hasPackagedUpdateFeedConfig(): boolean {
  return fs.existsSync(path.join(process.resourcesPath, "app-update.yml"));
}

export function initializeDesktopUpdater(options: DesktopUpdaterOptions): DesktopUpdaterController {
  const supported = isUpdaterSupported(options);
  const hasFeedConfig = !supported || hasPackagedUpdateFeedConfig();
  const unsupportedReason = !options.isPackaged
    ? "Updates are only available from the packaged Windows build."
    : options.isPortable
      ? "Portable builds stay on manual updates and are excluded from auto-update."
      : !hasFeedConfig
        ? "This build does not include an update feed yet. Publish it through the beta release pipeline first."
        : "Updates are disabled by environment configuration.";

  markUpdaterSnapshot(createUpdaterSnapshot({
    status: supported && hasFeedConfig ? "idle" : "disabled",
    message: supported
      ? hasFeedConfig
        ? "Installed build is ready for background update checks."
        : unsupportedReason
      : unsupportedReason,
    currentVersion: options.currentVersion,
    availableVersion: null,
    progressPercent: null,
    bytesPerSecond: null,
    channel: options.updateChannel,
    isPortable: options.isPortable,
    isPackaged: options.isPackaged,
    isSupported: supported && hasFeedConfig,
    canInstall: false,
    lastCheckedAt: null,
  }));

  if (!supported || !hasFeedConfig) {
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

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = options.updateChannel === "beta";

  autoUpdater.on("checking-for-update", () => {
    appendDesktopLog("desktop.updater", "Checking GitHub Releases for desktop updates.");
    markUpdaterSnapshot(createUpdaterSnapshot({
      ...desktopUpdaterStore.getSnapshot(),
      status: "checking",
      message: "Checking GitHub Releases for a newer desktop build.",
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
      message: `Version ${info.version} is available. Confirm download when you are ready.`,
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
      message: "You are already on the newest available desktop build for this channel.",
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
      message: `Downloading update${desktopUpdaterStore.getSnapshot().availableVersion ? ` ${desktopUpdaterStore.getSnapshot().availableVersion}` : ""}.`,
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
      message: `Version ${info.version} has downloaded. Restart the app to install it.`,
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
      message: error instanceof Error ? error.message : String(error),
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
          message: `Downloading update ${snapshot.availableVersion ?? ""}`.trim(),
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
