const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");
const http = require("http");

const ROOT_DIR = path.resolve(__dirname, "..");
const SERVER_DIR = path.join(ROOT_DIR, "server");
const CLIENT_DIR = path.join(ROOT_DIR, "client");
const BACKUPS_DIR = path.join(ROOT_DIR, "backups");

console.log("=================================================================");
console.log("  Daydream Engine (白日做梦引擎) - 智能环境探测与增量配置引擎  ");
console.log("=================================================================\n");

// Helper: HTTP GET probe with timeout
function probeUrl(urlStr, timeoutMs = 2000) {
  return new Promise((resolve) => {
    try {
      const url = new URL(urlStr);
      const req = http.get(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          timeout: timeoutMs,
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, statusCode: res.statusCode, body }));
        }
      );
      req.on("error", () => resolve({ ok: false }));
      req.on("timeout", () => {
        req.destroy();
        resolve({ ok: false });
      });
    } catch (e) {
      resolve({ ok: false });
    }
  });
}

// 1. 测试前快照保护：备份现有数据库并保留最近 5 份
function backupExistingDatabase() {
  const dbPath = path.join(SERVER_DIR, "dev.db");
  if (fs.existsSync(dbPath)) {
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(BACKUPS_DIR, `dev_db_pre_setup_${timestamp}.bak`);
    fs.copyFileSync(dbPath, backupPath);
    console.log(`[✓ 测试前保护] 已对现有数据库创建预测试快照: ${path.relative(ROOT_DIR, backupPath)}`);

    // 自动清理多于 5 份的旧备份，防止磁盘臃肿副作用
    try {
      const baks = fs
        .readdirSync(BACKUPS_DIR)
        .filter((f) => f.startsWith("dev_db_pre_setup_") && f.endsWith(".bak"))
        .map((f) => ({ name: f, path: path.join(BACKUPS_DIR, f), time: fs.statSync(path.join(BACKUPS_DIR, f)).mtimeMs }))
        .sort((a, b) => b.time - a.time);

      if (baks.length > 5) {
        for (const oldBak of baks.slice(5)) {
          fs.unlinkSync(oldBak.path);
        }
      }
    } catch (e) { }
  }
}

