import type { ResponseDiagnostics } from "./ResponseCollector";

/** A repair model can decline lossy reconstruction; its reason is untrusted content. */
export function isRepairRefusal(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 1
    && typeof record.repair_error === "string"
    && record.repair_error.trim().length > 0;
}

export class StructuredRepairRefusalError extends Error {
  readonly retryable = false;

  constructor(readonly validationError: string, readonly response: ResponseDiagnostics) {
    super(`JSON 修复返回 repair_error：模型报告无法无损修复，已停止格式修复与模型降级。请检查原始校验限制后重新生成。原始校验错误：${validationError}`);
    this.name = "StructuredRepairRefusalError";
  }
}
