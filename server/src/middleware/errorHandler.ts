import type { NextFunction, Request, Response } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { ZodError } from "zod";

export class AppError extends Error {
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(message: string, statusCode = 500, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

function joinErrorParts(parts: Array<string | undefined>): string {
  return parts.map((part) => part?.trim() ?? "").filter(Boolean).join(" | ");
}

function setRequestErrorMessage(
  res: Response<ApiResponse<null>>,
  error: string,
  detail?: string,
): void {
  res.locals.requestErrorMessage = joinErrorParts([error, detail]);
}

function logServerError(req: Request, error: unknown): void {
  console.error(`[error] ${req.method} ${req.originalUrl}`, error);
}

function collectErrorMessages(error: unknown, depth = 0): string[] {
  if (!error || depth > 4) {
    return [];
  }
  if (error instanceof Error) {
    return [
      error.message,
      ...collectErrorMessages((error as Error & { cause?: unknown }).cause, depth + 1),
    ].filter(Boolean);
  }
  if (typeof error === "object") {
    const record = error as {
      message?: unknown;
      cause?: unknown;
    };
    return [
      typeof record.message === "string" ? record.message : "",
      ...collectErrorMessages(record.cause, depth + 1),
    ].filter(Boolean);
  }
  return [];
}

function findConnectionCause(error: unknown, depth = 0): {
  code?: string;
  host?: string;
  port?: number | string;
} | null {
  if (!error || depth > 6 || typeof error !== "object") {
    return null;
  }
  const record = error as {
    code?: unknown;
    host?: unknown;
    port?: unknown;
    cause?: unknown;
  };
  if (
    (typeof record.code === "string" && record.code.trim())
    || (typeof record.host === "string" && record.host.trim())
  ) {
    return {
      code: typeof record.code === "string" ? record.code : undefined,
      host: typeof record.host === "string" ? record.host : undefined,
      port: typeof record.port === "number" || typeof record.port === "string" ? record.port : undefined,
    };
  }
  return findConnectionCause(record.cause, depth + 1);
}

function formatUpstreamConnectionError(error: unknown): string | null {
  const joinedMessage = collectErrorMessages(error).join(" | ").trim();
  const isNetworkLike = /connection error|fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|tls/i
    .test(joinedMessage);
  if (!isNetworkLike) {
    return null;
  }
  const cause = findConnectionCause(error);
  const target = cause?.host
    ? `${cause.host}${cause.port ? `:${cause.port}` : ""}`
    : "上游模型服务";
  const code = cause?.code ? `（${cause.code}）` : "";
  return `上游模型服务连接失败：当前服务器无法连接到 ${target}${code}。请检查该提供商的网络连通性，或切换到其它可用模型提供商。`;
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response<ApiResponse<null>>,
  _next: NextFunction,
): void {
  if (
    error
    && typeof error === "object"
    && "type" in error
    && (error as { type?: string }).type === "entity.too.large"
  ) {
    setRequestErrorMessage(res, "请求体过大，请缩短文本或分段上传。");
    res.status(413).json({
      success: false,
      error: "请求体过大，请缩短文本或分段上传。",
    });
    return;
  }

  if (error instanceof ZodError) {
    const detail = error.issues.map((issue) => issue.message).join("; ");
    setRequestErrorMessage(res, "请求参数校验失败。", detail);
    res.status(400).json({
      success: false,
      error: "请求参数校验失败。",
      message: detail,
    });
    return;
  }

  if (error instanceof AppError) {
    const detail = typeof error.details === "string" ? error.details : undefined;
    setRequestErrorMessage(res, error.message, detail);
    if (error.statusCode >= 500) {
      logServerError(req, error);
    }
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      message: detail,
    });
    return;
  }

  const message = error instanceof Error ? error.message : "服务器发生未知错误。";
  const upstreamConnectionMessage = formatUpstreamConnectionError(error);
  if (upstreamConnectionMessage) {
    setRequestErrorMessage(res, upstreamConnectionMessage);
    logServerError(req, error);
    res.status(502).json({
      success: false,
      error: upstreamConnectionMessage,
    });
    return;
  }

  setRequestErrorMessage(res, message);
  logServerError(req, error);
  res.status(500).json({
    success: false,
    error: message,
  });
}