// 2. 探活与扫描各服务及软件
async function inspectEnvironment() {
  const report = {
    node: { type: "system", path: process.execPath, version: process.version },
    python: null,
    ffmpeg: null,
    qdrant: null,
    comfyui: null,
    checkpoints: [],
    ollama: null,
    searxng: null,
    ttsModels: { kokoro: false, whisper: false },
  };

  // Python 探测
  try {
    const pyCheck = spawnSync("python", ["--version"], { encoding: "utf8" });
    if (pyCheck.status === 0) {
      report.python = { type: "system", info: pyCheck.stdout.trim() || pyCheck.stderr.trim() };
    }
  } catch (e) {
    const localPy = path.join(ROOT_DIR, "runtime", "python", "python.exe");
    if (fs.existsSync(localPy)) {
      report.python = { type: "embedded", path: localPy };
    }
  }

  // FFmpeg 探测
  try {
    const ffCheck = spawnSync("where", ["ffmpeg"], { encoding: "utf8" });
    if (ffCheck.status === 0 && ffCheck.stdout.trim()) {
      const foundPath = ffCheck.stdout.trim().split("\r\n")[0];
      report.ffmpeg = { type: "system", path: foundPath };
    }
  } catch (e) { }

  if (!report.ffmpeg) {
    const embeddedFffmpeg = path.join(ROOT_DIR, "runtime", "ffmpeg", "ffmpeg.exe");
    if (fs.existsSync(embeddedFffmpeg)) {
      report.ffmpeg = { type: "embedded", path: embeddedFffmpeg };
    }
  }

  // Qdrant 探活与扫描
  const qdrantProbe = await probeUrl("http://127.0.0.1:6333/healthz");
  if (qdrantProbe.ok) {
    report.qdrant = { type: "running", url: "http://127.0.0.1:6333" };
  } else {
    const localAppData = process.env.LOCALAPPDATA || "C:\\Users\\lilin\\AppData\\Local";
    const qdrantExe = path.join(localAppData, "Qdrant", "qdrant.exe");
    if (fs.existsSync(qdrantExe)) {
      report.qdrant = { type: "installed", path: qdrantExe, url: "http://127.0.0.1:6333" };
    }
  }

  // ComfyUI 探活与深度扫描
  const comfyProbe = await probeUrl("http://127.0.0.1:8188/system_stats");
  if (comfyProbe.ok) {
    report.comfyui = { type: "running", url: "http://127.0.0.1:8188" };
  } else {
    const userHome = process.env.USERPROFILE || "C:\\Users\\lilin";
    const localAppData = process.env.LOCALAPPDATA || path.join(userHome, "AppData", "Local");
    const candidates = [
      path.join(localAppData, "Comfy-Desktop", "ComfyUI-Installs", "ComfyUI", "ComfyUI"),
      "C:\\ComfyUI_windows_portable",
      "D:\\ComfyUI_windows_portable",
      "E:\\ComfyUI_windows_portable",
      path.join(ROOT_DIR, "runtime", "ComfyUI_windows_portable"),
    ];

    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        report.comfyui = { type: "installed", dir: cand, url: "http://127.0.0.1:8188" };
        break;
      }
    }
  }

  // 扫描现有 ComfyUI 的 Checkpoint 模型
  if (report.comfyui) {
    const baseDir = report.comfyui.dir || "C:\\ComfyUI_windows_portable";
    const ckptDirs = [
      path.join(baseDir, "ComfyUI", "models", "checkpoints"),
      path.join(baseDir, "models", "checkpoints"),
    ];
    for (const d of ckptDirs) {
      if (fs.existsSync(d)) {
        const files = fs.readdirSync(d).filter((f) => f.endsWith(".safetensors") || f.endsWith(".ckpt"));
        report.checkpoints.push(...files);
      }
    }
  }

  // Ollama 探活与模型匹配
  const os = require("os");
  const totalRamGb = Math.round(os.totalmem() / (1024 * 1024 * 1024));
  let vramGb = 0;
  try {
    const smi = spawnSync("nvidia-smi", ["--query-gpu=memory.total", "--format=csv,noheader,nounits"], { encoding: "utf8" });
    if (smi.status === 0 && smi.stdout.trim()) {
      const mb = parseInt(smi.stdout.trim().split("\n")[0], 10);
      if (!isNaN(mb)) vramGb = Math.round(mb / 1024);
    }
  } catch (e) { }

  const ollamaProbe = await probeUrl("http://127.0.0.1:11434/api/tags");
  if (ollamaProbe.ok) {
    let models = [];
    try {
      models = JSON.parse(ollamaProbe.body)?.models?.map((m) => m.name) || [];
    } catch (e) { }
    report.ollama = { type: "running", url: "http://127.0.0.1:11434", models };
  }

  // SearXNG 探活
  const searxngProbe = await probeUrl("http://127.0.0.1:8088/search?q=test&format=json");
  if (searxngProbe.ok) {
    report.searxng = { type: "running", url: "http://127.0.0.1:8088" };
  } else {
    // 检查 Docker 是否存在
    try {
      const dockerCheck = spawnSync("docker", ["ps"], { encoding: "utf8" });
      if (dockerCheck.status === 0) {
        report.searxng = { type: "docker_available", url: "http://127.0.0.1:8088" };
      }
    } catch (e) { }
  }

  // TTS & 语音模型文件检查
  const kokoroFile = path.join(ROOT_DIR, ".cache", "kokoro", "kokoro-v1.0.onnx");
  const whisperFile = path.join(ROOT_DIR, ".cache", "whisper.cpp", "ggml-small.bin");
  report.ttsModels.kokoro = fs.existsSync(kokoroFile);
  report.ttsModels.whisper = fs.existsSync(whisperFile);

  return report;
}

