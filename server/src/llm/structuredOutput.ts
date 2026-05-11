import { toJSONSchema, type ZodType } from "zod";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { ModelRouteRequestProtocol } from "@ai-novel/shared/types/novel";
import { isBuiltInProvider } from "./providers";

export type StructuredExecutionMode = "plain" | "structured";
export type StructuredOutputStrategy = "json_schema" | "json_object" | "prompt_json";
export type StructuredOutputErrorCategory =
  | "unsupported_native_json"
  | "thinking_pollution"
  | "incomplete_json"
  | "malformed_json"
  | "schema_mismatch"
  | "transport_error";

export interface StructuredOutputProfile {
  nativeJsonSchema: boolean;
  nativeJsonObject: boolean;
  requiresNonThinkingForStructured: boolean;
  supportsReasoningToggle: boolean;
  omitMaxTokensForNativeStructured: boolean;
  preferredStructuredStrategy: StructuredOutputStrategy;
  safeStructuredMaxTokens?: number;
  family: string;
}

export interface StructuredOutputDiagnostics {
  strategy: StructuredOutputStrategy;
  profile: StructuredOutputProfile;
  reasoningForcedOff: boolean;
  fallbackAvailable: boolean;
  fallbackUsed: boolean;
  errorCategory: StructuredOutputErrorCategory | null;
}

const QWEN_FAMILY_PATTERN = /(?:^|[/:_-])qwen(?:\d+(?:\.\d+)?)?/i;
const DASHSCOPE_HOST_PATTERN = /(?:^|\.)dashscope\.aliyuncs\.com$/i;
const MODELSCOPE_HOST_PATTERN = /(?:^|\.)modelscope\.cn$/i;
const OPENAI_HOST_PATTERN = /(?:^|\.)api\.openai\.com$/i;
const GEMINI_HOST_PATTERN = /(?:^|\.)generativelanguage\.googleapis\.com$/i;
const MOONSHOT_HOST_PATTERN = /(?:^|\.)api\.moonshot\.cn$/i;
const DEEPSEEK_HOST_PATTERN = /(?:^|\.)api\.deepseek\.com$/i;
const GLM_HOST_PATTERN = /(?:^|\.)open\.bigmodel\.cn$/i;
const GROK_HOST_PATTERN = /(?:^|\.)api\.x\.ai$/i;
const MINIMAX_HOST_PATTERN = /(?:^|\.)api\.minimax(?:i)?\.(?:io|com)$/i;

