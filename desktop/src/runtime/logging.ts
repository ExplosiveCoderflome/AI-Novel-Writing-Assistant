import fs from "node:fs";
import { resolveDesktopLogsDir, resolveDesktopMainLogFile } from "./paths";

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
  fs.appendFileSync(targetPath, formatLogLine(level, source, message), "utf8");
  return targetPath;
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
