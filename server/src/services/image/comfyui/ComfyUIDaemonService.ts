import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import type { ImageProviderGenerateInput, ImageProviderGenerateResult } from "../types";

export interface DownloadProgressInfo {
  isDownloading: boolean;
  fileName: string;
  downloadedMB: number;
  totalMB: number;
  percent: number;
  error?: string | null;
}

export type DownloadProgressListener = (info: DownloadProgressInfo) => void;

export interface ComfyUIHealth {
  ok: boolean;
  baseURL: string;
  activeModel?: string;
  checkpoints: string[];
  message: string;
  autoStarted?: boolean;
  discoveredPath?: string | null;
  checkpointsDir?: string | null;
  downloadProgress?: DownloadProgressInfo;
}

const PORT_CANDIDATES = [8188, 8189, 8190, 7860, 8000, 8888, 5000];

function getExpandedComfyUIUrls(): string[] {
  const envUrl = process.env.COMFYUI_BASE_URL;
  const list: string[] = [];
  if (envUrl) list.push(envUrl.replace(/\/$/, ""));

  for (const port of PORT_CANDIDATES) {
    list.push(`http://127.0.0.1:${port}`);
    list.push(`http://localhost:${port}`);
  }
  return Array.from(new Set(list));
}

/**
 * 基于 Comfy Desktop 桌面版与 ComfyUI 独立便携版的深层精准先验扫描引擎
 */
export function deepDiscoverComfyUIPath(): string | null {
  if (process.env.COMFYUI_PATH && fs.existsSync(process.env.COMFYUI_PATH)) {
    return process.env.COMFYUI_PATH;
  }
  if (process.env.COMFYUI_EXECUTABLE && fs.existsSync(process.env.COMFYUI_EXECUTABLE)) {
    return process.env.COMFYUI_EXECUTABLE;
  }

  const userHome = process.env.USERPROFILE || process.env.HOME || "C:\\Users\\lilin";
  const localAppData = process.env.LOCALAPPDATA || path.join(userHome, "AppData", "Local");

  const comfyDesktopBackendCandidates = [
    {
      python: path.join(localAppData, "Comfy-Desktop", "ComfyUI-Installs", "ComfyUI", "ComfyUI", ".venv", "Scripts", "python.exe"),
      script: path.join(localAppData, "Comfy-Desktop", "ComfyUI-Installs", "ComfyUI", "ComfyUI", "main.py"),
    },
    {
      python: "C:\\Users\\lilin\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Installs\\ComfyUI\\ComfyUI\\.venv\\Scripts\\python.exe",
      script: "C:\\Users\\lilin\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Installs\\ComfyUI\\ComfyUI\\main.py",
    },
    {
      python: path.join(localAppData, "Comfy-Desktop", "ComfyUI-Installs", "ComfyUI", "standalone-env", "python.exe"),
      script: path.join(localAppData, "Comfy-Desktop", "ComfyUI-Installs", "ComfyUI", "ComfyUI", "main.py"),
    },
  ];

  for (const item of comfyDesktopBackendCandidates) {
    if (fs.existsSync(item.python) && fs.existsSync(item.script)) {
      return `${item.python}||${item.script}`;
    }
  }

  const officialDesktopExes = [
    path.join(localAppData, "Programs", "Comfy Desktop", "Comfy Desktop.exe"),
    "C:\\Users\\lilin\\AppData\\Local\\Programs\\Comfy Desktop\\Comfy Desktop.exe",
    path.join(localAppData, "Programs", "ComfyUI", "ComfyUI.exe"),
  ];
  for (const exe of officialDesktopExes) {
    if (fs.existsSync(exe)) return exe;
  }

  const portableCandidates = [
    "C:\\ComfyUI_windows_portable\\run_nvidia_gpu.bat",
    "D:\\ComfyUI_windows_portable\\run_nvidia_gpu.bat",
    "E:\\ComfyUI_windows_portable\\run_nvidia_gpu.bat",
    "F:\\ComfyUI_windows_portable\\run_nvidia_gpu.bat",
    "C:\\ComfyUI_windows_portable\\ComfyUI\\main.py",
    "D:\\ComfyUI_windows_portable\\ComfyUI\\main.py",
    "E:\\ComfyUI_windows_portable\\ComfyUI\\main.py",
    "F:\\ComfyUI_windows_portable\\ComfyUI\\main.py",
  ];

  for (const candidate of portableCandidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  const drives = ["C", "D", "E", "F", "G", "H"].map(d => `${d}:\\`);
  const searchBases = [
    path.join(localAppData, "Programs"),
    path.join(userHome, "Desktop"),
    path.join(userHome, "Downloads"),
    ...drives,
  ].filter(b => Boolean(b) && fs.existsSync(b));

  const targetFiles = [
    "Comfy Desktop.exe",
    "run_nvidia_gpu.bat",
    "run_cpu.bat",
    "run.bat",
    "main.py",
    "comfyui.exe",
  ];

  for (const base of searchBases) {
    try {
      const entries = fs.readdirSync(base, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.toLowerCase().includes("comfy")) {
          const comfyDir = path.join(base, entry.name);
          for (const targetName of targetFiles) {
            const candidate = path.join(comfyDir, targetName);
            if (fs.existsSync(candidate)) return candidate;
            const innerCandidate = path.join(comfyDir, "ComfyUI", targetName);
            if (fs.existsSync(innerCandidate)) return innerCandidate;
          }
        }
      }
    } catch {
      /* skip errors */
    }
  }

  return null;
}

