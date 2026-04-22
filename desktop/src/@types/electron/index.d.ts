declare module "electron" {
  type MessageBoxType = "none" | "info" | "error" | "question" | "warning";
  type TitleBarStyle = "default" | "hidden" | "hiddenInset" | "customButtonsOnHover";

  interface BrowserWindowOptions {
    width?: number;
    height?: number;
    minWidth?: number;
    minHeight?: number;
    show?: boolean;
    backgroundColor?: string;
    resizable?: boolean;
    minimizable?: boolean;
    maximizable?: boolean;
    fullscreenable?: boolean;
    frame?: boolean;
    transparent?: boolean;
    alwaysOnTop?: boolean;
    skipTaskbar?: boolean;
    icon?: string;
    title?: string;
    titleBarStyle?: TitleBarStyle;
    autoHideMenuBar?: boolean;
    webPreferences?: {
      preload?: string;
      contextIsolation?: boolean;
      nodeIntegration?: boolean;
    };
  }

  interface WebContents {
    send(channel: string, ...args: unknown[]): void;
    once(event: "did-finish-load", listener: () => void): this;
    on(event: "did-finish-load", listener: () => void): this;
  }

  interface BrowserWindow {
    webContents: WebContents;
    loadURL(url: string): Promise<void>;
    loadFile(filePath: string): Promise<void>;
    show(): void;
    hide(): void;
    close(): void;
    destroy(): void;
    focus(): void;
    restore(): void;
    isDestroyed(): boolean;
    isMinimized(): boolean;
    once(event: "ready-to-show", listener: () => void): this;
    on(event: "closed", listener: () => void): this;
  }

  interface BrowserWindowConstructor {
    new (options?: BrowserWindowOptions): BrowserWindow;
  }

  interface App {
    isPackaged: boolean;
    quit(): void;
    exit(code?: number): void;
    relaunch(options?: { args?: string[]; execPath?: string }): void;
    setPath(name: string, value: string): void;
    setAppUserModelId(id: string): void;
    requestSingleInstanceLock(): boolean;
    getVersion(): string;
    whenReady(): Promise<void>;
    on(event: "window-all-closed" | "before-quit" | "second-instance", listener: () => void): this;
  }

  interface MessageBoxOptions {
    type?: MessageBoxType;
    title?: string;
    message: string;
    detail?: string;
    buttons?: string[];
    defaultId?: number;
    cancelId?: number;
    noLink?: boolean;
  }

  interface MessageBoxReturnValue {
    response: number;
  }

  interface FileFilter {
    name: string;
    extensions: string[];
  }

  interface OpenDialogOptions {
    title?: string;
    defaultPath?: string;
    buttonLabel?: string;
    properties?: Array<"openFile" | "openDirectory" | "multiSelections" | "showHiddenFiles" | "createDirectory">;
    filters?: FileFilter[];
  }

  interface OpenDialogReturnValue {
    canceled: boolean;
    filePaths: string[];
  }

  interface Dialog {
    showMessageBox(options: MessageBoxOptions): Promise<MessageBoxReturnValue>;
    showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogReturnValue>;
  }

  interface Shell {
    openPath(path: string): Promise<string>;
  }

  interface Clipboard {
    writeText(text: string): void;
  }

  interface UtilityProcessOptions {
    env?: NodeJS.ProcessEnv;
    execArgv?: string[];
    cwd?: string;
    stdio?: "pipe" | "ignore" | "inherit";
    serviceName?: string;
  }

  interface UtilityProcessError {
    type: string;
    location: string;
    report: string;
  }

  interface UtilityProcess {
    pid?: number;
    stdout: NodeJS.ReadableStream | null;
    stderr: NodeJS.ReadableStream | null;
    kill(): boolean;
    once(event: "exit", listener: (code: number) => void): this;
    on(event: "spawn", listener: () => void): this;
    on(event: "exit", listener: (code: number) => void): this;
    on(event: "error", listener: (error: UtilityProcessError) => void): this;
  }

  interface UtilityProcessModule {
    fork(modulePath: string, args?: string[], options?: UtilityProcessOptions): UtilityProcess;
  }

  interface ContextBridge {
    exposeInMainWorld(apiKey: string, api: unknown): void;
  }

  interface IpcMain {
    handle(channel: string, listener: (...args: unknown[]) => unknown): void;
    on(channel: string, listener: (...args: unknown[]) => void): this;
  }

  interface IpcRenderer {
    invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>;
    send(channel: string, ...args: unknown[]): void;
    on(channel: string, listener: (_event: unknown, ...args: unknown[]) => void): this;
    removeListener(channel: string, listener: (_event: unknown, ...args: unknown[]) => void): this;
  }

  export const app: App;
  export const BrowserWindow: BrowserWindowConstructor;
  export const clipboard: Clipboard;
  export const contextBridge: ContextBridge;
  export const dialog: Dialog;
  export const ipcMain: IpcMain;
  export const ipcRenderer: IpcRenderer;
  export const shell: Shell;
  export const utilityProcess: UtilityProcessModule;
}
