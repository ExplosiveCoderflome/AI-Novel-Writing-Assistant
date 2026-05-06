import crypto from "node:crypto";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { ModelRouteRequestProtocol } from "@ai-novel/shared/types/novel";
import { prisma } from "../db/prisma";
import type { StructuredOutputErrorCategory, StructuredOutputStrategy } from "./structuredOutput";
import type { PromptInvocationMeta } from "../prompting/core/promptTypes";

export type LlmInvocationDiagnosticStatus = "started" | "succeeded" | "failed";

export interface LlmInvocationDiagnosticSnapshot {
  id: string;
  taskId?: string | null;
  novelId?: string | null;
  promptId?: string | null;
  promptVersion?: string | null;
  stage?: string | null;
  itemKey?: string | null;
  provider: string;
  model: string;
  baseUrlHost?: string | null;
  requestProtocol?: string | null;
  strategy?: string | null;
  status: string;
  errorCategory?: string | null;
  errorMessage?: string | null;
  upstreamRequestId?: string | null;
  estimatedInputTokens?: number | null;
  renderedPromptChars?: number | null;
  messageChars?: number | null;
  rawChars?: number | null;
  latencyMs?: number | null;
  warningCode?: string | null;
  createdAt: string;
}

export interface LlmInvocationDiagnosticCreateInput {
  promptMeta?: PromptInvocationMeta;
  provider: LLMProvider;
  model: string;
  baseURL?: string | null;
  requestProtocol?: ModelRouteRequestProtocol | null;
  strategy?: StructuredOutputStrategy | null;
  estimatedInputTokens?: number | null;
  renderedPromptChars?: number | null;
  messageChars?: number | null;
  warningCode?: string | null;
}

export interface LlmInvocationDiagnosticFinishInput {
  status: Extract<LlmInvocationDiagnosticStatus, "succeeded" | "failed">;
  latencyMs?: number | null;
  rawChars?: number | null;
  errorCategory?: StructuredOutputErrorCategory | null;
  errorMessage?: string | null;
  upstreamRequestId?: string | null;
}

const MAX_ERROR_MESSAGE_CHARS = 1600;
let diagnosticPersistenceRetryAfterMs = 0;

