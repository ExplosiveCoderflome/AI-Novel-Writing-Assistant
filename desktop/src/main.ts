import path from "node:path";
import { app, BrowserWindow } from "electron";
import {
  resolveDesktopAppDataDir,
  resolveDesktopRuntimeConfig,
  resolveRendererDevUrl,
  resolveRendererIndexHtml,
} from "./runtime/paths";
import { startDesktopServer } from "./runtime/server";

let mainWindow: BrowserWindow | null = null;
let stopServer: (() => Promise<void>) | null = null;

function createMainWindow(port: number): BrowserWindow {
  const runtimeConfig = resolveDesktopRuntimeConfig(port);
  process.env.AI_NOVEL_DESKTOP_RUNTIME = JSON.stringify(runtimeConfig);

  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.once("ready-to-show", () => {
    window.show();
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

async function bootstrapDesktopApp(): Promise<void> {
  const server = await startDesktopServer({ isPackaged: app.isPackaged });
  stopServer = server.stop;
  mainWindow = createMainWindow(server.port);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

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

app.setPath("userData", resolveDesktopAppDataDir());

app.whenReady()
  .then(() => bootstrapDesktopApp())
  .catch((error) => {
    console.error("[desktop] bootstrap failed.", error);
    app.exit(1);
  });
