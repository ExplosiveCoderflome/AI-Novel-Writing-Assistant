import fs from "fs";
import path from "path";

const LOG_TRUE_VALUES = new Set(["1", "true", "on", "yes"]);
const LOG_FALSE_VALUES = new Set(["0", "false", "off", "no"]);

let cachedLogPath: string | null | undefined;
let cachedRepairLogPath: string | null | undefined;
let announcedLogPath: string | null = null;
let announcedRepairLogPath: string | null = null;

function toJsonSafeValue(value: unknown): unknown {
  if (value == null) {
    return value;
  }
  if (
    typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ?? null,
    };
  }
  if (Array.isArray(value)) {
    return value.map((entry) => toJsonSafeValue(entry));
  }
  if (typeof value === "object") {
    const seen = new WeakSet<object>();
    const visit = (current: unknown): unknown => {
      if (current == null) {
        return current;
      }
      if (
        typeof current === "string"
        || typeof current === "number"
        || typeof current === "boolean"
      ) {
        return current;
      }
      if (typeof current === "bigint") {
        return current.toString();
      }
      if (current instanceof Error) {
        return {
          name: current.name,
          message: current.message,
          stack: current.stack ?? null,
        };
      }
      if (Array.isArray(current)) {
        return current.map((entry) => visit(entry));
      }
      if (typeof current === "object") {
        if (seen.has(current)) {
          return "[Circular]";
        }
        seen.add(current);
        return Object.fromEntries(
          Object.entries(current as Record<string, unknown>).map(([key, entry]) => {
            return [key, visit(entry)];
          }),
        );
      }
      return String(current);
    };
    return visit(value);
  }
  return String(value);
}

function shouldWriteLlmFileLog(): boolean {
  const raw = process.env.LLM_DEBUG_FILE_LOG?.trim().toLowerCase();
  if (raw && LOG_FALSE_VALUES.has(raw)) {
    return false;
  }
  if (raw && LOG_TRUE_VALUES.has(raw)) {
    return true;
  }
  return process.env.NODE_ENV !== "production";
}

function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function resolveDefaultLogsDir(): string {
  const cwd = process.cwd();
  const serverAppPath = path.join(cwd, "src", "app.ts");
  if (fileExists(serverAppPath)) {
    return path.resolve(cwd, "..", ".logs");
  }
  return path.resolve(cwd, ".logs");
}

function formatDatePart(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimestampPart(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}-${minutes}-${seconds}`;
}

function resolveSessionLogPath(kind: "llm" | "llm-repair"): string | null {
  if (kind === "llm" && cachedLogPath !== undefined) {
    return cachedLogPath;
  }
  if (kind === "llm-repair" && cachedRepairLogPath !== undefined) {
    return cachedRepairLogPath;
  }

  const explicitPath = kind === "llm"
    ? process.env.RUN_WITH_LOG_LLM_PATH?.trim()
    : process.env.RUN_WITH_LOG_LLM_REPAIR_PATH?.trim();
  if (explicitPath) {
    const resolved = path.resolve(explicitPath);
    if (kind === "llm") {
      cachedLogPath = resolved;
    } else {
      cachedRepairLogPath = resolved;
    }
    return resolved;
  }

  const parentLogPath = process.env.RUN_WITH_LOG_PATH?.trim();
  if (parentLogPath) {
    const resolvedParent = path.resolve(parentLogPath);
    const resolved = resolvedParent.endsWith(".log")
      ? resolvedParent.replace(/\.log$/u, kind === "llm" ? ".llm.jsonl" : ".llm-repair.jsonl")
      : `${resolvedParent}.${kind}.jsonl`;
    if (kind === "llm") {
      cachedLogPath = resolved;
    } else {
      cachedRepairLogPath = resolved;
    }
    return resolved;
  }

  const now = new Date();
  const sessionDir = path.join(resolveDefaultLogsDir(), formatDatePart(now));
  const baseName = `${formatTimestampPart(now)}-server`;
  const resolved = path.join(sessionDir, `${baseName}.${kind}.jsonl`);
  if (kind === "llm") {
    cachedLogPath = resolved;
  } else {
    cachedRepairLogPath = resolved;
  }
  return resolved;
}

function appendSessionLog(kind: "llm" | "llm-repair", entry: unknown): void {
  if (!shouldWriteLlmFileLog()) {
    return;
  }

  const logPath = resolveSessionLogPath(kind);
  if (!logPath) {
    return;
  }

  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${JSON.stringify(toJsonSafeValue(entry))}\n`, "utf8");
    const announced = kind === "llm" ? announcedLogPath : announcedRepairLogPath;
    if (announced !== logPath) {
      if (kind === "llm") {
        announcedLogPath = logPath;
      } else {
        announcedRepairLogPath = logPath;
      }
      console.info(`[llm.debug] writing dedicated ${kind} log to ${logPath}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[llm.debug] failed to append dedicated ${kind} log: ${message}`);
  }
}

export function appendLlmSessionLog(entry: unknown): void {
  appendSessionLog("llm", entry);
}

export function appendLlmRepairSessionLog(entry: unknown): void {
  appendSessionLog("llm-repair", entry);
}

export function getLlmSessionLogPath(): string | null {
  if (!shouldWriteLlmFileLog()) {
    return null;
  }
  return resolveSessionLogPath("llm");
}

export function getLlmRepairSessionLogPath(): string | null {
  if (!shouldWriteLlmFileLog()) {
    return null;
  }
  return resolveSessionLogPath("llm-repair");
}
