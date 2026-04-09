import type { NextFunction, Request, Response } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { ZodError, type ZodIssue } from "zod";

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

const VALIDATION_FIELD_LABELS: Record<string, string> = {
  id: "项目 ID",
  field: "字段",
  provider: "模型提供商",
  model: "模型",
  temperature: "温度",
  storyInput: "故事想法输入",
  expansion: "故事引擎原型",
  decomposition: "推进与兑现摘要",
  constraints: "叙事规则",
  lockedFields: "锁定字段",
  state: "故事状态",
  expanded_premise: "扩展前提",
  protagonist_core: "主角核心",
  conflict_engine: "冲突引擎",
  conflict_layers: "冲突层",
  external: "外部压迫",
  internal: "内部崩塌",
  relational: "关系压力",
  mystery_box: "核心未知",
  emotional_line: "情绪线",
  setpiece_seeds: "高张力场面种子",
  tone_reference: "氛围参考",
  selling_point: "卖点",
  core_conflict: "核心冲突",
  main_hook: "主钩子",
  progression_loop: "推进循环",
  growth_path: "成长路径",
  major_payoffs: "关键兑现点",
  ending_flavor: "结局风味",
  currentPhase: "当前阶段",
  progress: "进度",
  protagonistState: "主角当前处境",
};

function formatValidationPath(path: PropertyKey[]): string {
  return path
    .map((segment) => {
      if (typeof segment === "number") {
        return `第 ${segment + 1} 项`;
      }
      if (typeof segment === "symbol") {
        return segment.toString();
      }
      return VALIDATION_FIELD_LABELS[segment] ?? segment;
    })
    .filter(Boolean)
    .join(" / ");
}

function formatZodIssueMessage(issue: ZodIssue): string {
  const issueRecord = issue as ZodIssue & Record<string, unknown>;
  const code = String(issue.code);
  const origin = typeof issueRecord.origin === "string" ? issueRecord.origin : undefined;

  switch (code) {
    case "invalid_type":
      if (issueRecord.input === undefined) {
        return "不能为空。";
      }
      if (issueRecord.expected === "string") {
        return "必须是文本。";
      }
      if (issueRecord.expected === "number") {
        return "必须是数字。";
      }
      if (issueRecord.expected === "boolean") {
        return "必须是布尔值。";
      }
      return issue.message || "类型不正确。";
    case "invalid_value":
      return issue.message || "取值不合法。";
    case "too_small":
      if (origin === "array") {
        return `至少需要 ${issueRecord.minimum} 项。`;
      }
      if (origin === "string") {
        return issueRecord.minimum === 1 ? "不能为空。" : `至少 ${issueRecord.minimum} 个字符。`;
      }
      if (origin === "number") {
        return `不能小于 ${issueRecord.minimum}。`;
      }
      return issue.message || "内容过短。";
    case "too_big":
      if (origin === "array") {
        return `最多只能填写 ${issueRecord.maximum} 项。`;
      }
      if (origin === "string") {
        return `不能超过 ${issueRecord.maximum} 个字符。`;
      }
      if (origin === "number") {
        return `不能大于 ${issueRecord.maximum}。`;
      }
      return issue.message || "内容过长。";
    default:
      return issue.message || "格式不正确。";
  }
}

function formatValidationIssue(issue: ZodIssue): string {
  const path = formatValidationPath(issue.path);
  const message = formatZodIssueMessage(issue);
  return path ? `${path}：${message}` : message;
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
    const detail = error.issues.map((issue) => formatValidationIssue(issue)).join(" ");
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
