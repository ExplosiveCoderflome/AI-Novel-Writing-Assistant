import fs from "node:fs";
import path from "node:path";

const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_LLM_RETENTION_DAYS = 14;
const DEFAULT_MAX_FILE_MB = 50;
const DEFAULT_MIN_AGE_HOURS = 24;
const BYTES_PER_MB = 1024 * 1024;
const HOURS_PER_DAY = 24;
const MS_PER_HOUR = 60 * 60 * 1000;
const TRUE_VALUES = new Set(["1", "true", "on", "yes"]);
const FALSE_VALUES = new Set(["0", "false", "off", "no"]);

export type LogFileKind = "standard" | "llm" | "llm-repair";

export interface LogRetentionConfig {
  enabled: boolean;
  retentionDays: number;
  llmRetentionDays: number;
  maxFileMb: number;
  minAgeHours: number;
}

export interface LogCleanupSummary {
  scannedFiles: number;
  deletedFiles: number;
  preservedFiles: number;
  skippedFiles: number;
  failedFiles: number;
  deletedBytes: number;
  failures: Array<{ filePath: string; message: string }>;
}

export interface LogRotationResult {
  rotated: boolean;
  sourcePath: string;
  rotatedPath?: string;
  sizeBytes?: number;
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (TRUE_VALUES.has(normalized)) {
    return true;
  }
  if (FALSE_VALUES.has(normalized)) {
    return false;
  }
  return fallback;
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveLogRetentionConfig(env: NodeJS.ProcessEnv = process.env): LogRetentionConfig {
  return {
    enabled: parseBooleanEnv(env.AI_NOVEL_LOG_CLEANUP_ENABLED, true),
    retentionDays: parsePositiveNumber(env.AI_NOVEL_LOG_RETENTION_DAYS, DEFAULT_RETENTION_DAYS),
    llmRetentionDays: parsePositiveNumber(env.AI_NOVEL_LLM_LOG_RETENTION_DAYS, DEFAULT_LLM_RETENTION_DAYS),
    maxFileMb: parsePositiveNumber(env.AI_NOVEL_LOG_MAX_FILE_MB, DEFAULT_MAX_FILE_MB),
    minAgeHours: parsePositiveNumber(env.AI_NOVEL_LOG_MIN_AGE_HOURS, DEFAULT_MIN_AGE_HOURS),
  };
}

function createEmptySummary(): LogCleanupSummary {
  return {
    scannedFiles: 0,
    deletedFiles: 0,
    preservedFiles: 0,
    skippedFiles: 0,
    failedFiles: 0,
    deletedBytes: 0,
    failures: [],
  };
}

export function getLogFileKind(filePath: string): LogFileKind | null {
  const fileName = path.basename(filePath);
  if (fileName.endsWith(".llm-repair.jsonl")) {
    return "llm-repair";
  }
  if (fileName.endsWith(".llm.jsonl")) {
    return "llm";
  }
  if (fileName.endsWith(".log") || fileName.endsWith(".meta.json")) {
    return "standard";
  }
  return null;
}

function retentionDaysForKind(kind: LogFileKind, config: LogRetentionConfig): number {
  return kind === "llm" ? config.llmRetentionDays : config.retentionDays;
}

function shouldDeleteLogFile(input: {
  kind: LogFileKind;
  stat: fs.Stats;
  nowMs: number;
  config: LogRetentionConfig;
}): boolean {
  const ageMs = input.nowMs - input.stat.mtimeMs;
  if (ageMs < input.config.minAgeHours * MS_PER_HOUR) {
    return false;
  }
  const retentionDays = retentionDaysForKind(input.kind, input.config);
  return ageMs > retentionDays * HOURS_PER_DAY * MS_PER_HOUR;
}

function collectFiles(directoryPath: string, output: string[]): void {
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const fullPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, output);
      continue;
    }
    if (entry.isFile()) {
      output.push(fullPath);
    }
  }
}

export function cleanupLogDirectory(
  directoryPath: string,
  config: LogRetentionConfig = resolveLogRetentionConfig(),
): LogCleanupSummary {
  const summary = createEmptySummary();
  if (!config.enabled) {
    return summary;
  }
  if (!fs.existsSync(directoryPath)) {
    return summary;
  }

  const files: string[] = [];
  collectFiles(directoryPath, files);
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
      if (!shouldDeleteLogFile({ kind, stat, nowMs, config })) {
        summary.preservedFiles += 1;
        continue;
      }
      fs.unlinkSync(filePath);
      summary.deletedFiles += 1;
      summary.deletedBytes += stat.size;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.failedFiles += 1;
      summary.failures.push({ filePath, message });
    }
  }

  return summary;
}

function formatTimestampForFile(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    "-",
    pad(date.getMinutes()),
    "-",
    pad(date.getSeconds()),
  ].join("");
}

function buildRotatedPath(filePath: string, date: Date): string {
  const directoryPath = path.dirname(filePath);
  const fileName = path.basename(filePath);
  const knownSuffix = [".llm-repair.jsonl", ".llm.jsonl", ".meta.json", ".log"]
    .find((suffix) => fileName.endsWith(suffix));
  const extension = knownSuffix ?? path.extname(filePath);
  const baseName = extension ? fileName.slice(0, -extension.length) : fileName;
  const timestamp = formatTimestampForFile(date);
  let candidate = path.join(directoryPath, `${baseName}-${timestamp}${extension}`);
  let suffix = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(directoryPath, `${baseName}-${timestamp}-${suffix}${extension}`);
    suffix += 1;
  }
  return candidate;
}

export function rotateLogFileIfNeeded(
  filePath: string,
  config: Pick<LogRetentionConfig, "maxFileMb"> = resolveLogRetentionConfig(),
): LogRotationResult {
  if (!fs.existsSync(filePath)) {
    return { rotated: false, sourcePath: filePath };
  }
  const stat = fs.statSync(filePath);
  const maxBytes = config.maxFileMb * BYTES_PER_MB;
  if (stat.size <= maxBytes) {
    return { rotated: false, sourcePath: filePath, sizeBytes: stat.size };
  }
  const rotatedPath = buildRotatedPath(filePath, new Date());
  fs.renameSync(filePath, rotatedPath);
  return {
    rotated: true,
    sourcePath: filePath,
    rotatedPath,
    sizeBytes: stat.size,
  };
}
