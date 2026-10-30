import type { StructuredDiagnosticSummary, StructuredResponseEvidence, StructuredFailureReason } from "@ai-novel/shared/types/structuredDiagnostics";
import type { PromptInvocationMeta } from "../../../prompting/core/promptTypes";
import { prisma } from "../../../db/prisma";

export interface StructuredDiagnosticContext { invocationId: string; nextAttempt: number }

const messages: Record<StructuredFailureReason, string> = {
  empty_response: "模型返回了空内容。请检查所选模型的结构化输出能力后重试。",
  reasoning_budget_exhausted: "模型的输出额度用于思考，尚未返回可用方案。请检查模型输出额度与思考设置。",
  output_budget_exhausted: "模型输出达到本次额度，方案未完整返回。请检查输出额度后重试。",
  blocked: "模型明确拒绝或过滤了这次请求。请调整创作要求或核对模型服务提示。",
  rate_limited: "模型服务暂时限流，请等待后继续。",
  network: "连接模型服务时发生网络异常，可以稍后继续。",
  timeout: "本次模型请求超时，可以检查服务状态后继续。",
  cancelled: "本次请求已取消。",
  invalid_json: "模型返回的方案格式不完整或不符合 JSON 要求，请继续重试。",
  schema_validation: "模型返回的方案缺少必要字段或结构不符合要求，请继续重试。",
  business_validation: "模型返回的方案未满足创作约定，请继续重试。",
  unknown: "本次请求未完成，已有证据不足以确定具体原因。请查看诊断标识后核对模型服务。",
};

export async function beginStructuredDiagnostic(input: {
  meta?: PromptInvocationMeta; context?: StructuredDiagnosticContext; kind?: string;
  provider?: string; model?: string; requestProtocol?: string; strategy: string;
  response: StructuredResponseEvidence;
}): Promise<string | null> {
  const meta = input.meta;
  if (!meta?.taskId || !(meta.promptId?.startsWith("novel.short_story.") || (meta.promptId === "creation.intent.interpret" || meta.promptId?.startsWith("creation.short_story.")))) return null;
  try {
    const row = await prisma.structuredInvocationDiagnostic.create({ data: {
      taskId: meta.taskId, novelId: meta.novelId, promptId: meta.promptId, stage: meta.stage,
      invocationId: input.context?.invocationId ?? crypto.randomUUID(),
      attempt: input.context ? ++input.context.nextAttempt : 1, kind: input.kind ?? "generate",
      provider: input.provider, model: input.model, requestProtocol: input.requestProtocol,
      strategy: input.strategy, detailsJson: JSON.stringify(input.response),
    } });
    return row.id;
  } catch { console.warn("[structured.diagnostics] diagnostic storage unavailable"); return null; }
}

export async function finishStructuredDiagnostic(id: string | null, status: string, response: StructuredResponseEvidence): Promise<void> {
  if (!id) return;
  try { await prisma.structuredInvocationDiagnostic.update({ where: { id }, data: { status, detailsJson: JSON.stringify(response) } }); }
  catch { console.warn("[structured.diagnostics] diagnostic update unavailable"); }
}

export async function latestStructuredDiagnostic(taskId: string, includeUnfinished = false): Promise<StructuredDiagnosticSummary | null> {
  const row = await prisma.structuredInvocationDiagnostic.findFirst({
    where: { taskId }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
  if (!row || row.status === "succeeded" || (row.status === "running" && !includeUnfinished)) return null;
  const response = JSON.parse(row.detailsJson) as StructuredResponseEvidence;
  const attempts = await prisma.structuredInvocationDiagnostic.count({ where: { invocationId: row.invocationId } });
  return { id: row.id, reason: response.failureReason, message: row.status === "running"
    ? "本次请求尚无完成记录；软件重启后可从已保存的内容继续。"
    : messages[response.failureReason ?? "unknown"], provider: row.provider, model: row.model, strategy: row.strategy,
    attempts, retryAt: response.retryAfterMs ? new Date(row.updatedAt.getTime() + response.retryAfterMs).toISOString() : null, response };
}

export async function canRetryStructuredTask(taskId: string): Promise<boolean> {
  const diagnostic = await latestStructuredDiagnostic(taskId);
  return !diagnostic?.retryAt || Date.parse(diagnostic.retryAt) <= Date.now();
}

export async function recordStructuredBusinessFailure(id: string | null | undefined): Promise<void> {
  if (!id) return;
  try {
    const row = await prisma.structuredInvocationDiagnostic.findUnique({ where: { id } });
    if (!row) return;
    const response = JSON.parse(row.detailsJson) as StructuredResponseEvidence;
    response.failureReason = "business_validation";
    await finishStructuredDiagnostic(id, "failed", response);
  } catch { console.warn("[structured.diagnostics] business validation storage unavailable"); }
}
