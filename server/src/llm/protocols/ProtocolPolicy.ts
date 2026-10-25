import type { ModelRouteRequestProtocol } from "@ai-novel/shared/types/novel";
import type { ModelTokenSettings } from "../../services/settings/modelTokens";

/** Explicit protocol selection is a capability declaration; aliases alone are not. */
export function resolveProtocol(requested: ModelRouteRequestProtocol | undefined, stored: ModelRouteRequestProtocol, baseURL: string): ModelRouteRequestProtocol {
  const selected = requested && requested !== "auto" ? requested : stored;
  if (selected !== "auto") return selected;
  const host = new URL(baseURL).hostname;
  if (host === "api.deepseek.com") return "deepseek";
  if (host === "api.anthropic.com") return "anthropic";
  if (host === "generativelanguage.googleapis.com") return "gemini";
  return "openai_compatible";
}

export function buildThinkingParameters(protocol: ModelRouteRequestProtocol, settings: ModelTokenSettings, maxTokens?: number): Record<string, unknown> {
  const mode = settings.thinkingMode, effort = settings.thinkingEffort, budget = settings.thinkingBudgetTokens;
  if (mode === "default" && effort === "default" && budget == null) return {};
  const enabled = mode !== "disabled" && effort !== "none";
  const depth = effort === "default" ? undefined : effort;
  const unsupported = (text: string): never => { const error = new Error(`思考设置无效：${text}。请调整模型接口设置，或选择“服务默认”。`) as Error & {retryable:boolean};error.retryable=false;throw error; };
  if (protocol === "openai_responses") {
    if (budget != null || mode === "adaptive") unsupported("Responses 使用思考强度，不支持独立 token 预算或 Claude 自适应模式");
    return { reasoning: { effort: enabled ? depth ?? "high" : "none" } };
  }
  if (protocol === "deepseek") {
    if (budget != null || mode === "adaptive") unsupported("DeepSeek 使用开关及强度，不支持独立 token 预算");
    if (depth && !["none", "low", "high", "max"].includes(depth)) unsupported("DeepSeek 强度应为 low、high 或 max");
    return { thinking: {type:enabled?"enabled":"disabled"}, ...(enabled && depth ? {reasoning_effort:depth} : {}) };
  }
  if (protocol === "anthropic") {
    if (!enabled) return {thinking:{type:"disabled"}};
    if (mode === "adaptive") {
      if (budget != null) unsupported("Claude 自适应模式不接受固定思考预算");
      return {thinking:{type:"adaptive"},...(depth?{output_config:{effort:depth}}:{})};
    }
    if (budget == null || budget < 1024 || budget >= (maxTokens ?? 4096)) unsupported("Claude 固定预算需至少 1024，并小于最大输出（包含思考）");
    return {thinking:{type:"enabled",budget_tokens:budget},...(depth?{output_config:{effort:depth}}:{})};
  }
  if (protocol === "gemini") {
    if (mode === "adaptive") unsupported("Gemini 请使用服务默认、强度或固定预算");
    if (budget != null && depth) unsupported("Gemini 的强度与固定预算只能选择一种");
    if (depth && !["none","minimal","low","medium","high"].includes(depth)) unsupported("此 Gemini 强度不受适配器支持");
    return {thinkingConfig:{includeThoughts:true,...(!enabled?{thinkingBudget:0}:budget!=null?{thinkingBudget:budget}:depth?{thinkingLevel:depth}:{})}};
  }
  if(protocol === "openai_compatible" && settings.chatReasoningFormat === "reasoning_effort") {
    if(budget != null || mode === "adaptive") unsupported("Chat reasoning_effort 使用强度，不支持独立 token 预算");
    return {reasoning_effort:enabled ? depth ?? "high" : "none"};
  }
  if (protocol === "llama_cpp") {
    if (mode === "adaptive" || budget != null) unsupported("llama.cpp 此模式支持模板开关/强度，未声明独立 token 预算");
    return {chat_template_kwargs:{enable_thinking:enabled},...(depth?{reasoning_effort:enabled?depth:"none"}:{})};
  }
  return unsupported("通用 Chat Completions 未声明思考扩展；请选择服务实际支持的协议");
}