function truncateText(value: string | null | undefined, maxChars: number): string | null {
  const text = value?.trim();
  if (!text) {
    return null;
  }
  return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function buildDiagnosticId(): string {
  return `llmdiag_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

function shouldIgnoreDiagnosticPersistenceError(error: unknown): boolean {
  const code = typeof error === "object" && error && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  return code === "P2021"
    || code === "P2022"
    || /LlmInvocationDiagnostic/i.test(message) && /(does not exist|no such table|no such column)/i.test(message);
}

function warnDiagnosticPersistenceError(action: string, error: unknown): void {
  if (shouldIgnoreDiagnosticPersistenceError(error)) {
    const retryBackoffMs = Number(process.env.LLM_INVOCATION_DIAGNOSTICS_RETRY_BACKOFF_MS ?? "30000");
    diagnosticPersistenceRetryAfterMs = Date.now() + (Number.isFinite(retryBackoffMs) && retryBackoffMs >= 0 ? retryBackoffMs : 30000);
    return;
  }
  console.warn(
    `[llm.diagnostic] action=${action} persistence_error=${JSON.stringify(error instanceof Error ? error.message : String(error))}`,
  );
}

function shouldSkipDiagnosticPersistence(): boolean {
  return process.env.LLM_INVOCATION_DIAGNOSTICS_DISABLE_PERSISTENCE === "1"
    || Date.now() < diagnosticPersistenceRetryAfterMs;
}

export function resolveBaseUrlHost(baseURL?: string | null): string | null {
  const text = baseURL?.trim();
  if (!text) {
    return null;
  }
  try {
    return new URL(text).host.toLowerCase();
  } catch {
    return truncateText(text.replace(/^https?:\/\//i, "").split("/")[0], 180);
  }
}

export function extractUpstreamRequestId(message?: string | null): string | null {
  const text = message?.trim();
  if (!text) {
    return null;
  }
  const patterns = [
    /request\s*id\s*[:=]\s*([A-Za-z0-9._-]+)/i,
    /request[_-]?id["']?\s*[:=]\s*["']?([A-Za-z0-9._-]+)/i,
    /x-request-id["']?\s*[:=]\s*["']?([A-Za-z0-9._-]+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

let pendingDiagnosticPersistence: Promise<unknown> = Promise.resolve();

function trackDiagnosticPersistence(task: Promise<unknown>): void {
  pendingDiagnosticPersistence = pendingDiagnosticPersistence
    .catch(() => undefined)
    .then(() => task.catch(() => undefined));
}

export function waitForPendingLlmInvocationDiagnostics(): Promise<void> {
  return pendingDiagnosticPersistence.then(() => undefined);
}

async function persistCreateDiagnostic(
  id: string,
  input: LlmInvocationDiagnosticCreateInput,
): Promise<void> {
  try {
    await prisma.llmInvocationDiagnostic.create({
      data: {
        id,
        taskId: normalizeNullableText(input.promptMeta?.taskId),
        novelId: normalizeNullableText(input.promptMeta?.novelId),
        promptId: normalizeNullableText(input.promptMeta?.promptId),
        promptVersion: normalizeNullableText(input.promptMeta?.promptVersion),
        stage: normalizeNullableText(input.promptMeta?.stage),
        itemKey: normalizeNullableText(input.promptMeta?.itemKey),
        provider: String(input.provider),
        model: input.model,
        baseUrlHost: resolveBaseUrlHost(input.baseURL),
        requestProtocol: input.requestProtocol ?? null,
        strategy: input.strategy ?? null,
        status: "started",
        estimatedInputTokens: input.estimatedInputTokens ?? input.promptMeta?.estimatedInputTokens ?? null,
        renderedPromptChars: input.renderedPromptChars ?? input.promptMeta?.renderedPromptChars ?? null,
        messageChars: input.messageChars ?? input.promptMeta?.messageChars ?? null,
        warningCode: normalizeNullableText(input.warningCode ?? input.promptMeta?.warningCode),
      },
    });
  } catch (error) {
    warnDiagnosticPersistenceError("create", error);
  }
}

async function persistFinishDiagnostic(
  id: string,
  input: LlmInvocationDiagnosticFinishInput,
): Promise<void> {
  try {
    await prisma.llmInvocationDiagnostic.update({
      where: { id },
      data: {
        status: input.status,
        latencyMs: input.latencyMs ?? null,
        rawChars: input.rawChars ?? null,
        errorCategory: input.errorCategory ?? null,
        errorMessage: truncateText(input.errorMessage, MAX_ERROR_MESSAGE_CHARS),
        upstreamRequestId: input.upstreamRequestId ?? extractUpstreamRequestId(input.errorMessage),
      },
    });
  } catch (error) {
    warnDiagnosticPersistenceError("finish", error);
  }
}

export async function createLlmInvocationDiagnostic(
  input: LlmInvocationDiagnosticCreateInput,
): Promise<string> {
  const id = buildDiagnosticId();
  if (shouldSkipDiagnosticPersistence()) {
    return id;
  }
  trackDiagnosticPersistence(persistCreateDiagnostic(id, input));
  return id;
}

export async function finishLlmInvocationDiagnostic(
  id: string | null | undefined,
  input: LlmInvocationDiagnosticFinishInput,
): Promise<void> {
  const normalizedId = id?.trim();
  if (!normalizedId) {
    return;
  }
  if (shouldSkipDiagnosticPersistence()) {
    return;
  }
  trackDiagnosticPersistence(persistFinishDiagnostic(normalizedId, input));
}

export function toLlmInvocationDiagnosticSnapshot(row: {
  id: string;
  taskId: string | null;
  novelId: string | null;
  promptId: string | null;
  promptVersion: string | null;
  stage: string | null;
  itemKey: string | null;
  provider: string;
  model: string;
  baseUrlHost: string | null;
  requestProtocol: string | null;
  strategy: string | null;
  status: string;
  errorCategory: string | null;
  errorMessage: string | null;
  upstreamRequestId: string | null;
  estimatedInputTokens: number | null;
  renderedPromptChars: number | null;
  messageChars: number | null;
  rawChars: number | null;
  latencyMs: number | null;
  warningCode: string | null;
  createdAt: Date;
}): LlmInvocationDiagnosticSnapshot {
  return {
    id: row.id,
    taskId: row.taskId,
    novelId: row.novelId,
    promptId: row.promptId,
    promptVersion: row.promptVersion,
    stage: row.stage,
    itemKey: row.itemKey,
    provider: row.provider,
    model: row.model,
    baseUrlHost: row.baseUrlHost,
    requestProtocol: row.requestProtocol,
    strategy: row.strategy,
    status: row.status,
    errorCategory: row.errorCategory,
    errorMessage: row.errorMessage,
    upstreamRequestId: row.upstreamRequestId,
    estimatedInputTokens: row.estimatedInputTokens,
    renderedPromptChars: row.renderedPromptChars,
    messageChars: row.messageChars,
    rawChars: row.rawChars,
    latencyMs: row.latencyMs,
    warningCode: row.warningCode,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function findLatestLlmInvocationDiagnosticForTask(
  taskId: string,
): Promise<LlmInvocationDiagnosticSnapshot | null> {
  const normalizedTaskId = taskId.trim();
  if (!normalizedTaskId) {
    return null;
  }
  if (shouldSkipDiagnosticPersistence()) {
    return null;
  }
  try {
    const row = await prisma.llmInvocationDiagnostic.findFirst({
      where: { taskId: normalizedTaskId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return row ? toLlmInvocationDiagnosticSnapshot(row) : null;
  } catch (error) {
    warnDiagnosticPersistenceError("find_latest_for_task", error);
    return null;
  }
}

export function buildLlmDiagnosticFailureAppendix(
  diagnostic: LlmInvocationDiagnosticSnapshot | null | undefined,
): string | null {
  if (!diagnostic) {
    return null;
  }
  const fields = [
    `diagnosticId=${diagnostic.id}`,
    `provider=${diagnostic.provider}`,
    `model=${diagnostic.model}`,
    diagnostic.requestProtocol ? `protocol=${diagnostic.requestProtocol}` : null,
    diagnostic.strategy ? `strategy=${diagnostic.strategy}` : null,
    typeof diagnostic.estimatedInputTokens === "number" ? `estimatedInputTokens=${diagnostic.estimatedInputTokens}` : null,
    typeof diagnostic.renderedPromptChars === "number" ? `renderedPromptChars=${diagnostic.renderedPromptChars}` : null,
    typeof diagnostic.messageChars === "number" ? `messageChars=${diagnostic.messageChars}` : null,
    typeof diagnostic.latencyMs === "number" ? `latencyMs=${diagnostic.latencyMs}` : null,
    diagnostic.upstreamRequestId ? `upstreamRequestId=${diagnostic.upstreamRequestId}` : null,
    diagnostic.errorCategory ? `errorCategory=${diagnostic.errorCategory}` : null,
  ].filter(Boolean);
  return fields.length > 0 ? `最近 LLM 诊断：${fields.join("; ")}` : null;
}
