const fs = require("fs");
const path = require("path");

// 启动前的依赖完整性防呆检查：面向从源码运行的使用者（含非专业开发者）。
// 只做直接依赖的存在性检查（pnpm 会为每个 workspace 包创建 node_modules 符号链接），
// 不做版本比对——版本漂移由 pnpm-lock.yaml 保证，这里只拦截"拉了新代码忘了装依赖"。

const ROOT = path.resolve(__dirname, "..");

const WORKSPACE_PACKAGES = [
  { name: "根目录", dir: "." },
  { name: "shared", dir: "shared" },
  { name: "server", dir: "server" },
  { name: "client", dir: "client" },
];

function collectMissingDeps(packageDir) {
  const packageJsonPath = path.join(ROOT, packageDir, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return [];
  }
  const manifest = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const declared = {
    ...(manifest.dependencies ?? {}),
    ...(manifest.devDependencies ?? {}),
  };
  const nodeModulesDir = path.join(ROOT, packageDir, "node_modules");
  return Object.keys(declared).filter((depName) => {
    return !fs.existsSync(path.join(nodeModulesDir, ...depName.split("/")));
  });
}

const problems = [];
for (const pkg of WORKSPACE_PACKAGES) {
  const missing = collectMissingDeps(pkg.dir);
  if (missing.length > 0) {
    problems.push({ package: pkg.name, missing });
  }
}

if (problems.length === 0) {
  process.exit(0);
}

const lines = [
  "",
  "==============================================",
  "  依赖未安装或不完整，项目还不能启动",
  "==============================================",
  "",
  "检测到以下依赖缺失：",
];
for (const problem of problems) {
  const preview = problem.missing.slice(0, 5).join("、");
  const suffix = problem.missing.length > 5 ? ` 等 ${problem.missing.length} 个` : "";
  lines.push(`  - [${problem.package}] ${preview}${suffix}`);
}
lines.push(
  "",
  "这是正常情况：更新代码（git pull）后新增的依赖需要重新安装。",
  "请在项目根目录执行下面这一条命令，然后重新启动：",
  "",
  "  pnpm install",
  "",
  "如果没有安装 pnpm，先执行：npm install -g pnpm",
  "",
);
console.error(lines.join("\n"));
process.exit(1);
