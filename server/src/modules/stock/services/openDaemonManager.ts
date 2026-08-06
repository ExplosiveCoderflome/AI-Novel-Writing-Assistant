import { spawn, ChildProcess } from "child_process";
import net from "net";
import path from "path";
import fs from "fs";

export class OpenDaemonManager {
  private static instance: OpenDaemonManager;
  private processRef: ChildProcess | null = null;

  // 默认 OpenD 守护进程路径与端口配置 (脱敏，由环境变量或系统动态路径加载)
  private defaultExePath: string =
    process.env.OPEND_EXE_PATH ||
    path.join(
      process.env.USERPROFILE || process.env.HOME || "",
      "AppData",
      "Roaming",
      "moomoo_OpenD",
      "moomoo_OpenD.exe"
    );
  private host: string = process.env.OPEND_HOST || "127.0.0.1";
  private port: number = Number(process.env.OPEND_PORT) || 11111;

  public static getInstance(): OpenDaemonManager {
    if (!OpenDaemonManager.instance) {
      OpenDaemonManager.instance = new OpenDaemonManager();
    }
    return OpenDaemonManager.instance;
  }

  /**
   * 检测本地 11111 端口 OpenD 是否已处于响应状态
   */
  public async checkOpenDAlive(timeoutMs: number = 2000): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let resolved = false;

      socket.setTimeout(timeoutMs);

      socket.on("connect", () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          resolve(true);
        }
      });

      socket.on("timeout", () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          resolve(false);
        }
      });

      socket.on("error", () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          resolve(false);
        }
      });

      socket.connect(this.port, this.host);
    });
  }

  /**
   * 确保 OpenD 正在运行，若未运行则自动后台唤醒
   */
  public async ensureOpenDRunning(customExePath?: string): Promise<{ success: boolean; message: string }> {
    const isAlive = await this.checkOpenDAlive();
    if (isAlive) {
      return { success: true, message: `MooMoo OpenD 已在 ${this.host}:${this.port} 正常运行` };
    }

    const exePath = customExePath || this.defaultExePath;

    if (!fs.existsSync(exePath)) {
      return {
        success: false,
        message: `未找到 OpenD 可执行文件 (${exePath})。请确认已解压或安装 MooMoo OpenD。`,
      };
    }

    try {
      // 在后台唤醒 OpenD 守护进程
      this.processRef = spawn(exePath, [], {
        detached: true,
        stdio: "ignore",
      });

      this.processRef.unref();

      // 等待 3 秒端口响应
      let retries = 6;
      while (retries > 0) {
        await new Promise((res) => setTimeout(res, 500));
        const checkAgain = await this.checkOpenDAlive(500);
        if (checkAgain) {
          return { success: true, message: `已成功在后台唤醒 MooMoo OpenD 网关 (${exePath})` };
        }
        retries--;
      }

      return {
        success: true,
        message: `已向系统的 OpenD 发起拉起指令，网关正在初始化中...`,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `唤醒 OpenD 守护进程失败: ${error?.message || error}`,
      };
    }
  }

  /**
   * 唤起并前台显示 MooMoo 客户端（Winnerineast 101835190）及解锁界面
   */
  public async activateOrCreateOpenD(customExePath?: string): Promise<{ success: boolean; message: string }> {
    const exePath = customExePath || this.defaultExePath;
    const { exec } = require("child_process");

    try {
      // 1. 查找已在任务栏运行的 MooMoo 客户端进程并置顶前台弹出
      const activated = await new Promise<boolean>((resolve) => {
        const psCmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Get-Process -Name 'moomoo','moomoo_OpenD','Futu' -ErrorAction SilentlyContinue | Select-Object -First 1; if ($p) { (New-Object -ComObject wscript.shell).AppActivate($p.Id); 'OK' } else { 'NONE' }"`;
        exec(psCmd, (_err: any, stdout: string) => {
          resolve(Boolean(stdout && stdout.includes("OK")));
        });
      });

      if (activated) {
        return {
          success: true,
          message: "已成功为您在前台唤起并置顶显示 MooMoo 官方客户端！请在 MooMoo 界面点击左上角【设置⚙️】或【交易】解锁密码。",
        };
      }

      // 2. 若当前未启动，拉起 MooMoo 客户端程序
      const moomooAppPath = "C:\\Program Files\\moomoo\\app\\16.24.16908\\moomoo.exe";
      const moomooClientPath = "C:\\Program Files\\moomoo\\moomoo.exe";
      if (fs.existsSync(moomooAppPath)) {
        exec(`explorer.exe "${moomooAppPath}"`);
      } else if (fs.existsSync(moomooClientPath)) {
        exec(`explorer.exe "${moomooClientPath}"`);
      } else if (fs.existsSync(exePath)) {
        exec(`explorer.exe "${exePath}"`);
      }

      return {
        success: true,
        message: "已发起 MooMoo 客户端启动指令，正在前台初始化展现中...",
      };
    } catch (error: any) {
      return {
        success: false,
        message: `唤起失败: ${error?.message || error}`,
      };
    }
  }

  /**
   * 唤起或重启前台 OpenD 进程
   */
  public async restartOpenD(customExePath?: string): Promise<{ success: boolean; message: string }> {
    return this.activateOrCreateOpenD(customExePath);
  }

  /**
   * 获取 OpenD 状态信息
   */
  public async getStatus(): Promise<{ connected: boolean; host: string; port: number; exePath: string }> {
    const connected = await this.checkOpenDAlive();
    return {
      connected,
      host: this.host,
      port: this.port,
      exePath: this.defaultExePath,
    };
  }
}

export const openDaemonManager = OpenDaemonManager.getInstance();
