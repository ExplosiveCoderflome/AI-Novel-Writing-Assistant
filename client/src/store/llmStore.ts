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
};

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
    (set, get) => ({
      provider: "deepseek",
      model: providerModelMap.deepseek[0],
      temperature: 0.7,
      maxTokens: 4096,
      setProvider: (provider) =>
        set({
          provider,
          model: providerModelMap[provider][0],
        }),
      setModel: (model) => set({ model }),
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
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<LLMStoreState>),
        model:
          providerModelMap[
            ((persisted as Partial<LLMStoreState>)?.provider ?? current.provider) as LLMProvider
          ]?.includes((persisted as Partial<LLMStoreState>)?.model ?? "")
            ? ((persisted as Partial<LLMStoreState>)?.model as string)
            : providerModelMap[
                ((persisted as Partial<LLMStoreState>)?.provider ?? current.provider) as LLMProvider
              ][0],
      }),
    },
  ),
);
