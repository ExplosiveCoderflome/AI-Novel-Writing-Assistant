import { contextBridge, ipcRenderer } from "electron";

const BOOTSTRAP_CHANNEL = "desktop:bootstrap-state-changed";
const UPDATER_CHANNEL = "desktop:updater-state-changed";

function readRuntimeConfig(): unknown {
  const rawConfig = process.env.AI_NOVEL_DESKTOP_RUNTIME?.trim();
  if (!rawConfig) {
    return {};
  }

  try {
    return JSON.parse(rawConfig) as unknown;
  } catch {
    return {};
  }
}

contextBridge.exposeInMainWorld("__AI_NOVEL_RUNTIME__", readRuntimeConfig());
contextBridge.exposeInMainWorld("__AI_NOVEL_DESKTOP__", {
  getBootstrapSnapshot: () => ipcRenderer.invoke("desktop:get-bootstrap-snapshot"),
  getDataImportSnapshot: () => ipcRenderer.invoke("desktop:get-data-import-snapshot"),
  subscribeBootstrapState: (listener: (snapshot: unknown) => void) => {
    const wrappedListener = (_event: unknown, snapshot: unknown) => {
      listener(snapshot);
    };
    ipcRenderer.on(BOOTSTRAP_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(BOOTSTRAP_CHANNEL, wrappedListener);
    };
  },
  notifyRendererReady: () => {
    ipcRenderer.send("desktop:renderer-ready");
  },
  notifyAppShellReady: () => {
    ipcRenderer.send("desktop:app-shell-ready");
  },
  getUpdaterSnapshot: () => ipcRenderer.invoke("desktop:get-updater-snapshot"),
  subscribeUpdaterStatus: (listener: (snapshot: unknown) => void) => {
    const wrappedListener = (_event: unknown, snapshot: unknown) => {
      listener(snapshot);
    };
    ipcRenderer.on(UPDATER_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(UPDATER_CHANNEL, wrappedListener);
    };
  },
  checkForUpdates: () => ipcRenderer.invoke("desktop:check-for-updates"),
  quitAndInstall: () => ipcRenderer.invoke("desktop:quit-and-install"),
  openLogsDirectory: () => ipcRenderer.invoke("desktop:open-logs-directory"),
  copyLogPath: () => ipcRenderer.invoke("desktop:copy-log-path"),
  restartApp: () => ipcRenderer.invoke("desktop:restart-app"),
  importLegacyDatabase: (options?: { preferSuggested?: boolean }) =>
    ipcRenderer.invoke("desktop:import-legacy-database", options),
});