/**
 * 自动定位 ComfyUI 模型存放目录 (models/checkpoints)
 */
export function discoverCheckpointsDir(): string | null {
  const userHome = process.env.USERPROFILE || process.env.HOME || "C:\\Users\\lilin";
  const localAppData = process.env.LOCALAPPDATA || path.join(userHome, "AppData", "Local");
  const discovered = deepDiscoverComfyUIPath();

  const candidates = [
    path.join(localAppData, "Comfy-Desktop", "ComfyUI-Installs", "ComfyUI", "ComfyUI", "models", "checkpoints"),
  ];

  if (discovered) {
    if (discovered.includes("||")) {
      const mainPy = discovered.split("||")[1];
      candidates.unshift(path.join(path.dirname(mainPy), "models", "checkpoints"));
    } else {
      const dir = path.dirname(discovered);
      candidates.unshift(path.join(dir, "models", "checkpoints"));
      candidates.unshift(path.join(dir, "ComfyUI", "models", "checkpoints"));
    }
  }

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

export class ModelWeightDownloader {
  private currentProgress: DownloadProgressInfo = {
    isDownloading: false,
    fileName: "",
    downloadedMB: 0,
    totalMB: 0,
    percent: 0,
  };
  private downloadPromise: Promise<void> | null = null;
  private listeners: Set<DownloadProgressListener> = new Set();

  onProgress(listener: DownloadProgressListener): () => void {
    this.listeners.add(listener);
    if (this.currentProgress.isDownloading) {
      try {
        listener(this.currentProgress);
      } catch {
        /* ignore */
      }
    }
    return () => this.listeners.delete(listener);
  }

  private notifyProgress(info: DownloadProgressInfo) {
    this.currentProgress = info;
    for (const listener of this.listeners) {
      try {
        listener(info);
      } catch {
        /* ignore */
      }
    }
  }

  getProgress(): DownloadProgressInfo {
    return { ...this.currentProgress };
  }

  async ensureModelDownloaded(targetDir: string): Promise<boolean> {
    if (!fs.existsSync(targetDir)) {
      try {
        fs.mkdirSync(targetDir, { recursive: true });
      } catch {
        /* ignore */
      }
    }

    const existing = fs.existsSync(targetDir)
      ? fs.readdirSync(targetDir).filter(f => /\.(safetensors|ckpt|pt)$/i.test(f))
      : [];
    const existingFlux = existing.find(f => f.toLowerCase().includes("flux") || f.toLowerCase().includes("schnell"));
    if (existingFlux) return true;

    if (this.downloadPromise) {
      await this.downloadPromise;
      return true;
    }

    const defaultFileName = "flux1-schnell-fp8.safetensors";
    const destPath = path.join(targetDir, defaultFileName);
    const downloadUrls = [
      "https://hf-mirror.com/Comfy-Org/flux1-schnell/resolve/main/flux1-schnell-fp8.safetensors",
      "https://huggingface.co/Comfy-Org/flux1-schnell/resolve/main/flux1-schnell-fp8.safetensors",
    ];

    this.notifyProgress({
      isDownloading: true,
      fileName: defaultFileName,
      downloadedMB: 0,
      totalMB: 0,
      percent: 0,
    });

    console.log(`[ModelDownloader] 开始全自动为 ComfyUI 下载初始离线生图模型权重: ${destPath}`);

    this.downloadPromise = (async () => {
      let lastErr: Error | null = null;
      for (const url of downloadUrls) {
        try {
          await this.doDownload(url, destPath);
          console.log(`[ModelDownloader] 成功下载模型权重至: ${destPath}`);
          this.notifyProgress({
            isDownloading: false,
            fileName: defaultFileName,
            downloadedMB: this.currentProgress.downloadedMB,
            totalMB: this.currentProgress.totalMB,
            percent: 100,
          });
          return;
        } catch (err: any) {
          console.error(`[ModelDownloader] 从 ${url} 下载失败:`, err.message);
          lastErr = err;
        }
      }
      this.notifyProgress({
        isDownloading: false,
        fileName: defaultFileName,
        downloadedMB: this.currentProgress.downloadedMB,
        totalMB: this.currentProgress.totalMB,
        percent: 0,
        error: lastErr ? lastErr.message : "下载失败",
      });
      throw lastErr || new Error("模型权重自动下载失败");
    })();

    try {
      await this.downloadPromise;
      return true;
    } finally {
      this.downloadPromise = null;
    }
  }

  private doDownload(url: string, destPath: string): Promise<void> {
    const tempPath = `${destPath}.tmp`;
    return new Promise((resolve, reject) => {
      const request = (currentUrl: string, maxRedirects = 10) => {
        if (maxRedirects <= 0) return reject(new Error("重定向次数过多"));
        const protocol = currentUrl.startsWith("https") ? https : http;
        protocol
          .get(currentUrl, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              const redirectUrl = new URL(res.headers.location, currentUrl).toString();
              return request(redirectUrl, maxRedirects - 1);
            }
            if (res.statusCode !== 200) {
              return reject(new Error(`HTTP ${res.statusCode}`));
            }

            const totalBytes = parseInt(res.headers["content-length"] || "0", 10);
            let downloadedBytes = 0;
            const fileStream = fs.createWriteStream(tempPath);

            res.on("data", (chunk) => {
              downloadedBytes += chunk.length;
              fileStream.write(chunk);
              const downloadedMB = parseFloat((downloadedBytes / (1024 * 1024)).toFixed(1));
              const totalMB = parseFloat((totalBytes / (1024 * 1024)).toFixed(1));
              const percent = totalBytes > 0 ? Math.min(99, Math.floor((downloadedBytes / totalBytes) * 100)) : 0;
              this.notifyProgress({
                isDownloading: true,
                fileName: path.basename(destPath),
                downloadedMB,
                totalMB,
                percent,
              });
            });

            res.on("end", () => {
              fileStream.end(() => {
                fs.renameSync(tempPath, destPath);
                resolve();
              });
            });

            res.on("error", (err) => {
              if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
              reject(err);
            });
          })
          .on("error", (err) => {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            reject(err);
          });
      };

      request(url);
    });
  }
}

