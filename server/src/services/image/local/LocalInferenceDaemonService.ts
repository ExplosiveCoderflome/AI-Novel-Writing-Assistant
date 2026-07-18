import { spawn, ChildProcess } from "child_process";
import dns from "dns";
import { systemDiagnosticService } from "../local/SystemDiagnosticService";

// 强制解析 localhost 为 IPv4，防止 Node.js 在 IPv6 优先环境下与 localhost 建立握手失败
dns.setDefaultResultOrder("ipv4first");

export class LocalInferenceDaemonService {
  private daemonProcess: ChildProcess | null = null;
  private readonly ollamaUrl = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
  private readonly defaultModel = "sensenova-u1:8b-v3";

  /**
   * 获取本地推理服务的健康状态与可用模型
   */
  async checkDaemonHealth(): Promise<{ ok: boolean; message: string; activeModel?: string }> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) {
        const data = (await response.json()) as { models?: Array<{ name: string }> };
        const modelNames = data.models?.map((m) => m.name) ?? [];
        const hasModel = modelNames.some((name) => name.toLowerCase().includes("sensenova-u1") || name.toLowerCase().includes("flux"));
        return {
          ok: true,
          message: hasModel
            ? `本地推理服务运行正常。检测到可用模型: [${modelNames.join(", ")}]`
            : "本地推理服务运行正常，但未检测到 SenseNova 图像模型。系统将在首次调用时尝试拉取。",
          activeModel: hasModel ? this.defaultModel : undefined,
        };
      }
    } catch {
      // 捕获连接失败
    }

    return {
      ok: false,
      message: "未检测到本地推理服务后台进程。正在尝试拉起...",
    };
  }

  /**
   * 自动拉起本地 Ollama/llama.cpp 守护进程
   */
  async ensureDaemonStarted(): Promise<void> {
    const health = await this.checkDaemonHealth();
    if (health.ok) {
      return;
    }

    const diag = await systemDiagnosticService.runDiagnostic();
    const command = diag.platform === "win32" ? "ollama" : "ollama";
    const args = ["serve"];

    console.log(`[LocalInferenceDaemon] 正在启动后台守护进程: ${command} ${args.join(" ")}`);

    try {
      this.daemonProcess = spawn(command, args, {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });

      // 释放子进程关系，防止主进程退出时挂起
      this.daemonProcess.unref();

      // 轮询等待守护进程就绪
      for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const check = await this.checkDaemonHealth();
        if (check.ok) {
          console.log("[LocalInferenceDaemon] 本地推理后台就绪。");
          return;
        }
      }
      throw new Error("后台守护进程启动超时，请确保系统已安装并配置 Ollama。");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`无法自动启动本地推理后台：${msg}。请手动启动 Ollama 或 llama.cpp。`);
    }
  }

  /**
   * 确保模型已拉取并载入本地引擎中
   */
  async ensureModelLoaded(): Promise<void> {
    await this.ensureDaemonStarted();

    console.log(`[LocalInferenceDaemon] 正在向本地引擎确认并拉取模型: ${this.defaultModel}`);
    try {
      const response = await fetch(`${this.ollamaUrl}/api/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: this.defaultModel }),
      });

      if (!response.ok) {
        throw new Error(`本地拉取返回错误码: ${response.status}`);
      }
    } catch (err) {
      console.warn(`[LocalInferenceDaemon] 模型验证/拉取时发生警告 (可能是离线环境):`, err);
    }
  }

  /**
   * 优雅停止守护进程
   */
  cleanup(): void {
    if (this.daemonProcess) {
      console.log("[LocalInferenceDaemon] 正在终止后台推理进程...");
      try {
        if (this.daemonProcess.pid) {
          process.kill(-this.daemonProcess.pid);
        } else {
          this.daemonProcess.kill();
        }
      } catch {
        // 捕获可能已经退出的异常
      }
      this.daemonProcess = null;
    }
  }
}

export const localInferenceDaemonService = new LocalInferenceDaemonService();
