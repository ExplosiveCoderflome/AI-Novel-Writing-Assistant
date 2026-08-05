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
