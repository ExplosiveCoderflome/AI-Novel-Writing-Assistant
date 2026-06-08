import fs from "node:fs";
import { resolveDesktopLogsDir, resolveDesktopMainLogFile } from "./paths";
import {
  cleanupDesktopLogDirectory,
  resolveDesktopLogRetentionConfig,
  rotateDesktopLogFileIfNeeded,
} from "./logRetention";

type DesktopLogLevel = "info" | "warn" | "error";

function ensureDesktopLogsDir(): void {
  fs.mkdirSync(resolveDesktopLogsDir(), { recursive: true });
}

function normalizeLogMessage(message: string): string {
  return message.replace(/\r?\n+$/g, "");
}

function formatLogLine(level: DesktopLogLevel, source: string, message: string): string {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}] [${source}] ${normalizeLogMessage(message)}\n`;
}

export function appendDesktopLog(source: string, message: string, level: DesktopLogLevel = "info"): string {
  ensureDesktopLogsDir();
  const targetPath = resolveDesktopMainLogFile();
  rotateDesktopLogFileIfNeeded(targetPath, resolveDesktopLogRetentionConfig());
  fs.appendFileSync(targetPath, formatLogLine(level, source, message), "utf8");
  return targetPath;
}

export function cleanupDesktopLogs(): void {
  try {
    const summary = cleanupDesktopLogDirectory(resolveDesktopLogsDir(), resolveDesktopLogRetentionConfig());
    if (summary.deletedFiles > 0 || summary.failedFiles > 0) {
      appendDesktopLog(
        "desktop.logs.cleanup",
        `cleanup deletedFiles=${summary.deletedFiles} deletedBytes=${summary.deletedBytes} failedFiles=${summary.failedFiles}`,
        summary.failedFiles > 0 ? "warn" : "info",
      );
    }
    for (const failure of summary.failures.slice(0, 5)) {
      appendDesktopLog("desktop.logs.cleanup", `failed file=${failure.filePath} message=${failure.message}`, "warn");
    }
  } catch (error) {
    logDesktopError("desktop.logs.cleanup", error);
  }
}

function normalizeUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function logDesktopError(source: string, error: unknown): string {
  return appendDesktopLog(source, normalizeUnknownError(error), "error");
}
