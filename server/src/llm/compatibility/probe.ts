import { implicatesStructuredMode, thinkingControlKwargs } from "./adapter";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { createLLMFromResolvedOptions, resolveLLMClientOptions } from "../factory";
import { detectReasoningField, ReasoningStreamCollector, ThinkTagStreamFilter } from "../reasoning";
import { buildStructuredResponseFormat, classifyStructuredOutputFailure, type StructuredOutputStrategy } from "../structuredOutput";
import { identityKey, type ModelIdentity, type ModelCapabilityProfile, type StructuredMode } from "./profile";
import { loadCapability, saveCapability } from "./store";

const schema = z.object({ ok: z.literal(true) });
const running = new Map<string, Promise<void>>();
export interface ProbeStatus { state: "idle" | "running" | "succeeded" | "failed"; checkedAt?: string; message?: string }
const statuses = new Map<string, ProbeStatus>();
const statusKey = (input: ModelIdentity) => "modelCompatibility.probe." + identityKey(input);
const enabledKey = (provider: string) => "modelCompatibility.autoProbe." + provider;
export async function autoProbeEnabled(provider: string): Promise<boolean> {
  return (await prisma.appSetting.findUnique({ where: { key: enabledKey(provider) } }))?.value === "true";
}
export async function setAutoProbe(provider: string, enabled: boolean): Promise<void> {
  const key = enabledKey(provider);
  await prisma.appSetting.upsert({ where: { key }, create: { key, value: String(enabled) }, update: { value: String(enabled) } });
}
export async function probeStatus(input: ModelIdentity): Promise<ProbeStatus> {
  const local = statuses.get(identityKey(input));
  if (local) return local;
  const row = await prisma.appSetting.findUnique({ where: { key: statusKey(input) } });
  return row ? JSON.parse(row.value) as ProbeStatus : { state: "idle" };
}