export const modelWeightDownloader = new ModelWeightDownloader();

export class ComfyUIDaemonService {
  private activeBaseURL: string = "http://127.0.0.1:8188";
  private cachedCheckpoints: string[] = [];
  private startingPromise: Promise<boolean> | null = null;
  private cachedDiscoveredPath: string | null | undefined = undefined;

  /**
   * 全自动多端口探查 ComfyUI 服务状态与已安装 Checkpoints (如 MiniMax-H3, SDXL 等)
   */
  async checkDaemonHealth(): Promise<ComfyUIHealth> {
    if (this.cachedDiscoveredPath === undefined) {
      this.cachedDiscoveredPath = deepDiscoverComfyUIPath();
    }

    const checkpointsDir = discoverCheckpointsDir();
    const downloadProgress = modelWeightDownloader.getProgress();

    const urls = getExpandedComfyUIUrls();
    for (const url of urls) {
      try {
        const cleanUrl = url.replace(/\/$/, "");
        const res = await fetch(`${cleanUrl}/system_stats`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          this.activeBaseURL = cleanUrl;
          const checkpoints = await this.discoverCheckpoints(cleanUrl);
          this.cachedCheckpoints = checkpoints;
          const activeModel = checkpoints.find(c => c.toLowerCase().includes("minimax") || c.toLowerCase().includes("h3")) || checkpoints[0] || "MiniMax-H3";

          let message = "";
          if (checkpoints.length > 0) {
            message = `ComfyUI 在线连接成功 (${cleanUrl})，识别可用模型: ${checkpoints.join(", ")}`;
          } else if (downloadProgress.isDownloading) {
            message = `正在全自动为您下载离线生图模型权重 (${downloadProgress.fileName}): ${downloadProgress.percent}% (${downloadProgress.downloadedMB}MB / ${downloadProgress.totalMB}MB)`;
          } else {
            message = `ComfyUI 在线连接成功 (${cleanUrl})。提示: checkpoints 目录未检测到模型文件，点击【自动下载】可一键获取预设权重`;
          }

          return {
            ok: true,
            baseURL: cleanUrl,
            activeModel,
            checkpoints,
            discoveredPath: this.cachedDiscoveredPath,
            checkpointsDir,
            downloadProgress,
            message,
          };
        }
      } catch {
        /* try next port URL */
      }
    }

    return {
      ok: false,
      baseURL: this.activeBaseURL,
      checkpoints: [],
      discoveredPath: this.cachedDiscoveredPath,
      checkpointsDir,
      downloadProgress,
      message: this.cachedDiscoveredPath
        ? `自动探测定位到本地 ComfyUI 后端引擎: ${this.cachedDiscoveredPath}。准备自动拉起...`
        : "未检测到本地在线 ComfyUI 服务。准备全路径自动拉起...",
    };
  }

