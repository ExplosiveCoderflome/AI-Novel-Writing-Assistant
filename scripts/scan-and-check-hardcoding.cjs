const fs = require("fs");
const path = require("path");

const WORKSPACE_ROOT = path.resolve(__dirname, "..");
const TARGET_DIRS = [
  path.join(WORKSPACE_ROOT, "client", "src"),
  path.join(WORKSPACE_ROOT, "server", "src"),
];

const IGNORE_PATTERNS = [
  "node_modules",
  "dist",
  "build",
  ".git",
  "imageModelRegistry.ts",
  "providers.ts",
  "check-i18n-hardcoded.cjs",
  "scan-and-extract-i18n.cjs",
  "scan-and-check-hardcoding.cjs",
];

const PATTERNS = [
  {
    name: "MODEL_PROVIDER_HARDCODED",
    regex: /(?:provider|model)\s*[:=]\s*["'](gpt-4|claude-3|deepseek-chat|qwen-max|sensenova|comfyui)/i,
    recommendation: "使用 imageModelRegistry 或后端 modelRouter 探索注册项，避免写死 Provider/Model 字符串",
  },
  {
    name: "MAGIC_LIMIT_BOUND",
    regex: /Math\.(?:max|min)\(\s*\d{3,5}\s*,|\s*(?:targetWordCount|wordCount)\s*[:=]\s*\d{3,5}/,
    recommendation: "收敛至 STRUCTURED_CHAPTER_BOUNDS 或业务配置常量，避免散落魔数",
  },
];

function getAllFiles(dirPath, arrayOfFiles = []) {
  if (!fs.existsSync(dirPath)) return arrayOfFiles;
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (IGNORE_PATTERNS.some((pattern) => fullPath.includes(pattern))) {
      return;
    }
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else if (/\.(ts|tsx|js|jsx)$/.test(file)) {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

function scanFiles() {
  const findings = [];
  let fileList = [];
  TARGET_DIRS.forEach((dir) => {
    fileList = fileList.concat(getAllFiles(dir));
  });

  fileList.forEach((filePath) => {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const relativePath = path.relative(WORKSPACE_ROOT, filePath);

    lines.forEach((line, index) => {
      PATTERNS.forEach((pattern) => {
        if (pattern.regex.test(line)) {
          // Ignore comments or test files
          if (line.trim().startsWith("//") || line.trim().startsWith("/*") || relativePath.includes(".test.")) {
            return;
          }
          findings.push({
            file: relativePath,
            line: index + 1,
            patternName: pattern.name,
            lineContent: line.trim(),
            recommendation: pattern.recommendation,
          });
        }
      });
    });
  });

  return findings;
}

const findings = scanFiles();

console.log(`\n================ 硬编码与逻辑耦合全量静态扫描报告 ================`);
console.log(`已扫描目标目录: client/src, server/src`);
console.log(`发现潜在逻辑硬编码项: ${findings.length} 处\n`);

if (findings.length > 0) {
  findings.forEach((item, idx) => {
    console.log(`[${idx + 1}] ${item.patternName} - ${item.file}:${item.line}`);
    console.log(`    代码: ${item.lineContent}`);
    console.log(`    建议: ${item.recommendation}\n`);
  });
} else {
  console.log(`✅ 未发现高风险的逻辑硬编码与硬写供应商问题！`);
}
