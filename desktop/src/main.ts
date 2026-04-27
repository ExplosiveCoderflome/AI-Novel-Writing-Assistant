import path from "node:path";
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from "electron";
import {
  createDatabaseImportRelaunchArgs,
  createSanitizedRelaunchArgs,
  extractPendingDatabaseImportPath,
  getDesktopDataImportSnapshot,
  importLegacyDatabaseFromPath,
  resolveSuggestedLegacyDatabasePath,
} from "./runtime/dataImport";
import { appendDesktopLog, logDesktopError } from "./runtime/logging";
import { resolveDesktopServerPort, startDesktopServer } from "./runtime/server";
import {
  isPortableDesktopRuntime,
  resolveDesktopAppDataDir,
  resolveDesktopLogsDir,
  resolveDesktopRuntimeConfig,
  resolveDesktopUpdateChannel,
  resolveDesktopWindowIcon,
  resolveRendererDevUrl,
  resolveRendererIndexHtml,
} from "./runtime/paths";
import {
  createBootstrapSnapshot,
  desktopBootstrapStore,
  desktopUpdaterStore,
} from "./runtime/state";
import { initializeDesktopUpdater, type DesktopUpdaterController } from "./runtime/updater";

const APP_USER_MODEL_ID = "com.ai-novel.desktop";
const MAIN_WINDOW_BACKGROUND = "#08101f";
const BOOTSTRAP_CHANNEL = "desktop:bootstrap-state-changed";
const UPDATER_CHANNEL = "desktop:updater-state-changed";

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let stopServer: (() => Promise<void>) | null = null;
let updaterController: DesktopUpdaterController | null = null;
let rendererReady = false;
let appShellReady = false;
let serverHealthy = false;
let mainWindowShown = false;
let bootstrapFailed = false;
let initialUpdateCheckScheduled = false;

function relaunchApp(extraArgs?: string[]): void {
  app.relaunch({ args: extraArgs ?? createSanitizedRelaunchArgs() });
  app.exit(0);
}

function appendBootstrapStage(stage: string, detail: string): void {
  appendDesktopLog("desktop.bootstrap.stage", `${stage}: ${detail}`);
}

function broadcastToMainWindow(channel: string, payload: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send(channel, payload);
}

function publishBootstrapSnapshot(): void {
  broadcastToMainWindow(BOOTSTRAP_CHANNEL, desktopBootstrapStore.getSnapshot());
}

function publishUpdaterSnapshot(): void {
  broadcastToMainWindow(UPDATER_CHANNEL, desktopUpdaterStore.getSnapshot());
}

function setBootstrapSnapshot(snapshot: ReturnType<typeof createBootstrapSnapshot>): void {
  desktopBootstrapStore.setSnapshot(snapshot);
}

function closeSplashWindow(): void {
  if (!splashWindow || splashWindow.isDestroyed()) {
    splashWindow = null;
    return;
  }

  splashWindow.close();
  splashWindow = null;
}

function initializeDesktopUpdaterController(): void {
  if (updaterController) {
    return;
  }

  updaterController = initializeDesktopUpdater({
    currentVersion: app.getVersion(),
    updateChannel: resolveDesktopUpdateChannel(),
    isPackaged: app.isPackaged,
    isPortable: isPortableDesktopRuntime(),
  });
}

function maybeScheduleUpdateCheck(delayMs?: number): void {
  if (initialUpdateCheckScheduled || !updaterController) {
    return;
  }

  updaterController.scheduleInitialCheck(delayMs);
  initialUpdateCheckScheduled = true;
}

function updateBootstrapProgress(): void {
  if (bootstrapFailed) {
    return;
  }

  if (!serverHealthy) {
    setBootstrapSnapshot(createBootstrapSnapshot({
      state: "starting-server",
      stage: "server-starting",
      title: "正在启动本地写作引擎",
      detail: rendererReady
        ? "桌面启动壳已经显示，正在等待打包后的本地服务进入可用状态。"
        : "正在拉起桌面本地服务，并准备用户数据目录。",
    }));
    return;
  }

  if (!appShellReady) {
    setBootstrapSnapshot(createBootstrapSnapshot({
      state: "loading-ui",
      stage: "server-healthy",
      title: "正在加载桌面工作区",
      detail: "本地服务已经可用，正在渲染桌面端首屏工作区。",
    }));
    return;
  }

  setBootstrapSnapshot(createBootstrapSnapshot({
    state: "ready",
    stage: "main-window-shown",
    title: "桌面工作区已就绪",
    detail: "启动壳、本地服务和工作区界面都已准备完成。",
    canRetry: false,
  }));
  maybeScheduleUpdateCheck();
}

