import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  isBuiltinLLMProvider,
  type BuiltinLLMProvider,
  type LLMProvider,
} from "@ai-novel/shared/types/llm";

export const providerModelMap: Record<BuiltinLLMProvider, string[]> = {
  deepseek: ["deepseek-chat", "deepseek-coder", "deepseek-reasoner"],
  siliconflow: [
    "Qwen/Qwen2.5-7B-Instruct",
    "Qwen/Qwen2.5-72B-Instruct",
    "deepseek-ai/DeepSeek-V3",
  ],
  openai: ["gpt-5", "gpt-5-mini"],
  anthropic: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"],
  grok: ["grok-4", "grok-4-latest", "grok-4-1-fast-reasoning", "grok-3", "grok-code-fast-1"],
  kimi: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k", "kimi-latest"],
  minimax: [
    "MiniMax-M2.7",
    "MiniMax-M2.7-highspeed",
    "MiniMax-M2.5",
    "MiniMax-M2.5-highspeed",
    "MiniMax-M2.1",
    "MiniMax-M2.1-highspeed",
    "MiniMax-M2",
  ],
  glm: ["glm-4.5-air", "glm-4.5", "glm-4.5-flash", "glm-4-flash-250414"],
  qwen: ["qwen-plus", "qwen-max", "qwen3.5-plus", "qwen3-max"],
  gemini: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-3-flash-preview"],
  ollama: ["llama3.2", "qwen3:8b", "deepseek-r1:8b", "gpt-oss:20b"],
};

export function getProviderFallbackModels(provider: LLMProvider): string[] {
  return isBuiltinLLMProvider(provider) ? providerModelMap[provider] : [];
}

function getDefaultModel(provider: LLMProvider): string {
  return getProviderFallbackModels(provider)[0] ?? "";
}

function normalizeProvider(rawProvider: unknown): LLMProvider {
  if (typeof rawProvider !== "string") {
    return "deepseek";
  }
  const trimmed = rawProvider.trim();
  return trimmed || "deepseek";
}

function normalizeModel(model: unknown, provider: LLMProvider): string {
  if (typeof model !== "string") {
    return getDefaultModel(provider);
  }
  const trimmed = model.trim();
  return trimmed || getDefaultModel(provider);
}

function normalizeMaxTokens(maxTokens: unknown): number | undefined {
  if (typeof maxTokens !== "number" || !Number.isFinite(maxTokens)) {
    return undefined;
  }
  const normalized = Math.floor(maxTokens);
  if (normalized < 256) {
    return undefined;
  }
  return normalized === 4096 ? undefined : normalized;
}

interface LLMStoreState {
  provider: LLMProvider;
  model: string;
  temperature: number;
  maxTokens?: number;
  setProvider: (provider: LLMProvider) => void;
  setModel: (model: string) => void;
  setTemperature: (temperature: number) => void;
  setMaxTokens: (maxTokens?: number) => void;
}

export const useLLMStore = create<LLMStoreState>()(
  persist(
    (set) => ({
      provider: "deepseek",
      model: getDefaultModel("deepseek"),
      temperature: 0.7,
      setProvider: (provider) =>
        set(() => ({
          provider,
        })),
      setModel: (model) =>
        set((state) => ({
          model: normalizeModel(model, state.provider),
        })),
      setTemperature: (temperature) => set({ temperature }),
      setMaxTokens: (maxTokens) => set({ maxTokens: normalizeMaxTokens(maxTokens) }),
    }),
    {
      name: "llm-store",
      partialize: (state) => ({
        provider: state.provider,
        model: state.model,
        temperature: state.temperature,
        maxTokens: state.maxTokens,
      }),
      merge: (persisted, current) => {
        const persistedState = (persisted ?? {}) as Partial<LLMStoreState>;
        const provider = normalizeProvider(persistedState.provider ?? current.provider);
        const model = normalizeModel(persistedState.model, provider);
        const maxTokens = normalizeMaxTokens(persistedState.maxTokens);
        return {
          ...current,
          ...persistedState,
          provider,
          model,
          maxTokens,
        };
      },
    },
  ),
);