// Explicit network opt-in is required by every entrypoint, including CLI and tests.
export async function probeModel(input: ModelIdentity, options: { allowNetwork: boolean }): Promise<ModelCapabilityProfile> {
  if (!options.allowNetwork) throw new Error("Compatibility probes require explicit network opt-in.");
  const previous = await loadCapability(input);
  const base = await resolveLLMClientOptions(input.provider, { model: input.model, baseURL: input.baseURL,
    requestProtocol: input.requestProtocol ?? (input.provider === "anthropic" ? "anthropic" : undefined),
    maxTokens: 128, timeoutMs: 20000, reasoningEnabled: false });
  // LangChain drops vendor reasoning fields unless the original delta is retained.
  base.includeRawResponse = true;
  let observedReasoningField = previous.reasoningField;
  const toggle = { ...previous.thinkingToggle };
  if (toggle.control !== "none") base.modelKwargs = { ...base.modelKwargs, ...thinkingControlKwargs({ ...toggle, supported: true }, false) };
  const run = async (mode: StructuredMode, modelKwargs = base.modelKwargs) => {
    const strategy: StructuredOutputStrategy = mode === "prompt_only" ? "prompt_json" : mode;
    const llm = createLLMFromResolvedOptions({ ...base, modelKwargs });
    const callOptions: Record<string, unknown> = { signal: AbortSignal.timeout(20000) };
    const format = buildStructuredResponseFormat({ strategy, schema, label: "compat_probe" });
    if (format) callOptions.response_format = format;
    if (mode === "tool_calling") {
      callOptions.tools = [{ type: "function", function: { name: "compat_probe", description: "Report success", parameters: z.toJSONSchema(schema) } }];
      callOptions.tool_choice = { type: "function", function: { name: "compat_probe" } };
    }
    let content = "";
    let reasoning = "";
    const collector = new ReasoningStreamCollector();
    const stream = await llm.stream([new HumanMessage('Return only JSON {"ok":true}.')], callOptions);
    for await (const chunk of stream) {
      if (["length", "max_tokens", "content_filter"].includes(String(chunk.response_metadata?.finish_reason ?? chunk.response_metadata?.stop_reason))) {
        throw new Error("Probe output is incomplete or blocked.");
      }
      observedReasoningField = detectReasoningField(chunk) ?? observedReasoningField;
      reasoning += collector.push(chunk, typeof chunk.content === "string" ? chunk.content : "");
      content += mode === "tool_calling" ? (chunk.tool_call_chunks ?? []).map((call) => call.args ?? "").join("") : typeof chunk.content === "string" ? chunk.content : "";
    }
    reasoning += collector.flush();
    const filter = new ThinkTagStreamFilter();
    const filtered = filter.push(content);
    const tail = filter.flush();
    schema.parse(JSON.parse(filtered.text + tail.text));
    return { reasoningChars: reasoning.length };
  };
  const supported: StructuredMode[] = [];
  const failed: StructuredMode[] = [];
  let reasoningChars = 0;
  for (const mode of ["json_object", "json_schema", "tool_calling"] as const) {
    if (base.requestProtocol === "anthropic") break; // The existing Anthropic transport supports text only.
    try { const result = await run(mode); supported.push(mode); reasoningChars = Math.max(reasoningChars, result.reasoningChars); }
    catch (error) {
      // Auth, rate limits and outages are not evidence that a mode is unsupported.
      const status = (error as { status?: number }).status;
      const category = classifyStructuredOutputFailure({ error });
      const invalidResult = error instanceof SyntaxError || error instanceof z.ZodError;
      if (status && status >= 500 || !invalidResult && ![400, 422].includes(status ?? 0) && !implicatesStructuredMode({ category,
        message: error instanceof Error ? error.message : String(error), httpStatus: status })) {
        throw new Error("探测请求未完成，请检查连接或稍后重试。");
      }
      failed.push(mode);
    }
  }
  const plain = await run("prompt_only");
  reasoningChars = Math.max(reasoningChars, plain.reasoningChars);
  if (toggle.control === "none" && plain.reasoningChars > 2) {
    for (const control of ["enable_thinking", "thinking", "thinking_boolean", "reasoning_effort"] as const) {
      try {
        const result = await run("prompt_only", { ...base.modelKwargs, ...thinkingControlKwargs({ supported: true, control, effort: false }, false) });
        if (result.reasoningChars <= 2) { toggle.control = control; toggle.supported = true; reasoningChars = 0; break; }
      } catch { /* This control is not usable on this endpoint. */ }
    }
  }
  const structuredModes = (["json_schema", "json_object", "tool_calling"] as const).filter((mode) => supported.includes(mode)) as StructuredMode[];
  structuredModes.push("prompt_only");
  return saveCapability(input, { ...previous, source: "probed", structuredModes, failedModes: failed,
    reasoningField: observedReasoningField,
    thinkingToggle: { ...toggle, supported: toggle.control !== "none" && reasoningChars <= 2 },
    probedAt: new Date().toISOString() });
}
export async function startProbe(input: ModelIdentity, allowNetwork: boolean): Promise<void> {
  if (!allowNetwork) throw new Error("Compatibility probes require explicit network opt-in.");
  const id = identityKey(input);
  if (running.has(id)) return;
  statuses.set(id, { state: "running" });
  const task = (async () => {
    let status: ProbeStatus;
    try { await probeModel(input, { allowNetwork }); status = { state: "succeeded", checkedAt: new Date().toISOString(), message: "探测完成" }; }
    catch { status = { state: "failed", checkedAt: new Date().toISOString(), message: "探测未完成，请检查连接后重试。" }; }
    statuses.set(id, status);
    const key = statusKey(input);
    await prisma.appSetting.upsert({ where: { key }, create: { key, value: JSON.stringify(status) }, update: { value: JSON.stringify(status) } });
  })().finally(() => running.delete(id));
  running.set(id, task);
  void task.catch(() => { statuses.set(id, { state: "failed", message: "探测结果保存失败，请重试。" }); });
}
export async function probeIfEnabled(input: ModelIdentity): Promise<void> {
  if (await autoProbeEnabled(input.provider)) {
    const resolved = await resolveLLMClientOptions(input.provider, { model: input.model, baseURL: input.baseURL });
    await startProbe({ ...input, model: resolved.model, baseURL: resolved.baseURL }, true);
  }
}
