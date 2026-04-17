declare module "electron" {
  interface BrowserWindowOptions {
    width?: number;
    height?: number;
    minWidth?: number;
    minHeight?: number;
    show?: boolean;
    autoHideMenuBar?: boolean;
    webPreferences?: {
      preload?: string;
      contextIsolation?: boolean;
      nodeIntegration?: boolean;
    };
  }

  interface BrowserWindow {
    loadURL(url: string): Promise<void>;
    loadFile(filePath: string): Promise<void>;
    show(): void;
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
    setPath(name: string, value: string): void;
    whenReady(): Promise<void>;
    on(event: "window-all-closed" | "before-quit", listener: () => void): this;
  }

  interface ContextBridge {
    exposeInMainWorld(apiKey: string, api: unknown): void;
  }

  export const app: App;
  export const BrowserWindow: BrowserWindowConstructor;
  export const contextBridge: ContextBridge;
}