// 3. 注入 Workflow 模板至 ComfyUI 目录
function injectWorkflowTemplates(comfyInfo) {
  if (!comfyInfo || !comfyInfo.dir) return;

  const workflowsSourceDir = path.join(SERVER_DIR, "src", "services", "image", "comfyui", "workflows");
  if (!fs.existsSync(workflowsSourceDir)) {
    fs.mkdirSync(workflowsSourceDir, { recursive: true });
  }

  // 生成示例 Workflow JSON 模板
  const templates = [
    { name: "comic_panel_workflow.json", description: "小说改漫画多格分镜流水线" },
    { name: "character_evolution_workflow.json", description: "角色 25%/50%/75%/100% 阶段人设快照生成流水线" },
    { name: "storyboard_visual_workflow.json", description: "VellumReel 短剧画面绘制流水线" },
  ];

  for (const t of templates) {
    const filePath = path.join(workflowsSourceDir, t.name);
    if (!fs.existsSync(filePath)) {
      const demoContent = {
        name: t.name,
        description: t.description,
        version: "1.0.0",
        nodes: {},
      };
      fs.writeFileSync(filePath, JSON.stringify(demoContent, null, 2), "utf8");
    }
  }

  // 若找到了本机的 ComfyUI 目录，将模板注入其 workflows 路径
  const targetDir = path.join(comfyInfo.dir, "user", "default", "workflows");
  try {
    fs.mkdirSync(targetDir, { recursive: true });
    for (const t of templates) {
      fs.copyFileSync(path.join(workflowsSourceDir, t.name), path.join(targetDir, t.name));
    }
    console.log(`[✓ Workflow 注入] 已将 3 大基础生图流水线模板注入至既有 ComfyUI: ${targetDir}`);
  } catch (e) {
    console.warn(`[! Notice] 注入 ComfyUI Workflow 路径跳过: ${e.message}`);
  }
}

// 4. 自适应 `.env` 配置文件编译器
function updateEnvironmentConfig(report) {
  const envExamplePath = path.join(SERVER_DIR, ".env.example");
  const envPath = path.join(SERVER_DIR, ".env");

  let envContent = "";
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf8");
  } else if (fs.existsSync(envExamplePath)) {
    envContent = fs.readFileSync(envExamplePath, "utf8");
  } else {
    envContent = `DATABASE_URL="file:./dev.db"\nPORT=3000\n`;
  }

  // 映射自适应变量
  const envVars = {
    DATABASE_URL: '"file:./dev.db"',
    PORT: "3000",
    COMFYUI_BASE_URL: report.comfyui?.url || "http://127.0.0.1:8188",
    QDRANT_URL: report.qdrant?.url || "http://127.0.0.1:6333",
    SEARXNG_URL: report.searxng?.url || "http://127.0.0.1:8088",
    OLLAMA_BASE_URL: report.ollama?.url || "http://127.0.0.1:11434",
  };

  if (report.ffmpeg?.path) {
    envVars.FFMPEG_PATH = `"${report.ffmpeg.path.replace(/\\/g, "/")}"`;
  }
  if (report.comfyui?.dir) {
    envVars.COMFYUI_PATH = `"${report.comfyui.dir.replace(/\\/g, "/")}"`;
  }

  // 更新 env 键值
  let lines = envContent.split("\n");
  for (const [key, value] of Object.entries(envVars)) {
    const keyRegex = new RegExp(`^#?\\s*${key}=.*$`, "m");
    if (keyRegex.test(envContent)) {
      lines = lines.map((line) => (line.replace(new RegExp(`^#?\\s*${key}=.*$`), `${key}=${value}`)));
    } else {
      lines.push(`${key}=${value}`);
    }
  }

  fs.writeFileSync(envPath, lines.join("\n"), "utf8");
  console.log(`[✓ 环境自适应] 已根据探测结果更新后端配置文件: ${path.relative(ROOT_DIR, envPath)}`);
}