  /**
   * 触发后台自动下载默认模型权重
   */
  async triggerAutoDownloadModel(): Promise<DownloadProgressInfo> {
    const checkpointsDir = discoverCheckpointsDir();
    if (!checkpointsDir) throw new Error("无法定位 ComfyUI models/checkpoints 目录");
    
    modelWeightDownloader.ensureModelDownloaded(checkpointsDir).then(() => {
      this.checkDaemonHealth();
    }).catch(err => {
      console.error("[ComfyUIDaemon] 后台模型自动下载失败:", err);
    });

    return modelWeightDownloader.getProgress();
  }

  /**
   * 未在线时全自动拉起本地 ComfyUI / Comfy Desktop 进程，无缝等待启动完成
   */
  async ensureDaemonStarted(): Promise<ComfyUIHealth> {
    const health = await this.checkDaemonHealth();
    if (health.ok) return health;

    if (this.startingPromise) {
      await this.startingPromise;
      return this.checkDaemonHealth();
    }

    this.startingPromise = (async () => {
      const targetPath = deepDiscoverComfyUIPath();
      this.cachedDiscoveredPath = targetPath;
      
      console.log(`[ComfyUIDaemon] 深度拉起引擎: ${targetPath ? `定位至后端 ${targetPath}` : "未找到本地路径，尝试全局 python 命令"}`);

      try {
        if (targetPath && targetPath.includes("||")) {
          const [pythonExe, mainPy] = targetPath.split("||");
          const child = spawn(pythonExe, [mainPy, "--listen", "127.0.0.1", "--port", "8188", "--api"], {
            detached: true,
            stdio: "ignore",
            cwd: path.dirname(mainPy),
          });
          child.unref();
        } else if (targetPath && targetPath.endsWith(".bat")) {
          const child = spawn("cmd.exe", ["/c", targetPath], {
            detached: true,
            stdio: "ignore",
            cwd: path.dirname(targetPath),
          });
          child.unref();
        } else if (targetPath && targetPath.endsWith(".exe")) {
          const child = spawn(targetPath, ["--listen", "127.0.0.1", "--port", "8188", "--api"], {
            detached: true,
            stdio: "ignore",
            cwd: path.dirname(targetPath),
          });
          child.unref();
        } else if (targetPath && targetPath.endsWith(".py")) {
          const child = spawn("python", [targetPath, "--listen", "127.0.0.1", "--port", "8188", "--api"], {
            detached: true,
            stdio: "ignore",
            cwd: path.dirname(targetPath),
          });
          child.unref();
        } else {
          const child = spawn("python", ["-m", "comfyui", "--listen", "127.0.0.1", "--port", "8188", "--api"], {
            detached: true,
            stdio: "ignore",
          });
          child.unref();
        }

        // 轮询等待最多 35 秒以允许 GPU 显存与离线模型节点加载
        for (let i = 0; i < 35; i++) {
          await new Promise(r => setTimeout(r, 1000));
          const check = await this.checkDaemonHealth();
          if (check.ok) {
            console.log(`[ComfyUIDaemon] 自动拉起 ComfyUI 服务成功: ${check.baseURL}`);
            return true;
          }
        }
      } catch (err) {
        console.error("[ComfyUIDaemon] 自动拉起 ComfyUI 进程失败:", err);
      }
      return false;
    })();

    try {
      await this.startingPromise;
    } finally {
      this.startingPromise = null;
    }

    const finalHealth = await this.checkDaemonHealth();
    if (finalHealth.ok) {
      finalHealth.autoStarted = true;
    }
    return finalHealth;
  }

