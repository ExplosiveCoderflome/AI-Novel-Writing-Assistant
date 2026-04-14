const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

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
  }

  return options;
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
  ensureDir(sessionDir);

  const baseName = `${isoLike}-${options.name}`;
  const logPath = path.join(sessionDir, `${baseName}.log`);
  const metaPath = path.join(sessionDir, `${baseName}.meta.json`);
  const llmLogPath = path.join(sessionDir, `${baseName}.llm.jsonl`);
  const llmRepairLogPath = path.join(sessionDir, `${baseName}.llm-repair.jsonl`);
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