function showMainWindowIfReady(): void {
  if (!mainWindow || mainWindowShown || !rendererReady || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.show();
  mainWindow.focus();
  mainWindowShown = true;
  appendBootstrapStage(
    "main-window-shown",
    serverHealthy
      ? "主窗口已经显示。"
      : "主窗口已经显示，本地服务仍在继续启动中。",
  );
  closeSplashWindow();
  updateBootstrapProgress();
}

function createMainWindow(port: number): BrowserWindow {
  const runtimeConfig = resolveDesktopRuntimeConfig({
    port,
    isPackaged: app.isPackaged,
    appVersion: app.getVersion(),
    updateChannel: resolveDesktopUpdateChannel(),
  });
  process.env.AI_NOVEL_DESKTOP_RUNTIME = JSON.stringify(runtimeConfig);
  const windowIcon = resolveDesktopWindowIcon();

  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: MAIN_WINDOW_BACKGROUND,
    icon: windowIcon,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.webContents.on("did-finish-load", () => {
    publishBootstrapSnapshot();
    publishUpdaterSnapshot();
  });

  if (process.env.AI_NOVEL_DESKTOP_RENDERER_URL?.trim()) {
    void window.loadURL(resolveRendererDevUrl());
  } else if (!app.isPackaged) {
    void window.loadURL(resolveRendererDevUrl());
  } else {
    void window.loadFile(resolveRendererIndexHtml());
  }

  return window;
}

function createSplashHtml(): string {
  const brandMark = `
    <svg width="96" height="96" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="desktopBrandGradient" x1="14" y1="12" x2="82" y2="84" gradientUnits="userSpaceOnUse">
          <stop stop-color="#1A5F7A" />
          <stop offset="1" stop-color="#122033" />
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="80" height="80" rx="24" fill="url(#desktopBrandGradient)" />
      <path d="M48 18L67 37L48 78L29 37L48 18Z" fill="#F7F3EA" />
      <circle cx="48" cy="44" r="6" fill="#133246" />
      <path d="M38 59L48 67L58 59" stroke="#133246" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="69" cy="28" r="4.5" fill="#76E5FF" />
      <path d="M63 34L57 39" stroke="#76E5FF" stroke-width="4" stroke-linecap="round" />
      <circle cx="28" cy="65" r="3.5" fill="#F6B24C" />
      <path d="M34 60L39 54" stroke="#F6B24C" stroke-width="4" stroke-linecap="round" />
    </svg>
  `;

  return `<!DOCTYPE html>
  <html lang="zh-CN">
    <head>
      <meta charset="UTF-8" />
      <meta
        http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"
      />
      <title>AI 小说创作工作台</title>
      <style>
        :root {
          color-scheme: dark;
          font-family: "Segoe UI", "Microsoft YaHei UI", sans-serif;
        }

        body {
          margin: 0;
          min-height: 100vh;
          display: grid;
          place-items: center;
          background:
            radial-gradient(circle at top left, rgba(59, 130, 246, 0.18), transparent 42%),
            radial-gradient(circle at bottom right, rgba(245, 158, 11, 0.15), transparent 38%),
            linear-gradient(145deg, #08101f 0%, #122033 55%, #101d2e 100%);
          color: #f8fafc;
        }

        .panel {
          width: 100%;
          max-width: 420px;
          padding: 28px 32px;
          border-radius: 28px;
          background: rgba(7, 12, 24, 0.72);
          border: 1px solid rgba(148, 163, 184, 0.16);
          box-shadow: 0 20px 80px rgba(2, 6, 23, 0.45);
          text-align: center;
        }

        .title {
          margin: 18px 0 8px;
          font-size: 24px;
          font-weight: 700;
          letter-spacing: 0.01em;
        }

        .subtitle {
          margin: 0;
          color: rgba(226, 232, 240, 0.82);
          font-size: 14px;
          line-height: 1.6;
        }

        .meter {
          margin-top: 24px;
          height: 8px;
          width: 100%;
          border-radius: 999px;
          background: rgba(148, 163, 184, 0.18);
          overflow: hidden;
        }

        .meter > span {
          display: block;
          width: 44%;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #76e5ff 0%, #f6b24c 100%);
          animation: travel 1.4s ease-in-out infinite;
          transform-origin: left center;
        }

        @keyframes travel {
          0% { transform: translateX(-85%); }
          50% { transform: translateX(120%); }
          100% { transform: translateX(230%); }
        }
      </style>
    </head>
    <body>
      <main class="panel">
        ${brandMark}
        <div class="title">AI 小说创作工作台</div>
        <p class="subtitle">正在准备桌面启动壳和打包后的本地写作引擎。</p>
        <div class="meter"><span></span></div>
      </main>
    </body>
  </html>`;
}

function createSplashWindow(): BrowserWindow {
  const windowIcon = resolveDesktopWindowIcon();
  const window = new BrowserWindow({
    width: 500,
    height: 360,
    show: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    alwaysOnTop: true,
    title: "AI Novel Writing Assistant v2",
    backgroundColor: MAIN_WINDOW_BACKGROUND,
    icon: windowIcon,
  });

  const splashUrl = `data:text/html;charset=UTF-8,${encodeURIComponent(createSplashHtml())}`;
  void window.loadURL(splashUrl);
  return window;
}

async function bootstrapDesktopApp(): Promise<void> {
  appendBootstrapStage("app-ready", "Electron app reported ready.");
  setBootstrapSnapshot(createBootstrapSnapshot({
    state: "launching",
    stage: "app-ready",
    title: "正在启动桌面工作区",
    detail: "Electron 已就绪，正在打开桌面启动壳。",
    canRetry: false,
  }));

  splashWindow = createSplashWindow();
  appendBootstrapStage("splash-shown", "Startup splash is visible.");
  setBootstrapSnapshot(createBootstrapSnapshot({
    state: "launching",
    stage: "splash-shown",
    title: "桌面启动壳已显示",
    detail: "正在准备桌面运行时环境和随包资源。",
    canRetry: false,
  }));
  initializeDesktopUpdaterController();
  maybeScheduleUpdateCheck(1_000);

  const pendingImportPath = extractPendingDatabaseImportPath(process.argv);
  if (pendingImportPath) {
    appendDesktopLog("desktop.data-import", `Applying pending legacy database import from ${pendingImportPath}.`);
    setBootstrapSnapshot(createBootstrapSnapshot({
      state: "launching",
      stage: "splash-shown",
      title: "正在导入旧版本地数据",
      detail: "正在把你选择的旧 web 本地数据库接管到桌面版数据目录。",
      canRetry: false,
    }));
    importLegacyDatabaseFromPath(pendingImportPath);
  }

  const port = await resolveDesktopServerPort({ isPackaged: app.isPackaged });
  mainWindow = createMainWindow(port);
  mainWindow.on("closed", () => {
    mainWindow = null;
    mainWindowShown = false;
  });

  appendBootstrapStage("server-starting", `Starting desktop server on 127.0.0.1:${port}.`);
  updateBootstrapProgress();

  const server = await startDesktopServer({ isPackaged: app.isPackaged, port });
  stopServer = server.stop;
  serverHealthy = true;
  appendBootstrapStage("server-healthy", `Desktop server is healthy on 127.0.0.1:${server.port}.`);
  updateBootstrapProgress();
}

function focusExistingWindow(): void {
  const targetWindow = mainWindow ?? splashWindow;
  if (!targetWindow || targetWindow.isDestroyed()) {
    return;
  }

  if (targetWindow.isMinimized()) {
    targetWindow.restore();
  }
  targetWindow.show();
  targetWindow.focus();
}

async function showBootstrapFailureDialog(error: unknown): Promise<void> {
  const logFilePath = logDesktopError("desktop.main.bootstrap", error);
  const logDir = resolveDesktopLogsDir();
  const errorMessage = error instanceof Error ? error.message : String(error);
  const result = await dialog.showMessageBox({
    type: "error",
    title: "AI 小说创作工作台启动失败",
    message: "桌面应用未能完成初始化。",
    detail: `${errorMessage}\n\n日志目录:\n${logDir}\n\n日志文件:\n${logFilePath}`,
    buttons: ["打开日志目录", "复制日志路径", "退出"],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });

  if (result.response === 0) {
    await shell.openPath(logDir);
    return;
  }

  if (result.response === 1) {
    clipboard.writeText(logFilePath);
  }
}

function registerDesktopIpcHandlers(): void {
  ipcMain.handle("desktop:get-bootstrap-snapshot", () => desktopBootstrapStore.getSnapshot());
  ipcMain.handle("desktop:get-updater-snapshot", () => desktopUpdaterStore.getSnapshot());
  ipcMain.handle("desktop:get-data-import-snapshot", () => getDesktopDataImportSnapshot());
  ipcMain.handle("desktop:check-for-updates", async () => {
    await updaterController?.checkForUpdates();
    return desktopUpdaterStore.getSnapshot();
  });
  ipcMain.handle("desktop:quit-and-install", () => {
    updaterController?.quitAndInstall();
    return true;
  });
  ipcMain.handle("desktop:open-logs-directory", () => shell.openPath(resolveDesktopLogsDir()));
  ipcMain.handle("desktop:copy-log-path", () => {
    const logPath = desktopBootstrapStore.getSnapshot().logFile;
    clipboard.writeText(logPath);
    return logPath;
  });
  ipcMain.handle("desktop:restart-app", () => {
    relaunchApp();
    return true;
  });
  ipcMain.handle("desktop:import-legacy-database", async (_event, options?: { preferSuggested?: boolean }) => {
    const suggestedSourcePath = resolveSuggestedLegacyDatabasePath();
    let sourcePath = options?.preferSuggested && suggestedSourcePath
      ? suggestedSourcePath
      : null;

    if (!sourcePath) {
      const importSnapshot = getDesktopDataImportSnapshot();
      const dialogResult = await dialog.showOpenDialog({
        title: "Select the old web database",
        buttonLabel: "Import this database",
        defaultPath: suggestedSourcePath ?? path.dirname(importSnapshot.currentDatabasePath),
        filters: [
          { name: "SQLite databases", extensions: ["db", "sqlite", "sqlite3"] },
          { name: "All files", extensions: ["*"] },
        ],
        properties: ["openFile"],
      });

      if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
        return {
          scheduled: false,
          cancelled: true,
        };
      }

      [sourcePath] = dialogResult.filePaths;
    }

    const importSnapshot = getDesktopDataImportSnapshot();
    const confirmation = await dialog.showMessageBox({
      type: "warning",
      title: "Import old local data",
      message: "Import the selected web database into the desktop app?",
      detail: [
        "Before importing, close the old web/dev app so the source SQLite file is not still being written.",
        "",
        "The desktop app will restart once to finish the import.",
        "",
        `Import from: ${sourcePath}`,
        `Desktop database: ${importSnapshot.currentDatabasePath}`,
        `Backup directory: ${importSnapshot.backupDirectory}`,
      ].join("\n"),
      buttons: ["Import and restart", "Cancel"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });

    if (confirmation.response !== 0) {
      return {
        scheduled: false,
        cancelled: true,
      };
    }

    const relaunchArgs = createDatabaseImportRelaunchArgs(sourcePath, process.argv);
    setTimeout(() => {
      relaunchApp(relaunchArgs);
    }, 150);

    return {
      scheduled: true,
      cancelled: false,
      sourcePath,
    };
  });

  ipcMain.on("desktop:renderer-ready", () => {
    if (rendererReady) {
      return;
    }
    rendererReady = true;
    appendBootstrapStage("renderer-ready", "Renderer bootstrap shell is ready.");
    showMainWindowIfReady();
    updateBootstrapProgress();
  });

  ipcMain.on("desktop:app-shell-ready", () => {
    if (appShellReady) {
      return;
    }
    appShellReady = true;
    updateBootstrapProgress();
  });
}

function registerStoreBroadcasts(): void {
  desktopBootstrapStore.subscribe(() => {
    publishBootstrapSnapshot();
  });
  desktopUpdaterStore.subscribe(() => {
    publishUpdaterSnapshot();
  });
}

async function handleBootstrapFailure(error: unknown): Promise<void> {
  bootstrapFailed = true;
  initializeDesktopUpdaterController();
  maybeScheduleUpdateCheck(0);
  const errorMessage = error instanceof Error ? error.message : String(error);
  setBootstrapSnapshot(createBootstrapSnapshot({
    state: "error",
    stage: "error",
    title: "桌面启动失败",
    detail: errorMessage,
  }));

  if (rendererReady && mainWindow && !mainWindow.isDestroyed()) {
    showMainWindowIfReady();
    closeSplashWindow();
    return;
  }

  closeSplashWindow();
  await showBootstrapFailureDialog(error);
  app.exit(1);
}

app.setPath("userData", resolveDesktopAppDataDir());
app.setAppUserModelId(APP_USER_MODEL_ID);
registerDesktopIpcHandlers();
registerStoreBroadcasts();

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.on("second-instance", () => {
  focusExistingWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (stopServer) {
    void stopServer();
  }
});

app.whenReady()
  .then(() => bootstrapDesktopApp())
  .catch(async (error) => {
    console.error("[desktop] bootstrap failed.", error);
    await handleBootstrapFailure(error);
  });
