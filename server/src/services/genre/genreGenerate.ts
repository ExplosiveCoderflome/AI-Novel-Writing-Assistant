import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { resolveLLMClientOptions } from "../../llm/factory";
import { selectStructuredOutputStrategy } from "../../llm/structuredOutput";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { genreTreePrompt } from "../../prompting/prompts/genre/genre.prompts";

export interface GenreTreeDraft {
  name: string;
  description?: string;
  children: GenreTreeDraft[];
}

export interface GenerateGenreTreeInput {
  prompt: string;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

async function shouldForceGenreJsonOutput(input: GenerateGenreTreeInput): Promise<boolean> {
  const resolved = await resolveLLMClientOptions(input.provider ?? "deepseek", {
    model: input.model,
    temperature: input.temperature ?? 0.6,
    maxTokens: input.maxTokens,
    taskType: genreTreePrompt.taskType,
    executionMode: "structured",
  });
  const profile = resolved.structuredProfile;
  if (!profile || !genreTreePrompt.outputSchema) {
    return false;
  }
  return selectStructuredOutputStrategy(profile, genreTreePrompt.outputSchema) !== "prompt_json";
}

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeGeneratedNode(value: unknown, depth = 1): GenreTreeDraft {
  if (typeof value !== "object" || value === null) {
    throw new Error("模型输出异常：类型树节点不是合法对象。");
  }

  const record = value as {
    name?: unknown;
    description?: unknown;
    children?: unknown;
  };

  const name = toTrimmedString(record.name);
  if (!name) {
    throw new Error("模型输出异常：类型名称为空。");
  }

  const description = toTrimmedString(record.description);
  const rawChildren = Array.isArray(record.children) ? record.children : [];
  if (depth >= 3) {
    return {
      name,
      description: description || undefined,
      children: [],
    };
  }

  const childLimit = depth === 1 ? 6 : 4;
  const seen = new Set<string>();
  const children: GenreTreeDraft[] = [];

  for (const child of rawChildren.slice(0, childLimit)) {
    try {
      const normalizedChild = sanitizeGeneratedNode(child, depth + 1);
      const dedupeKey = normalizedChild.name.toLocaleLowerCase("zh-CN");
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      children.push(normalizedChild);
    } catch {
      continue;
    }
  }

  return {
    name,
    description: description || undefined,
    children,
  };
}

export async function generateGenreTreeDraft(input: GenerateGenreTreeInput): Promise<GenreTreeDraft> {
  const forceJson = await shouldForceGenreJsonOutput(input);

  let lastError: unknown;

  for (const retry of [false, true]) {
    try {
      const result = await runStructuredPrompt({
        asset: genreTreePrompt,
        promptInput: {
          prompt: input.prompt,
          retry,
          forceJson,
        },
        options: {
          provider: input.provider,
          model: input.model,
          temperature: input.temperature ?? 0.6,
          maxTokens: input.maxTokens,
        },
      });
      const parsed = result.output;

      return sanitizeGeneratedNode(parsed);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    throw new Error(`类型树生成失败：${lastError.message}`);
  }
  throw new Error("类型树生成失败。");
}