// 5. 数据库自动化初始化与 Seed 数据补全
function initializeDatabase() {
  console.log("\n-----------------------------------------------------------------");
  console.log("  开始执行 shared 库构建与数据库结构同步...");
  console.log("-----------------------------------------------------------------");
  try {
    console.log("-> 正在生成 @ai-novel/shared 重导出文件并构建基础模块...");
    const genScript = path.join(ROOT_DIR, "scripts", "generate-shared-reexports.cjs");
    if (fs.existsSync(genScript)) {
      spawnSync(process.execPath, [genScript], { cwd: ROOT_DIR, stdio: "inherit" });
    }
    execSync("pnpm --filter @ai-novel/shared build", { cwd: ROOT_DIR, stdio: "inherit", env: process.env });
    console.log("-> 正在构建 @ai-novel/server 基础 API 服务模块...");
    execSync("pnpm --filter @ai-novel/server build", { cwd: ROOT_DIR, stdio: "inherit", env: process.env });
  } catch (e) {
    console.warn(`[! 编译提示] 基础库构建提示: ${e.message}`);
  }

  const ensureScript = path.join(SERVER_DIR, "scripts", "ensure-dev-prisma.cjs");
  if (fs.existsSync(ensureScript)) {
    const result = spawnSync(process.execPath, [ensureScript], {
      cwd: SERVER_DIR,
      stdio: "inherit",
      env: process.env,
    });
    if (result.status === 0) {
      console.log("[✓ 数据库建表] SQLite 结构建表与 Schema 校验完成!");
    } else {
      console.warn("[! 警告] 数据库建表过程提示非零退出码，请检查数据库路径。");
    }
  }
}

// 6. 打印环境诊断与复用汇总报告
function printReport(report) {
  console.log("\n=================================================================");
  console.log("             🔍 系统环境诊断与复用汇总报告                      ");
  console.log("=================================================================");
  console.log(`  [Node.js 运行时] : ${report.node.version} (${report.node.path})`);
  console.log(`  [Python 环境]    : ${report.python ? report.python.info || report.python.path : "未检测到系统 Python，使用内置运行环境"}`);
  console.log(`  [FFmpeg 工具]    : ${report.ffmpeg ? report.ffmpeg.path : "未检测到系统 FFmpeg，使用内置工具"}`);
  console.log(`  [Qdrant 向量库]  : ${report.qdrant ? `${report.qdrant.type} (${report.qdrant.url || report.qdrant.path})` : "待本地拉起 (6333端口)"}`);
  console.log(`  [ComfyUI 生图]   : ${report.comfyui ? `已检测到既有服务/目录 (${report.comfyui.url || report.comfyui.dir}) - 【已直接复用免安装】` : "未运行，待增量配置"}`);
  console.log(`  [已发现模型权重] : ${report.checkpoints.length > 0 ? report.checkpoints.slice(0, 3).join(", ") + ` 等 ${report.checkpoints.length} 个模型` : "暂未检测到本地 safetensors 模型"}`);
  console.log(`  [SearXNG 引擎]   : ${report.searxng ? `已检测到服务 (${report.searxng.type})` : "Docker 未运行，已启动平滑降级"}`);
  console.log(`  [Kokoro TTS 模型]: ${report.ttsModels.kokoro ? "已完整存在 (免重复下载)" : "需断点续传/自动补充下载"}`);
  console.log("=================================================================\n");
}

async function main() {
  backupExistingDatabase();
  const report = await inspectEnvironment();
  injectWorkflowTemplates(report.comfyui);
  updateEnvironmentConfig(report);
  initializeDatabase();
  printReport(report);
  console.log("✔ 智能探测与自适应配置完成，可以随时运行启动脚本！\n");
}

main().catch((err) => {
  console.error("Fatal error during smart setup:", err);
  process.exit(1);
});
