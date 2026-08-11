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
  async ensureModelLoaded(modelName = this.defaultModel): Promise<boolean> {
    await this.ensureDaemonStarted();

    // 1. 先检查本地是否已经安装了该模型
    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) {
        const data = (await response.json()) as { models?: Array<{ name: string }> };
        const installedModels = data.models?.map((m) => m.name.toLowerCase()) ?? [];
        const isAlreadyInstalled = installedModels.some((name) =>
          name.includes(modelName.toLowerCase()) || name.includes("sensenova-u1")
        );
        if (isAlreadyInstalled) {
          console.log(`[LocalInferenceDaemon] 本地引擎检测到 SenseNova 模型已准备就绪: ${modelName}`);
          return true;
        }
      }
    } catch (err) {
      console.warn(`[LocalInferenceDaemon] 查询本地已安装模型列表失败:`, err);
    }

    // 2. 本地未检测到模型，尝试自动发起拉取请求 (同步等待 stream: false)
    console.log(`[LocalInferenceDaemon] 正在向本地引擎自动发起拉取模型请求: ${modelName}`);
    try {
      const response = await fetch(`${this.ollamaUrl}/api/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelName, stream: false }),
        signal: AbortSignal.timeout(30000),
      });

      if (response.ok) {
        console.log(`[LocalInferenceDaemon] 自动拉取模型 ${modelName} 成功完成。`);
        return true;
      } else {
        const errText = await response.text().catch(() => "");
        console.warn(`[LocalInferenceDaemon] 本地自动拉取模型 ${modelName} 返回状态 ${response.status}: ${errText}`);
      }
    } catch (err) {
      console.warn(`[LocalInferenceDaemon] 模型自动拉取时发生警告或超时 (可能是离线环境或网络受阻):`, err);
    }
    return false;
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