function normalizeText(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

function extractHost(baseURL?: string): string {
  const trimmed = baseURL?.trim();
  if (!trimmed) {
    return "";
  }
  try {
    return new URL(trimmed).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isQwenFamily(model: string): boolean {
  return QWEN_FAMILY_PATTERN.test(model);
}

function normalizeModelId(model: string): string {
  const normalized = normalizeText(model);
  if (!normalized) {
    return "";
  }
  const parts = normalized.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] ?? normalized : normalized;
}

function isQwenThinkingOnlyModel(model: string): boolean {
  const normalizedModel = normalizeModelId(model);
  if (!normalizedModel) {
    return false;
  }
  return normalizedModel.startsWith("qwq") || normalizedModel.includes("thinking");
}

function supportsDashScopeQwenNativeStructuredOutput(model: string): boolean {
  const normalizedModel = normalizeModelId(model);
  if (!normalizedModel || isQwenThinkingOnlyModel(normalizedModel)) {
    return false;
  }
  if (normalizedModel.startsWith("qwen3")) {
    return true;
  }
  if (normalizedModel.startsWith("qwen-plus")) {
    return true;
  }
  if (normalizedModel.startsWith("qwen-flash")) {
    return true;
  }
  if (normalizedModel.startsWith("qwen-turbo")) {
    return true;
  }
  if (normalizedModel.startsWith("qwen-max")) {
    return true;
  }
  if (normalizedModel.startsWith("qwen-long")) {
    return true;
  }
  return normalizedModel.startsWith("qwen2.5")
    && !normalizedModel.includes("math")
    && !normalizedModel.includes("coder");
}

function isQwenMixedThinkingModel(model: string): boolean {
  const normalizedModel = normalizeModelId(model);
  if (!normalizedModel || isQwenThinkingOnlyModel(normalizedModel)) {
    return false;
  }
  return normalizedModel.startsWith("qwen3")
    || normalizedModel.startsWith("qwen-plus")
    || normalizedModel.startsWith("qwen-flash")
    || normalizedModel.startsWith("qwen-turbo");
}

function supportsNativeJson(profile: StructuredOutputProfile): boolean {
  return profile.nativeJsonSchema || profile.nativeJsonObject;
}

function buildProfile(input: Partial<StructuredOutputProfile> & { family: string }): StructuredOutputProfile {
  return {
    nativeJsonSchema: input.nativeJsonSchema ?? false,
    nativeJsonObject: input.nativeJsonObject ?? false,
    requiresNonThinkingForStructured: input.requiresNonThinkingForStructured ?? false,
    supportsReasoningToggle: input.supportsReasoningToggle ?? false,
    omitMaxTokensForNativeStructured: input.omitMaxTokensForNativeStructured ?? false,
    preferredStructuredStrategy: input.preferredStructuredStrategy ?? "prompt_json",
    safeStructuredMaxTokens: input.safeStructuredMaxTokens,
    family: input.family,
  };
}

export function resolveStructuredOutputProfile(input: {
  provider: LLMProvider;
  model?: string;
  baseURL?: string;
  executionMode?: StructuredExecutionMode;
  requestProtocol?: ModelRouteRequestProtocol;
}): StructuredOutputProfile {
  const provider = normalizeText(input.provider);
  const model = normalizeText(input.model);
  const host = extractHost(input.baseURL);
  const customProvider = !isBuiltInProvider(input.provider);
  const qwenFamily = isQwenFamily(model);
  const qwenMixedThinkingModel = isQwenMixedThinkingModel(model);
  const qwenThinkingOnlyModel = isQwenThinkingOnlyModel(model);
  const qwenNativeStructuredModel = supportsDashScopeQwenNativeStructuredOutput(model);
  const isDashScopeQwen = input.provider === "qwen" || DASHSCOPE_HOST_PATTERN.test(host);
  const isModelScopeQwen = MODELSCOPE_HOST_PATTERN.test(host) || provider.includes("modelscope");

  if (input.requestProtocol === "anthropic") {
    return buildProfile({
      family: "anthropic",
      preferredStructuredStrategy: "prompt_json",
      safeStructuredMaxTokens: 8192,
    });
  }
  if (input.provider === "gemini" || GEMINI_HOST_PATTERN.test(host)) {
    return buildProfile({
      family: "gemini",
      nativeJsonSchema: true,
      nativeJsonObject: true,
      preferredStructuredStrategy: "json_schema",
    });
  }
  if (input.provider === "glm" || GLM_HOST_PATTERN.test(host) || model.startsWith("glm-")) {
    return buildProfile({
      family: "glm",
      nativeJsonObject: true,
      preferredStructuredStrategy: "json_object",
    });
  }
  if (input.provider === "kimi" || MOONSHOT_HOST_PATTERN.test(host) || model.startsWith("kimi-")) {
    const supportsJsonObject = !model.includes("thinking");
    return buildProfile({
      family: "kimi",
      nativeJsonObject: supportsJsonObject,
      preferredStructuredStrategy: supportsJsonObject ? "json_object" : "prompt_json",
    });
  }
  if (input.provider === "deepseek" || DEEPSEEK_HOST_PATTERN.test(host) || model.startsWith("deepseek-")) {
    return buildProfile({
      family: "deepseek",
      nativeJsonObject: true,
      preferredStructuredStrategy: "json_object",
    });
  }
  if (input.provider === "grok" || GROK_HOST_PATTERN.test(host) || model.startsWith("grok-")) {
    return buildProfile({
      family: "grok",
      nativeJsonObject: true,
      preferredStructuredStrategy: "json_object",
    });
  }
  if (input.provider === "minimax" || MINIMAX_HOST_PATTERN.test(host) || model.startsWith("minimax-m2")) {
    return buildProfile({
      family: "minimax",
      preferredStructuredStrategy: "prompt_json",
      safeStructuredMaxTokens: 8192,
    });
  }
  if (isDashScopeQwen || (input.provider === "qwen" && qwenFamily)) {
    return buildProfile({
      family: "dashscope_qwen",
      nativeJsonObject: qwenNativeStructuredModel,
      preferredStructuredStrategy: qwenNativeStructuredModel ? "json_object" : "prompt_json",
      requiresNonThinkingForStructured: qwenMixedThinkingModel,
      supportsReasoningToggle: qwenMixedThinkingModel,
      omitMaxTokensForNativeStructured: qwenNativeStructuredModel,
      safeStructuredMaxTokens: qwenNativeStructuredModel ? undefined : 8192,
    });
  }
  if (isModelScopeQwen && qwenFamily) {
    return buildProfile({
      family: "modelscope_qwen",
      preferredStructuredStrategy: "prompt_json",
      requiresNonThinkingForStructured: qwenMixedThinkingModel && !qwenThinkingOnlyModel,
      supportsReasoningToggle: qwenMixedThinkingModel && !qwenThinkingOnlyModel,
      safeStructuredMaxTokens: 8192,
    });
  }
  if (qwenFamily) {
    return buildProfile({
      family: "custom_openai_compatible_qwen",
      preferredStructuredStrategy: "prompt_json",
      safeStructuredMaxTokens: 8192,
    });
  }
  if (input.provider === "openai" || OPENAI_HOST_PATTERN.test(host)) {
    return buildProfile({
      family: "openai",
      nativeJsonSchema: true,
      nativeJsonObject: true,
      preferredStructuredStrategy: "json_schema",
    });
  }
  if (input.provider === "anthropic") {
    return buildProfile({
      family: "anthropic",
      preferredStructuredStrategy: "prompt_json",
      safeStructuredMaxTokens: 8192,
    });
  }
  if (input.provider === "siliconflow") {
    return buildProfile({
      family: "siliconflow",
      preferredStructuredStrategy: "prompt_json",
      safeStructuredMaxTokens: 8192,
    });
  }
  if (input.provider === "ollama") {
    return buildProfile({
      family: "ollama",
      preferredStructuredStrategy: "prompt_json",
      safeStructuredMaxTokens: 8192,
    });
  }
  if (customProvider) {
    return buildProfile({
      family: qwenFamily ? "custom_openai_compatible_qwen" : "custom_openai_compatible",
      preferredStructuredStrategy: "prompt_json",
      safeStructuredMaxTokens: 8192,
    });
  }
  return buildProfile({
    family: "default",
    preferredStructuredStrategy: "prompt_json",
    safeStructuredMaxTokens: 8192,
  });
}

export function schemaAllowsTopLevelArray<T>(schema: ZodType<T>): boolean {
  const probe = schema.safeParse([]);
  if (probe.success) {
    return true;
  }
  return probe.error.issues.some((issue) => issue.path.length === 0 && issue.code !== "invalid_type");
}

export function selectStructuredOutputStrategy<T>(
  profile: StructuredOutputProfile,
  schema: ZodType<T>,
): StructuredOutputStrategy {
  if (schemaAllowsTopLevelArray(schema)) {
    return "prompt_json";
  }
  if (profile.preferredStructuredStrategy === "json_schema" && profile.nativeJsonSchema) {
    return "json_schema";
  }
  if (
    (profile.preferredStructuredStrategy === "json_object" || profile.preferredStructuredStrategy === "json_schema")
    && profile.nativeJsonObject
  ) {
    return "json_object";
  }
  return "prompt_json";
}

function sanitizeSchemaName(label: string): string {
  const normalized = label.replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized.slice(0, 48) || "structured_output";
}

export function buildStructuredResponseFormat<T>(input: {
  strategy: StructuredOutputStrategy;
  schema: ZodType<T>;
  label: string;
}): Record<string, unknown> | undefined {
  if (input.strategy === "json_object") {
    return { type: "json_object" };
  }
  if (input.strategy === "json_schema") {
    return {
      type: "json_schema",
      json_schema: {
        name: sanitizeSchemaName(input.label),
        strict: true,
        schema: toJSONSchema(input.schema),
      },
    };
  }
  return undefined;
}

export function classifyStructuredOutputFailure(input: {
  error?: unknown;
  rawContent?: string;
}): StructuredOutputErrorCategory {
  const message = input.error instanceof Error
    ? input.error.message
    : typeof input.error === "string"
      ? input.error
      : String(input.error ?? "");
  const rawContent = input.rawContent ?? "";
  const lowerMessage = message.toLowerCase();
  const trimmedRawContent = rawContent.trim().toLowerCase();
  const haystack = `${message}\n${rawContent}`.toLowerCase();

  if (
    haystack.includes("response_format")
    || haystack.includes("json_schema")
    || haystack.includes("json_object")
    || haystack.includes("unsupported response format")
  ) {
    return "unsupported_native_json";
  }
  if (rawContent.includes("<think>") || rawContent.includes("</think>")) {
    return "thinking_pollution";
  }
  const rawLooksLikeHtmlPage = trimmedRawContent.startsWith("<!doctype")
    || trimmedRawContent.startsWith("<html")
    || trimmedRawContent.startsWith("<body")
    || trimmedRawContent.startsWith("<head")
    || trimmedRawContent.startsWith("<title");
  const messageLooksLikeHtmlTransport = lowerMessage.includes("text/html")
    || lowerMessage.includes("content-type: text/html")
    || lowerMessage.includes("<!doctype")
    || lowerMessage.includes("<html")
    || lowerMessage.includes("<body")
    || lowerMessage.includes("</div>")
    || lowerMessage.includes("</script>")
    || lowerMessage.includes("<title>403")
    || lowerMessage.includes("<title>404")
    || lowerMessage.includes("<title>429")
    || lowerMessage.includes("<title>502")
    || lowerMessage.includes("<title>503");
  if (
    rawLooksLikeHtmlPage
    || messageLooksLikeHtmlTransport
    || (
      trimmedRawContent.startsWith("<")
      && (
        lowerMessage.includes("unexpected token '<'")
        || lowerMessage.includes("is not valid json")
      )
    )
  ) {
    return "transport_error";
  }
  if (
    haystack.includes("未检测到完整 json 值")
    || haystack.includes("unexpected end of json input")
    || haystack.includes("unterminated")
    || haystack.includes("end of json")
  ) {
    return "incomplete_json";
  }
  if (
    haystack.includes("expected ',' or '}'")
    || haystack.includes("unexpected token")
    || haystack.includes("json 解析失败")
    || haystack.includes("malformed")
  ) {
    return "malformed_json";
  }
  if (haystack.includes("zod") || haystack.includes("schema") || haystack.includes("校验错误")) {
    return "schema_mismatch";
  }
  return "transport_error";
}

export function extractStructuredOutputErrorCategory(message?: string | null): StructuredOutputErrorCategory | null {
  const match = message?.match(/\[STRUCTURED_OUTPUT:([a-z_]+)\]/i);
  if (!match) {
    return null;
  }
  const category = match[1].toLowerCase() as StructuredOutputErrorCategory;
  return [
    "unsupported_native_json",
    "thinking_pollution",
    "incomplete_json",
    "malformed_json",
    "schema_mismatch",
    "transport_error",
  ].includes(category) ? category : null;
}

export function describeNetworkErrorCause(error: unknown): string | null {
  const visited = new Set<unknown>();
  let current: unknown = error;
  let depth = 0;
  while (
    current
    && typeof current === "object"
    && !visited.has(current)
    && depth < 6
  ) {
    visited.add(current);
    const candidate = current as Record<string, unknown>;
    const code = typeof candidate.code === "string" ? candidate.code : undefined;
    const errno = (typeof candidate.errno === "string" || typeof candidate.errno === "number")
      ? String(candidate.errno)
      : undefined;
    const syscall = typeof candidate.syscall === "string" ? candidate.syscall : undefined;
    const hostname = typeof candidate.hostname === "string" ? candidate.hostname : undefined;
    const address = typeof candidate.address === "string" ? candidate.address : undefined;
    const port = (typeof candidate.port === "number" || typeof candidate.port === "string")
      ? String(candidate.port)
      : undefined;
    if (code || errno || syscall || hostname || address) {
      const parts: string[] = [];
      if (code) {
        parts.push(`code=${code}`);
      }
      if (errno && errno !== code) {
        parts.push(`errno=${errno}`);
      }
      if (syscall) {
        parts.push(`syscall=${syscall}`);
      }
      if (hostname) {
        parts.push(`host=${hostname}`);
      } else if (address) {
        parts.push(`addr=${address}${port ? `:${port}` : ""}`);
      }
      if (parts.length > 0) {
        return parts.join(" ");
      }
    }
    if (candidate.cause && candidate.cause !== current) {
      current = candidate.cause;
      depth += 1;
      continue;
    }
    break;
  }
  return null;
}

export function enrichErrorMessageWithCause(error: unknown, fallback?: string): string {
  if (!(error instanceof Error)) {
    const text = typeof error === "string" ? error : String(error ?? "");
    return text || (fallback ?? "");
  }
  const baseMessage = error.message?.trim() || error.name || (fallback ?? "Error");
  const cause = describeNetworkErrorCause(error);
  if (!cause) {
    return baseMessage;
  }
  if (baseMessage.toLowerCase().includes(cause.toLowerCase())) {
    return baseMessage;
  }
  return `${baseMessage} (cause: ${cause})`;
}

export class StructuredOutputError extends Error {
  readonly category: StructuredOutputErrorCategory;

  readonly diagnostics: StructuredOutputDiagnostics;

  constructor(input: {
    message: string;
    category: StructuredOutputErrorCategory;
    diagnostics: StructuredOutputDiagnostics;
    cause?: unknown;
  }) {
    super(
      `[STRUCTURED_OUTPUT:${input.category}] ${input.message}`,
      input.cause !== undefined ? { cause: input.cause } : undefined,
    );
    this.name = "StructuredOutputError";
    this.category = input.category;
    this.diagnostics = input.diagnostics;
  }
}

export function canUseForcedJsonOutput(profile: StructuredOutputProfile): boolean {
  return supportsNativeJson(profile);
}
