import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LLMProvider } from "@ai-novel/shared/types/llm";

export const providerModelMap: Record<LLMProvider, string[]> = {
  deepseek: ["deepseek-chat", "deepseek-coder", "deepseek-reasoner"],
  siliconflow: [
    "Qwen/Qwen2.5-7B-Instruct",
    "Qwen/Qwen2.5-72B-Instruct",
    "deepseek-ai/DeepSeek-V3",
  ],
  openai: ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"],
  anthropic: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"],
  grok: ["grok-4", "grok-4-latest", "grok-4-1-fast-reasoning", "grok-3", "grok-code-fast-1"],
};

function getDefaultModel(provider: LLMProvider): string {
  return providerModelMap[provider][0];
}

function normalizeProvider(rawProvider: unknown): LLMProvider {
  if (
    typeof rawProvider === "string"
    && Object.prototype.hasOwnProperty.call(providerModelMap, rawProvider)
  ) {
    return rawProvider as LLMProvider;
  }
  return "deepseek";
}

function normalizeModel(model: unknown, provider: LLMProvider): string {
  if (typeof model !== "string") {
    return getDefaultModel(provider);
  }
  const trimmed = model.trim();
  return trimmed || getDefaultModel(provider);
}

interface LLMStoreState {
  provider: LLMProvider;
  model: string;
  temperature: number;
  maxTokens: number;
  setProvider: (provider: LLMProvider) => void;
  setModel: (model: string) => void;
  setTemperature: (temperature: number) => void;
  setMaxTokens: (maxTokens: number) => void;
}

export const useLLMStore = create<LLMStoreState>()(
  persist(
    (set) => ({
      provider: "deepseek",
      model: getDefaultModel("deepseek"),
      temperature: 0.7,
      maxTokens: 4096,
      setProvider: (provider) =>
        set(() => ({
          provider,
        })),
      setModel: (model) =>
        set((state) => ({
          model: normalizeModel(model, state.provider),
        })),
      setTemperature: (temperature) => set({ temperature }),
      setMaxTokens: (maxTokens) => set({ maxTokens }),
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
        return {
          ...current,
          ...persistedState,
          provider,
          model,
        };
      },
    },
  ),
);
