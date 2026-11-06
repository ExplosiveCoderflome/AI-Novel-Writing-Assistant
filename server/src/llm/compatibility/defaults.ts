import { modelHost, modelId, type ModelIdentity, type ModelCapabilityProfile, type StructuredMode } from "./profile";

// Transport facts only: these rules never classify creative intent or route business tasks.
export function builtinCapability(input: ModelIdentity): ModelCapabilityProfile {
  const model = modelId(input.model);
  const host = modelHost(input.baseURL);
  const direct = (provider: string, pattern: RegExp) => input.provider === provider && !host || pattern.test(host);
  let family = "unknown";
  let structuredModes: StructuredMode[] = ["prompt_only"];
  let control: ModelCapabilityProfile["thinkingToggle"]["control"] = "none";
  let effort = false;
  let reasoningField: ModelCapabilityProfile["reasoningField"] = "reasoning_content";
  if (input.provider === "ollama") { family = "ollama"; control = "reasoning_effort"; }
  else if (input.provider === "deepseek" && direct("deepseek", /(?:^|\.)api\.deepseek\.com$/)) {
    family = "deepseek";
    structuredModes = ["json_object", "tool_calling", "prompt_only"];
    if (model === "deepseek-reasoner" || /^deepseek-(?:flash|pro)(?:$|[-_.:])/.test(model) || /^deepseek-v4(?:\.\d+)?-(?:flash|pro)(?:$|[-_.:])/.test(model)) { control = "thinking"; effort = true; }
  } else if (input.provider === "glm" || /open\.bigmodel\.cn$/.test(host)) {
    family = "glm";
    structuredModes = ["json_object", "tool_calling", "prompt_only"];
    const version = model.match(/^glm-(\d+)(?:\.(\d+))?/);
    if (Number(version?.[1]) > 4 || Number(version?.[1]) === 4 && Number(version?.[2]) >= 5) control = "thinking";
  } else if (input.provider === "qwen" || model.startsWith("qwen")) {
    family = "qwen";
    if (direct("qwen", /dashscope\.aliyuncs\.com$/) && !model.includes("thinking")) structuredModes = ["json_object", "tool_calling", "prompt_only"];
    if ((direct("qwen", /dashscope\.aliyuncs\.com$/) || /modelscope\.cn$/.test(host))
      && /^qwen(?:3|-(?:plus|flash|turbo))/.test(model) && !model.includes("thinking")) control = "enable_thinking";
  } else if (input.provider === "kimi" || /moonshot\.(?:cn|ai)$/.test(host) || /^(?:kimi|moonshot)/.test(model)) {
    family = "kimi";
    if (!model.includes("thinking")) structuredModes = ["json_object", "tool_calling", "prompt_only"];
  } else if (direct("openai", /api\.openai\.com$/)) {
    family = "openai"; structuredModes = ["json_schema", "json_object", "tool_calling", "prompt_only"];
    reasoningField = "reasoning";
  } else if (input.provider === "anthropic" || model.startsWith("claude")) {
    family = "anthropic"; reasoningField = "reasoning";
  } else if (direct("gemini", /generativelanguage\.googleapis\.com$/)) {
    family = "gemini"; structuredModes = ["json_schema", "json_object", "tool_calling", "prompt_only"];
  } else if (/xf-yun\.com$/.test(host) || /^(?:spark|xfyun)/.test(model) || /^(?:spark|xfyun)$/.test(input.provider)) {
    family = "spark"; // MaaS spark-x2.6 rejects response_format at the transport layer.
  } else if (input.provider === "minimax" || /minimax(?:i)?\.(?:io|com)$/.test(host) || /^minimax-m2(?:[.-]|$)/.test(model)) {
    family = "minimax"; reasoningField = "reasoning_details";
  } else if (input.provider === "grok" || /api\.x\.ai$/.test(host)) {
    family = "grok"; structuredModes = ["json_object", "tool_calling", "prompt_only"];
  }
  return { family, structuredModes, failedModes: [], thinkingToggle: { supported: control !== "none", control, effort }, reasoningField, source: "builtin_default", updatedAt: "1970-01-01T00:00:00.000Z" };
}
