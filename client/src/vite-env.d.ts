/// <reference types="vite/client" />
/// <reference types="vite-plugin-pages/client-react" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_TIMEOUT_MS?: string;
  readonly VITE_WORLD_WIZARD_ENABLED?: string;
  readonly VITE_WORLD_VIS_ENABLED?: string;
}

interface Window {
  __AI_NOVEL_RUNTIME__?: {
    mode?: "web" | "desktop";
    apiBaseUrl?: string;
    apiTimeoutMs?: number | string;
    isPackaged?: boolean;
    appVersion?: string;
    isPortable?: boolean;
    updateChannel?: string;
  };
  __AI_NOVEL_DESKTOP__?: {
    getBootstrapSnapshot?: () => Promise<{
      state: "launching" | "starting-server" | "loading-ui" | "ready" | "error";
      stage: string;
      title: string;
      detail: string;
      logDir: string;
      logFile: string;
      updatedAt: string;
      canRetry: boolean;
    }>;
    getDataImportSnapshot?: () => Promise<{
      currentDatabasePath: string;
      currentDatabaseLikelyFresh: boolean;
      suggestedSourcePath: string | null;
      suggestedSourceLabel: string | null;
      backupDirectory: string;
    }>;
    subscribeBootstrapState?: (
      listener: (snapshot: {
        state: "launching" | "starting-server" | "loading-ui" | "ready" | "error";
        stage: string;
        title: string;
        detail: string;
        logDir: string;
        logFile: string;
        updatedAt: string;
        canRetry: boolean;
      }) => void,
    ) => (() => void) | void;
    notifyRendererReady?: () => void;
    notifyAppShellReady?: () => void;
    getUpdaterSnapshot?: () => Promise<{
      status: "disabled" | "idle" | "checking" | "update-available" | "downloading" | "downloaded" | "not-available" | "error";
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
    }>;
    subscribeUpdaterStatus?: (
      listener: (snapshot: {
        status: "disabled" | "idle" | "checking" | "update-available" | "downloading" | "downloaded" | "not-available" | "error";
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
      }) => void,
    ) => (() => void) | void;
    checkForUpdates?: () => Promise<unknown>;
    quitAndInstall?: () => Promise<unknown>;
    openLogsDirectory?: () => Promise<unknown>;
    copyLogPath?: () => Promise<string | undefined>;
    restartApp?: () => Promise<unknown>;
    importLegacyDatabase?: (options?: { preferSuggested?: boolean }) => Promise<{
      scheduled: boolean;
      cancelled: boolean;
      sourcePath?: string;
    } | null>;
  };
}
