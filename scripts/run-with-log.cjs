const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_LLM_RETENTION_DAYS = 14;
const DEFAULT_MAX_FILE_MB = 50;
const DEFAULT_MIN_AGE_HOURS = 24;
const HOURS_PER_DAY = 24;
const MS_PER_HOUR = 60 * 60 * 1000;
const BYTES_PER_MB = 1024 * 1024;

function sanitizeSegment(value) {
  return String(value || "session")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "session";
}

function parseArgs(argv) {
  const separatorIndex = argv.indexOf("--");
  const optionArgs = separatorIndex >= 0 ? argv.slice(0, separatorIndex) : argv;
  const commandArgs = separatorIndex >= 0 ? argv.slice(separatorIndex + 1) : [];

  const options = {
    name: "session",
    dir: path.resolve(process.cwd(), ".logs"),
    cleanup: readBoolean(process.env.AI_NOVEL_LOG_CLEANUP_ENABLED, true),
    retentionDays: readPositiveNumber(process.env.AI_NOVEL_LOG_RETENTION_DAYS, DEFAULT_RETENTION_DAYS),
    llmRetentionDays: readPositiveNumber(process.env.AI_NOVEL_LLM_LOG_RETENTION_DAYS, DEFAULT_LLM_RETENTION_DAYS),
    maxFileMb: readPositiveNumber(process.env.AI_NOVEL_LOG_MAX_FILE_MB, DEFAULT_MAX_FILE_MB),
    minAgeHours: readPositiveNumber(process.env.AI_NOVEL_LOG_MIN_AGE_HOURS, DEFAULT_MIN_AGE_HOURS),
    help: false,
    commandArgs,
  };

  for (let index = 0; index < optionArgs.length; index += 1) {
    const arg = optionArgs[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--name" && optionArgs[index + 1]) {
      options.name = sanitizeSegment(optionArgs[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--dir" && optionArgs[index + 1]) {
      options.dir = path.resolve(optionArgs[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--retention-days" && optionArgs[index + 1]) {
      options.retentionDays = readPositiveNumber(optionArgs[index + 1], options.retentionDays);
      index += 1;
      continue;
    }

    if (arg === "--llm-retention-days" && optionArgs[index + 1]) {
      options.llmRetentionDays = readPositiveNumber(optionArgs[index + 1], options.llmRetentionDays);
      index += 1;
      continue;
    }

    if (arg === "--max-file-mb" && optionArgs[index + 1]) {
      options.maxFileMb = readPositiveNumber(optionArgs[index + 1], options.maxFileMb);
      index += 1;
      continue;
    }

    if (arg === "--no-cleanup") {
      options.cleanup = false;
      continue;
    }
  }

  return options;
}

function readPositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readBoolean(value, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "on", "yes"].includes(normalized)) return true;
  if (["0", "false", "off", "no"].includes(normalized)) return false;
  return fallback;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatTimestampParts(date) {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  return {
    datePart: `${year}-${month}-${day}`,
    timePart: `${hours}-${minutes}-${seconds}`,
    isoLike: `${year}-${month}-${day}T${hours}-${minutes}-${seconds}`,
  };
}

function printHelp() {
  console.log(
    "Usage: node scripts/run-with-log.cjs [--name session] [--dir .logs] -- <command> [args...]",
  );
  console.log(
    "Options: --retention-days 30 --llm-retention-days 14 --max-file-mb 50 --no-cleanup",
  );
  console.log(
    "Example: node scripts/run-with-log.cjs --name server -- pnpm --filter @ai-novel/server dev",
  );
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeMeta(metaPath, meta) {
  fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
}

function appendChunk(logStream, targetStream, chunk) {
  targetStream.write(chunk);
  logStream.write(chunk);
}

function getLogFileKind(filePath) {
  const fileName = path.basename(filePath);
  if (fileName.endsWith(".llm-repair.jsonl")) return "llm-repair";
  if (fileName.endsWith(".llm.jsonl")) return "llm";
  if (fileName.endsWith(".log") || fileName.endsWith(".meta.json")) return "standard";
  return null;
}

function collectFiles(directoryPath, output) {
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const fullPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, output);
    } else if (entry.isFile()) {
      output.push(fullPath);
    }
  }
}

function shouldDeleteLogFile(kind, stat, options, nowMs) {
  const ageMs = nowMs - stat.mtimeMs;
  if (ageMs < options.minAgeHours * MS_PER_HOUR) {
    return false;
  }
  const retentionDays = kind === "llm" ? options.llmRetentionDays : options.retentionDays;
  return ageMs > retentionDays * HOURS_PER_DAY * MS_PER_HOUR;
}

function cleanupLogDirectory(options) {
  const summary = {
    scannedFiles: 0,
    deletedFiles: 0,
    skippedFiles: 0,
    failedFiles: 0,
    deletedBytes: 0,
  };
  if (!options.cleanup || !fs.existsSync(options.dir)) {
    return summary;
  }
  const files = [];
  collectFiles(options.dir, files);
  const nowMs = Date.now();
  for (const filePath of files) {
    const kind = getLogFileKind(filePath);
    if (!kind) {
      summary.skippedFiles += 1;
      continue;
    }
    summary.scannedFiles += 1;
    try {
      const stat = fs.statSync(filePath);
      if (!shouldDeleteLogFile(kind, stat, options, nowMs)) {
        continue;
      }
      fs.unlinkSync(filePath);
      summary.deletedFiles += 1;
      summary.deletedBytes += stat.size;
    } catch (error) {
      summary.failedFiles += 1;
      console.warn(`[run-with-log] cleanup failed for ${filePath}: ${error.message || error}`);
    }
  }
  return summary;
}

function rotateFileIfNeeded(filePath, maxFileMb) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const stat = fs.statSync(filePath);
  if (stat.size <= maxFileMb * BYTES_PER_MB) {
    return null;
  }
  const directoryPath = path.dirname(filePath);
  const fileName = path.basename(filePath);
  const knownSuffix = [".llm-repair.jsonl", ".llm.jsonl", ".meta.json", ".log"]
    .find((suffix) => fileName.endsWith(suffix));
  const extension = knownSuffix || path.extname(filePath);
  const baseName = extension ? fileName.slice(0, -extension.length) : fileName;
  const stamp = formatTimestampParts(new Date()).isoLike;
  let rotatedPath = path.join(directoryPath, `${baseName}-${stamp}${extension}`);
  let suffix = 1;
  while (fs.existsSync(rotatedPath)) {
    rotatedPath = path.join(directoryPath, `${baseName}-${stamp}-${suffix}${extension}`);
    suffix += 1;
  }
  fs.renameSync(filePath, rotatedPath);
  return rotatedPath;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (!Array.isArray(options.commandArgs) || options.commandArgs.length === 0) {
    printHelp();
    throw new Error("Missing command after `--`.");
  }

  const startedAt = new Date();
  const { datePart, isoLike } = formatTimestampParts(startedAt);
  const sessionDir = path.join(options.dir, datePart);
  const cleanupSummary = cleanupLogDirectory(options);
  if (cleanupSummary.deletedFiles > 0 || cleanupSummary.failedFiles > 0) {
    console.log(
      `[run-with-log] cleanup deletedFiles=${cleanupSummary.deletedFiles} deletedBytes=${cleanupSummary.deletedBytes} failedFiles=${cleanupSummary.failedFiles}`,
    );
  }
  ensureDir(sessionDir);

  const baseName = `${isoLike}-${options.name}`;
  const logPath = path.join(sessionDir, `${baseName}.log`);
  const metaPath = path.join(sessionDir, `${baseName}.meta.json`);
  const llmLogPath = path.join(sessionDir, `${baseName}.llm.jsonl`);
  const llmRepairLogPath = path.join(sessionDir, `${baseName}.llm-repair.jsonl`);
  rotateFileIfNeeded(logPath, options.maxFileMb);
  rotateFileIfNeeded(llmLogPath, options.maxFileMb);
  rotateFileIfNeeded(llmRepairLogPath, options.maxFileMb);
  const logStream = fs.createWriteStream(logPath, { flags: "a" });

  const meta = {
    name: options.name,
    startedAt: startedAt.toISOString(),
    cwd: process.cwd(),
    command: options.commandArgs,
    logPath,
    metaPath,
    llmLogPath,
    llmRepairLogPath,
  };
  writeMeta(metaPath, meta);

  console.log(`[run-with-log] writing log to ${logPath}`);
  logStream.write(`[run-with-log] started at ${meta.startedAt}\n`);
  logStream.write(`[run-with-log] cwd ${meta.cwd}\n`);
  logStream.write(`[run-with-log] command ${options.commandArgs.join(" ")}\n\n`);

  const child = spawn(options.commandArgs[0], options.commandArgs.slice(1), {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RUN_WITH_LOG_DIR: sessionDir,
      RUN_WITH_LOG_DATE: datePart,
      RUN_WITH_LOG_NAME: options.name,
      RUN_WITH_LOG_BASE_NAME: baseName,
      RUN_WITH_LOG_PATH: logPath,
      RUN_WITH_LOG_META_PATH: metaPath,
      RUN_WITH_LOG_LLM_PATH: llmLogPath,
      RUN_WITH_LOG_LLM_REPAIR_PATH: llmRepairLogPath,
    },
    shell: process.platform === "win32",
    stdio: ["inherit", "pipe", "pipe"],
  });

  if (child.stdout) {
    child.stdout.on("data", (chunk) => appendChunk(logStream, process.stdout, chunk));
  }
  if (child.stderr) {
    child.stderr.on("data", (chunk) => appendChunk(logStream, process.stderr, chunk));
  }

  let settled = false;
  const finalize = (exitCode, signal, error) => {
    if (settled) {
      return;
    }
    settled = true;

    const finishedAt = new Date();
    const finalMeta = {
      ...meta,
      finishedAt: finishedAt.toISOString(),
      exitCode: typeof exitCode === "number" ? exitCode : null,
      signal: signal ?? null,
      error: error ? String(error.message || error) : null,
    };
    writeMeta(metaPath, finalMeta);

    if (error) {
      logStream.write(`\n[run-with-log] failed: ${finalMeta.error}\n`);
    } else {
      logStream.write(
        `\n[run-with-log] finished at ${finalMeta.finishedAt} exitCode=${finalMeta.exitCode} signal=${finalMeta.signal ?? "none"}\n`,
      );
    }

    logStream.end(() => {
      if (error) {
        console.error(`[run-with-log] ${finalMeta.error}`);
        process.exit(1);
        return;
      }
      process.exit(typeof exitCode === "number" ? exitCode : 1);
    });
  };

  child.on("error", (error) => finalize(null, null, error));
  child.on("close", (code, signal) => finalize(code, signal, null));

  const forwardSignal = (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };

  process.on("SIGINT", () => forwardSignal("SIGINT"));
  process.on("SIGTERM", () => forwardSignal("SIGTERM"));
}

main().catch((error) => {
  console.error(`[run-with-log] ${error.message}`);
  process.exit(1);
});
