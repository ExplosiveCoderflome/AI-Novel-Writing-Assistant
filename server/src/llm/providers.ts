import type { LLMProvider } from "@ai-novel/shared/types/llm";

export interface ProviderConfig {
  name: string;
  baseURL: string;
  defaultModel: string;
  models: string[];
  envKey: string;
}

export const PROVIDERS: Record<LLMProvider, ProviderConfig> = {
  deepseek: {
    name: "DeepSeek",
    baseURL: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-coder", "deepseek-reasoner"],
    envKey: "DEEPSEEK_API_KEY",
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
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"],
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
};

export const SUPPORTED_PROVIDERS = Object.keys(PROVIDERS) as LLMProvider[];
