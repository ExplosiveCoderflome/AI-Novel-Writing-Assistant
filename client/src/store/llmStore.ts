import { create } from "zustand";
import type { LLMProvider } from "@ai-novel/shared/types/llm";

function normalizeProvider(rawProvider: unknown): LLMProvider {
  return typeof rawProvider === "string" && rawProvider.trim()
    ? (rawProvider.trim() as LLMProvider)
    : ("" as LLMProvider);
}

function normalizeModel(model: unknown): string {
  return typeof model === "string" ? model.trim() : "";
}

function normalizeTemperature(temperature: unknown): number {
  if (typeof temperature !== "number" || !Number.isFinite(temperature)) {
    return 0.7;
  }
  return Math.min(2, Math.max(0, temperature));
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
  hasHydratedSelection: boolean;
  setSelection: (selection: {
    provider: LLMProvider;
    model: string;
    temperature?: number;
    maxTokens?: number;
  }) => void;
  setProvider: (provider: LLMProvider) => void;
  setModel: (model: string) => void;
  setTemperature: (temperature: number) => void;
  setMaxTokens: (maxTokens?: number) => void;
}

export const useLLMStore = create<LLMStoreState>()((set) => ({
  provider: "" as LLMProvider,
  model: "",
  temperature: 0.7,
  hasHydratedSelection: false,
  setSelection: (selection) =>
    set((state) => ({
      provider: normalizeProvider(selection.provider),
      model: normalizeModel(selection.model),
      temperature: selection.temperature !== undefined
        ? normalizeTemperature(selection.temperature)
        : state.temperature,
      maxTokens: selection.maxTokens !== undefined
        ? normalizeMaxTokens(selection.maxTokens)
        : undefined,
      hasHydratedSelection: true,
    })),
  setProvider: (provider) =>
    set(() => ({
      provider: normalizeProvider(provider),
      hasHydratedSelection: true,
    })),
  setModel: (model) =>
    set(() => ({
      model: normalizeModel(model),
      hasHydratedSelection: true,
    })),
  setTemperature: (temperature) =>
    set({
      temperature: normalizeTemperature(temperature),
      hasHydratedSelection: true,
    }),
  setMaxTokens: (maxTokens) =>
    set({
      maxTokens: normalizeMaxTokens(maxTokens),
      hasHydratedSelection: true,
    }),
}));
