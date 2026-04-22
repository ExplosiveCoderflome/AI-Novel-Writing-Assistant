import { useEffect, useState } from "react";
import { APP_RUNTIME } from "./constants";

export type DesktopBootstrapState = "launching" | "starting-server" | "loading-ui" | "ready" | "error";
export type DesktopUpdaterStatus =
  | "disabled"
  | "idle"
  | "checking"
  | "update-available"
  | "downloading"
  | "downloaded"
  | "not-available"
  | "error";

export interface DesktopBootstrapSnapshot {
  state: DesktopBootstrapState;
  stage: string;
  title: string;
  detail: string;
  logDir: string;
  logFile: string;
  updatedAt: string;
  canRetry: boolean;
}

export interface DesktopUpdaterSnapshot {
  status: DesktopUpdaterStatus;
  message: string;
  currentVersion: string;
  availableVersion: string | null;
  progressPercent: number | null;
  bytesPerSecond: number | null;
  channel: string;
  isPortable: boolean;
  isPackaged: boolean;
  isSupported: boolean;
  canInstall: boolean;
  updatedAt: string;
  lastCheckedAt: string | null;
}

export interface DesktopDataImportSnapshot {
  currentDatabasePath: string;
  currentDatabaseLikelyFresh: boolean;
  suggestedSourcePath: string | null;
  suggestedSourceLabel: string | null;
  backupDirectory: string;
}

export interface DesktopDataImportResult {
  scheduled: boolean;
  cancelled: boolean;
  sourcePath?: string;
}

const DEFAULT_BOOTSTRAP_SNAPSHOT: DesktopBootstrapSnapshot = {
  state: "launching",
  stage: "launching",
  title: "正在启动桌面工作区",
  detail: "正在准备桌面本地运行时。",
  logDir: "",
  logFile: "",
  updatedAt: "",
  canRetry: false,
};

const DEFAULT_UPDATER_SNAPSHOT: DesktopUpdaterSnapshot = {
  status: "disabled",
  message: "Updates are not available in this runtime.",
  currentVersion: "0.0.0",
  availableVersion: null,
  progressPercent: null,
  bytesPerSecond: null,
  channel: "beta",
  isPortable: false,
  isPackaged: false,
  isSupported: false,
  canInstall: false,
  updatedAt: "",
  lastCheckedAt: null,
};

function getDesktopBridge() {
  if (typeof window === "undefined" || APP_RUNTIME !== "desktop") {
    return null;
  }

  return window.__AI_NOVEL_DESKTOP__ ?? null;
}

export function notifyDesktopRendererReady(): void {
  getDesktopBridge()?.notifyRendererReady?.();
}

export function notifyDesktopAppShellReady(): void {
  getDesktopBridge()?.notifyAppShellReady?.();
}

export async function checkForDesktopUpdates(): Promise<void> {
  await getDesktopBridge()?.checkForUpdates?.();
}

export async function quitAndInstallDesktopUpdate(): Promise<void> {
  await getDesktopBridge()?.quitAndInstall?.();
}

export async function openDesktopLogsDirectory(): Promise<void> {
  await getDesktopBridge()?.openLogsDirectory?.();
}

export async function copyDesktopLogPath(): Promise<string | undefined> {
  return getDesktopBridge()?.copyLogPath?.();
}

export async function restartDesktopApp(): Promise<void> {
  await getDesktopBridge()?.restartApp?.();
}

export async function getDesktopDataImportSnapshot(): Promise<DesktopDataImportSnapshot | null> {
  return getDesktopBridge()?.getDataImportSnapshot?.() ?? null;
}

export async function importDesktopLegacyDatabase(options?: { preferSuggested?: boolean }): Promise<DesktopDataImportResult | null> {
  return getDesktopBridge()?.importLegacyDatabase?.(options) ?? null;
}

export function useDesktopBootstrap(): DesktopBootstrapSnapshot {
  const [snapshot, setSnapshot] = useState<DesktopBootstrapSnapshot>(DEFAULT_BOOTSTRAP_SNAPSHOT);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge?.getBootstrapSnapshot) {
      return undefined;
    }

    let cancelled = false;

    void bridge.getBootstrapSnapshot().then((nextSnapshot) => {
      if (!cancelled && nextSnapshot) {
        setSnapshot(nextSnapshot);
      }
    });

    const unsubscribe = bridge.subscribeBootstrapState?.((nextSnapshot) => {
      if (!cancelled && nextSnapshot) {
        setSnapshot(nextSnapshot);
      }
    });

    return () => {
      cancelled = true;
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  return snapshot;
}

export function useDesktopUpdater(): DesktopUpdaterSnapshot {
  const [snapshot, setSnapshot] = useState<DesktopUpdaterSnapshot>(DEFAULT_UPDATER_SNAPSHOT);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge?.getUpdaterSnapshot) {
      return undefined;
    }

    let cancelled = false;

    void bridge.getUpdaterSnapshot().then((nextSnapshot) => {
      if (!cancelled && nextSnapshot) {
        setSnapshot(nextSnapshot);
      }
    });

    const unsubscribe = bridge.subscribeUpdaterStatus?.((nextSnapshot) => {
      if (!cancelled && nextSnapshot) {
        setSnapshot(nextSnapshot);
      }
    });

    return () => {
      cancelled = true;
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  return snapshot;
}
