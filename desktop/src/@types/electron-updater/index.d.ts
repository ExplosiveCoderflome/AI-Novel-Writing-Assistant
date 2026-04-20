declare module "electron-updater" {
  export interface UpdateInfo {
    version: string;
    releaseName?: string | null;
    releaseNotes?: string | null;
  }

  export interface ProgressInfo {
    bytesPerSecond: number;
    percent: number;
    total: number;
    transferred: number;
  }

  interface AppUpdater {
    autoDownload: boolean;
    autoInstallOnAppQuit: boolean;
    allowDowngrade: boolean;
    allowPrerelease: boolean;
    on(event: "checking-for-update", listener: () => void): this;
    on(event: "update-available", listener: (info: UpdateInfo) => void): this;
    on(event: "update-not-available", listener: () => void): this;
    on(event: "download-progress", listener: (progress: ProgressInfo) => void): this;
    on(event: "update-downloaded", listener: (info: UpdateInfo) => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    downloadUpdate(): Promise<string[]>;
    checkForUpdates(): Promise<unknown>;
    quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  }

  export const autoUpdater: AppUpdater;
}