  /**
   * 探测 ComfyUI 中已安装的 Checkpoint 模型名称
   */
  private async discoverCheckpoints(baseURL: string): Promise<string[]> {
    try {
      const res = await fetch(`${baseURL}/object_info/CheckpointLoaderSimple`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const data = (await res.json()) as any;
        const ckpts = data?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0];
        if (Array.isArray(ckpts) && ckpts.length > 0) {
          return ckpts;
        }
      }
    } catch {
      /* ignore */
    }
    try {
      const res = await fetch(`${baseURL}/v1/models`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const data = (await res.json()) as any;
        if (Array.isArray(data?.data)) {
          return data.data.map((m: any) => m.id || m.name);
        }
      }
    } catch {
      /* ignore */
    }
    return [];
  }

  /**
   * 全自动无缝等待并执行 ComfyUI 图像生成（绝不将模型下载误报为报错）
   */
  async generateImage(input: ImageProviderGenerateInput): Promise<ImageProviderGenerateResult> {
    const health = await this.ensureDaemonStarted();
    if (!health.ok) {
      throw new Error(`ComfyUI 自动探测与拉起超时。已定位后端引擎: ${health.discoveredPath || "未检测到"}。请确认 ComfyUI 可正常启动。`);
    }
    const baseURL = health.baseURL;

    // 1. 尝试 OpenAI 兼容 API (/v1/images/generations)
    const modelName = input.model || health.activeModel || "MiniMax-H3";
    try {
      const openAiRes = await fetch(`${baseURL}/v1/images/generations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelName,
          prompt: input.prompt,
          size: input.size,
          n: input.count || 1,
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (openAiRes.ok) {
        const payload = (await openAiRes.json()) as any;
        const images = payload?.data?.map((d: any) => ({
          url: d.url || (d.b64_json ? `data:image/png;base64,${d.b64_json}` : ""),
        })).filter((img: any) => Boolean(img.url));

        if (images && images.length > 0) {
          return { provider: "comfyui", model: modelName, images };
        }
      }
    } catch {
      /* 尝试原生 Workflow API */
    }

    // 2. 自动检测与全自动无缝下载 FLUX.1 模型权重（若本地缺失）
    const hasFlux = health.checkpoints.some(c => c.toLowerCase().includes("flux") || c.toLowerCase().includes("schnell"));
    if (!hasFlux) {
      const dir = health.checkpointsDir || discoverCheckpointsDir();
      if (dir) {
        console.log(`[ComfyUI] 检测到本地缺少 FLUX 高清大模型权重，全自动触发后台国内镜像下载中 (${dir})...`);
        try {
          await modelWeightDownloader.ensureModelDownloaded(dir);
          health.checkpoints = await this.discoverCheckpoints(baseURL);
        } catch (err: any) {
          console.warn(`[ComfyUI] 自动下载 FLUX 模型暂未就绪，降级使用当前可用本地权重:`, err.message);
        }
      }
    }

    // 3. 原生 ComfyUI /prompt 工作流引擎
    const [widthStr, heightStr] = (input.size || "1024x1024").split("x");
    const seed = Math.floor(Math.random() * 1000000000);

    const requested = (input.model || "flux").toLowerCase();
    const ckptFile = health.checkpoints.find(c => c.toLowerCase().includes(requested))
      || health.checkpoints.find(c => c.toLowerCase().includes("flux"))
      || health.checkpoints.find(c => c.toLowerCase().includes("schnell"))
      || health.checkpoints.find(c => c.toLowerCase().includes("dev"))
      || health.checkpoints[0];

    const isFlux = ckptFile.toLowerCase().includes("flux") || ckptFile.toLowerCase().includes("schnell");
    const targetWidth = parseInt(widthStr, 10) || 1024;
    const targetHeight = parseInt(heightStr, 10) || 1024;

    const workflowPrompt: Record<string, any> = {
      "4": {
        inputs: { ckpt_name: ckptFile },
        class_type: "CheckpointLoaderSimple",
      },
      "6": {
        inputs: { text: input.prompt, clip: ["4", 1] },
        class_type: "CLIPTextEncode",
      },
      "7": {
        inputs: { text: input.negativePrompt || "low quality, blurry, bad anatomy", clip: ["4", 1] },
        class_type: "CLIPTextEncode",
      },
    };

    if (isFlux) {
      // 原生 FLUX.1 1024x1536 4-step 高清直出
      workflowPrompt["3"] = {
        inputs: {
          seed,
          steps: 4,
          cfg: 1.0,
          sampler_name: "euler",
          scheduler: "simple",
          denoise: 1,
          model: ["4", 0],
          positive: ["6", 0],
          negative: ["7", 0],
          latent_image: ["5", 0],
        },
        class_type: "KSampler",
      };
      workflowPrompt["5"] = {
        inputs: { width: targetWidth, height: targetHeight, batch_size: input.count || 1 },
        class_type: "EmptyLatentImage",
      };
      workflowPrompt["8"] = {
        inputs: { samples: ["3", 0], vae: ["4", 2] },
        class_type: "VAEDecode",
      };
    } else {
      // SD 1.5 经典双阶段 Latent Hires Fix 潜空间放缩重构 (512x768 -> 1024x1536 细化)
      workflowPrompt["5"] = {
        inputs: { width: 512, height: 768, batch_size: input.count || 1 },
        class_type: "EmptyLatentImage",
      };
      workflowPrompt["3"] = {
        inputs: {
          seed,
          steps: 15,
          cfg: 7.0,
          sampler_name: "euler",
          scheduler: "normal",
          denoise: 1.0,
          model: ["4", 0],
          positive: ["6", 0],
          negative: ["7", 0],
          latent_image: ["5", 0],
        },
        class_type: "KSampler",
      };
      workflowPrompt["10"] = {
        inputs: {
          upscale_method: "nearest-exact",
          scale_by: 2.0,
          samples: ["3", 0],
        },
        class_type: "LatentUpscaleBy",
      };
      workflowPrompt["11"] = {
        inputs: {
          seed: seed + 1,
          steps: 10,
          cfg: 7.0,
          sampler_name: "euler",
          scheduler: "normal",
          denoise: 0.55,
          model: ["4", 0],
          positive: ["6", 0],
          negative: ["7", 0],
          latent_image: ["10", 0],
        },
        class_type: "KSampler",
      };
      workflowPrompt["8"] = {
        inputs: { samples: ["11", 0], vae: ["4", 2] },
        class_type: "VAEDecode",
      };
    }

    workflowPrompt["9"] = {
      inputs: { filename_prefix: "AI_Novel", images: ["8", 0] },
      class_type: "SaveImage",
    };

    const workflow = { prompt: workflowPrompt };

    const promptRes = await fetch(`${baseURL}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(workflow),
    });

    if (!promptRes.ok) {
      const errText = await promptRes.text();
      throw new Error(`ComfyUI /prompt 提交失败 (${promptRes.status}): ${errText}`);
    }

    const { prompt_id } = (await promptRes.json()) as { prompt_id: string };
    if (!prompt_id) throw new Error("ComfyUI 未返回 prompt_id");

    // 轮询 /history/{prompt_id} 等待生成完成
    const startTime = Date.now();
    while (Date.now() - startTime < 120000) {
      await new Promise(r => setTimeout(r, 1000));
      const histRes = await fetch(`${baseURL}/history/${prompt_id}`);
      if (histRes.ok) {
        const histData = (await histRes.json()) as any;
        const entry = histData?.[prompt_id];
        if (entry?.outputs?.["9"]?.images) {
          const imagesMeta = entry.outputs["9"].images;
          const imageResults = [];
          for (const img of imagesMeta) {
            const imgRes = await fetch(`${baseURL}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || "")}&type=${encodeURIComponent(img.type || "output")}`);
            if (imgRes.ok) {
              const arrayBuf = await imgRes.arrayBuffer();
              const base64 = Buffer.from(arrayBuf).toString("base64");
              const mime = img.filename.endsWith(".webp") ? "image/webp" : "image/png";
              imageResults.push({ url: `data:${mime};base64,${base64}` });
            }
          }
          if (imageResults.length > 0) {
            return { provider: "comfyui", model: ckptFile, images: imageResults };
          }
        }
      }
    }

    throw new Error("ComfyUI 生图超时（2分钟未完成）");
  }
}

export const comfyUIDaemonService = new ComfyUIDaemonService();
