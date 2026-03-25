import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { invokeStructuredLlm } from "../../llm/structuredInvoke";
import { sanitizeStoryModeProfile } from "./storyModeProfile";
import { storyModeDraftNodeSchema } from "./storyModeSchemas";

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
  const parsed = await invokeStructuredLlm({
    label: "story-mode-tree:init",
    provider: input.provider,
    model: input.model,
    temperature: input.temperature ?? 0.45,
    maxTokens: input.maxTokens,
    taskType: "planner",
    systemPrompt: [
      "你是网络小说流派模式策划专家。",
      "你的任务是根据用户描述，生成一个两级流派模式树。",
      "顶层是流派模式父类，第二层是具体流派模式子类。",
      "每个节点都必须输出 name、description、template、profile、children。",
      "profile 必须严格包含：coreDrive, readerReward, progressionUnits, allowedConflictForms, forbiddenConflictForms, conflictCeiling, resolutionStyle, chapterUnit, volumeReward, mandatorySignals, antiSignals。",
      "返回严格 JSON，不要输出 Markdown、解释或额外文本。",
      "最多两级树，第二层 children 必须为空数组。",
      "不得使用按流派名字写死的规则，必须把控制逻辑写进 profile 字段。",
    ].join("\n"),
    userPrompt: `请根据下面的创作方向生成流派模式树草稿：\n\n${input.prompt.trim()}`,
    schema: storyModeDraftNodeSchema,
    maxRepairAttempts: 1,
  });

  return sanitizeGeneratedNode(parsed);
}
