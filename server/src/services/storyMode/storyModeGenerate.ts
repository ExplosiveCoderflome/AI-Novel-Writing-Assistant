import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { storyModeTreePrompt } from "../../prompting/prompts/storyMode/storyMode.prompts";
import { sanitizeStoryModeProfile } from "./storyModeProfile";

export interface StoryModeTreeDraft {
  name: string;
  description?: string;
  template?: string;
  profile: ReturnType<typeof sanitizeStoryModeProfile>;
  children: StoryModeTreeDraft[];
}

export interface GenerateStoryModeTreeInput {
  prompt: string;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeGeneratedNode(value: unknown, depth = 1): StoryModeTreeDraft {
  if (!value || typeof value !== "object") {
    throw new Error("模型输出异常：流派模式节点不是合法对象。");
  }

  const record = value as {
    name?: unknown;
    description?: unknown;
    template?: unknown;
    profile?: unknown;
    children?: unknown;
  };

  const name = toTrimmedString(record.name);
  if (!name) {
    throw new Error("模型输出异常：流派模式名称不能为空。");
  }

  const description = toTrimmedString(record.description);
  const template = toTrimmedString(record.template);
  const rawChildren = Array.isArray(record.children) ? record.children : [];
  const childLimit = depth === 1 ? 8 : 0;
  const seen = new Set<string>();
  const children: StoryModeTreeDraft[] = [];

  for (const child of rawChildren.slice(0, childLimit)) {
    const normalizedChild = sanitizeGeneratedNode(child, depth + 1);
    const dedupeKey = normalizedChild.name.toLocaleLowerCase("zh-CN");
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    children.push({ ...normalizedChild, children: [] });
  }

  return {
    name,
    description: description || undefined,
    template: template || undefined,
    profile: sanitizeStoryModeProfile(record.profile),
    children,
  };
}

export async function generateStoryModeTreeDraft(input: GenerateStoryModeTreeInput): Promise<StoryModeTreeDraft> {
  const result = await runStructuredPrompt({
    asset: storyModeTreePrompt,
    promptInput: {
      prompt: input.prompt,
    },
    options: {
      provider: input.provider,
      model: input.model,
      temperature: input.temperature ?? 0.45,
      maxTokens: input.maxTokens,
    },
  });
  const parsed = result.output;

  return sanitizeGeneratedNode(parsed);
}
