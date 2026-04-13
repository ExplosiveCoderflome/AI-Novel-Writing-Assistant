import type { LLMProvider } from "@ai-novel/shared/types/llm";

export interface ProviderConfig {
  name: string;
  baseURL: string;
  defaultModel: string;
  models: string[];
  envKey: string;
  maxTokens?: number;
}

export const PROVIDERS: Record<LLMProvider, ProviderConfig> = {
  deepseek: {
    name: "DeepSeek",
    baseURL: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-coder", "deepseek-reasoner"],
    envKey: "DEEPSEEK_API_KEY",
    maxTokens: 8192,
  },
  siliconflow: {
    name: "SiliconFlow",
    baseURL: "https://api.siliconflow.cn/v1",
    defaultModel: "Qwen/Qwen2.5-7B-Instruct",
    models: [
      "Qwen/Qwen2.5-7B-Instruct",
      "Qwen/Qwen2.5-72B-Instruct",
      "deepseek-ai/DeepSeek-V3",
    ],
    envKey: "SILICONFLOW_API_KEY",
  },
  openai: {
    name: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    // 仅支持 GPT-5.x（强制 JSON / structured outputs 也更稳定）
    defaultModel: "gpt-5",
    models: ["gpt-5", "gpt-5-mini"],
    envKey: "OPENAI_API_KEY",
  },
  anthropic: {
    name: "Anthropic",
    baseURL: process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com/v1",
    defaultModel: process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-20241022",
    models: [
      process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
    ],
    envKey: "ANTHROPIC_API_KEY",
  },
  grok: {
    name: "Grok",
    baseURL: process.env.XAI_BASE_URL ?? "https://api.x.ai/v1",
    defaultModel: process.env.XAI_MODEL ?? "grok-4",
    models: [
      process.env.XAI_MODEL ?? "grok-4",
      "grok-4-latest",
      "grok-4-1-fast-reasoning",
      "grok-3",
      "grok-code-fast-1",
    ],
    envKey: "XAI_API_KEY",
  },
  // OpenAI-compatible 的厂商：只需要 baseURL / defaultModel / models 配好即可。
  kimi: {
    name: "Kimi",
    baseURL: process.env.KIMI_BASE_URL ?? "https://api.moonshot.cn/v1",
    defaultModel: process.env.KIMI_MODEL ?? "moonshot-v1-32k",
    models: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k", "kimi-latest"],
    envKey: "KIMI_API_KEY",
  },
  glm: {
    name: "GLM",
    baseURL: process.env.GLM_BASE_URL ?? "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: process.env.GLM_MODEL ?? "glm-4.5-air",
    models: ["glm-4.5-air", "glm-4.5", "glm-4.5-flash", "glm-4-flash-250414"],
    envKey: "GLM_API_KEY",
  },
  qwen: {
    name: "Qwen",
    // 常见 OpenAI-compatible 网关路径
    baseURL: process.env.QWEN_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: process.env.QWEN_MODEL ?? "qwen-plus",
    models: ["qwen-plus", "qwen-max", "qwen3.5-plus", "qwen3-max"],
    envKey: "QWEN_API_KEY",
  },
  gemini: {
    name: "Gemini",
    // Gemini 的 OpenAI-compatible endpoint
    baseURL: process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-3-flash-preview"],
    envKey: "GEMINI_API_KEY",
  },
  longcat: {
    name: "LongCat",
    baseURL: process.env.LONGCAT_BASE_URL ?? "https://api.longcat.chat/openai/v1",
    defaultModel: process.env.LONGCAT_MODEL ?? "LongCat-Flash-Chat",
    models: ["LongCat-Flash-Chat", "LongCat-Flash-Thinking", "LongCat-Flash-Thinking-2601", "LongCat-Flash-Lite"],
    envKey: "LONGCAT_API_KEY",
  },
};

export const SUPPORTED_PROVIDERS = Object.keys(PROVIDERS) as LLMProvider[];
