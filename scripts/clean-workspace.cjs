const fs = require("fs");
const path = require("path");
const { spawnSync, execSync } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const SERVER_DIR = path.join(ROOT_DIR, "server");
const CLIENT_DIR = path.join(ROOT_DIR, "client");
const SHARED_DIR = path.join(ROOT_DIR, "shared");

console.log("=================================================================");
console.log("  Daydream Engine (白日做梦引擎) - 全项目深度重置与清理引擎  ");
console.log("=================================================================\n");

function removeFileOrDir(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  try {
    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      fs.rmSync(targetPath, { recursive: true, force: true });
      console.log(`[✓ 已删除目录] ${path.relative(ROOT_DIR, targetPath)}`);
    } else {
      fs.unlinkSync(targetPath);
      console.log(`[✓ 已删除文件] ${path.relative(ROOT_DIR, targetPath)}`);
    }
  } catch (e) {
    console.warn(`[! 删除警告] ${path.relative(ROOT_DIR, targetPath)}: ${e.message}`);
  }
}

function cleanDirectoryContents(dirPath, preserveFiles = []) {
  if (!fs.existsSync(dirPath)) return;
  try {
    const entries = fs.readdirSync(dirPath);
    for (const entry of entries) {
      if (preserveFiles.includes(entry)) continue;
      const fullPath = path.join(dirPath, entry);
      removeFileOrDir(fullPath);
    }
    console.log(`[✓ 已清空目录内容] ${path.relative(ROOT_DIR, dirPath)}`);
  } catch (e) {
    console.warn(`[! 清空警告] ${path.relative(ROOT_DIR, dirPath)}: ${e.message}`);
  }
}

// 1. 安全快照备份 (以防万一)
function createSafetyArchive() {
  const dbPath = path.join(SERVER_DIR, "dev.db");
  const backupsDir = path.join(ROOT_DIR, "backups");
  if (fs.existsSync(dbPath)) {
    if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
    const archivePath = path.join(backupsDir, `archive_before_clean_reset_${Date.now()}.db`);
    try {
      fs.copyFileSync(dbPath, archivePath);
      console.log(`[✓ 基础备份完成] 已自动留存紧急快照: ${path.relative(ROOT_DIR, archivePath)}`);
    } catch (e) {}
  }
}

// 2. 清理冗余 SQLite 数据库与事务文件
function cleanDatabases() {
  console.log("\n--- [Step 1/5] 清理冗余 SQLite 数据库及事务锁文件 ---");
  const dbs = [
    path.join(SERVER_DIR, "dev.db"),
    path.join(SERVER_DIR, "dev.db-shm"),
    path.join(SERVER_DIR, "dev.db-wal"),
    path.join(SERVER_DIR, "dev.db.backup"),
    path.join(SERVER_DIR, "dev.db.backup_e2e_clean"),
    path.join(SERVER_DIR, "dev.db.task_backup"),
    path.join(SERVER_DIR, "dev-backup-world-sandbox.db"),
    path.join(SERVER_DIR, "test-run.db"),
    path.join(SERVER_DIR, "src", "dev.db"),
  ];

  for (const db of dbs) {
    removeFileOrDir(db);
  }
}

// 3. 清理生成的画廊图片与短剧中间产物
function cleanGeneratedAssets() {
  console.log("\n--- [Step 2/5] 清理生成的画廊图片与短剧中间产物 ---");
  cleanDirectoryContents(path.join(SERVER_DIR, "storage"));
  cleanDirectoryContents(path.join(SERVER_DIR, "public", "assets", "projects"));
  cleanDirectoryContents(path.join(ROOT_DIR, "tools", "vellum-reel", "out"));
  cleanDirectoryContents(path.join(ROOT_DIR, "tools", "vellum-reel", "public", "assets", "projects"));
}

// 4. 清理日志、临时缓存与测试草稿
function cleanLogsAndScratch() {
  console.log("\n--- [Step 3/5] 清理运行日志、临时缓存与草稿文件 ---");
  removeFileOrDir(path.join(ROOT_DIR, ".logs"));
  removeFileOrDir(path.join(SERVER_DIR, ".tmp"));
  removeFileOrDir(path.join(SERVER_DIR, "scratch"));
  
  // 保留 scratch/searxng/settings.yml
  const scratchDir = path.join(ROOT_DIR, "scratch");
  if (fs.existsSync(scratchDir)) {
    const entries = fs.readdirSync(scratchDir);
    for (const entry of entries) {
      if (entry === "searxng") continue;
      removeFileOrDir(path.join(scratchDir, entry));
    }
  }
}

// 5. 清理前后端编译构件
function cleanBuildArtifacts() {
  console.log("\n--- [Step 4/5] 清理前后端 Build 编译输出目录 ---");
  removeFileOrDir(path.join(CLIENT_DIR, "dist"));
  removeFileOrDir(path.join(SERVER_DIR, "dist"));
  removeFileOrDir(path.join(SHARED_DIR, "dist"));
}

// 6. 重建 100% 干净的数据库与种子数据
function rebuildFreshDatabase() {
  console.log("\n--- [Step 5/5] 重建全新 100% 干净数据库与 Seed 种子数据 ---");
  console.log("-> 编译共享库 @ai-novel/shared...");
  try {
    execSync("pnpm --filter @ai-novel/shared build", { cwd: ROOT_DIR, stdio: "inherit", env: process.env });
  } catch (e) {
    console.warn(`[! 编译警告] shared 构建提示: ${e.message}`);
  }

  const ensureScript = path.join(SERVER_DIR, "scripts", "ensure-dev-prisma.cjs");
  if (fs.existsSync(ensureScript)) {
    console.log("-> 运行 Prisma Schema 建表...");
    spawnSync(process.execPath, [ensureScript], {
      cwd: SERVER_DIR,
      stdio: "inherit",
      env: process.env,
    });
  }

  console.log("-> 灌入全新 Prompt 注册表、TELOS 美学预设与系统种子数据...");
  try {
    execSync("pnpm --filter @ai-novel/server db:seed", {
      cwd: ROOT_DIR,
      stdio: "inherit",
      env: process.env,
    });
    console.log("[✓ 种子填充成功] 干净数据库已初始化完成!");
  } catch (e) {
    console.warn(`[! 种子填充提示] ${e.message}`);
  }
}

async function main() {
  createSafetyArchive();
  cleanDatabases();
  cleanGeneratedAssets();
  cleanLogsAndScratch();
  cleanBuildArtifacts();
  rebuildFreshDatabase();

  console.log("\n-----------------------------------------------------------------");
  console.log("  刷新环境配置与运行探活诊断...");
  console.log("-----------------------------------------------------------------");
  const setupScript = path.join(ROOT_DIR, "scripts", "smart-environment-setup.cjs");
  if (fs.existsSync(setupScript)) {
    spawnSync(process.execPath, [setupScript], { cwd: ROOT_DIR, stdio: "inherit" });
  }

  console.log("\n=================================================================");
  console.log("  ✔ 全项目重置完成！数据库与临时文件已全部清空。");
  console.log("  随时可以运行 [2-一键启动.bat] 进行全新的从头测试！");
  console.log("=================================================================\n");
}

main().catch((err) => {
  console.error("Fatal error during workspace cleanup:", err);
  process.exit(1);
});
