import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import {
  storyModeChildPrompt,
  storyModeExpansionPrompt,
  storyModeTreePrompt,
} from "../../prompting/prompts/storyMode/storyMode.prompts";
import {
  parseStoryModeProfileJson,
  sanitizeStoryModeProfile,
} from "./storyModeProfile";

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

export interface GenerateStoryModeChildInput {
  parentId: string;
  prompt?: string;
  count?: number;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface GenerateStoryModeExpansionInput extends Omit<GenerateStoryModeChildInput, "parentId" | "prompt" | "count"> {
  parentId?: string;
  prompt?: string;
  count?: number;
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

function sanitizeGeneratedChildNode(value: unknown): StoryModeTreeDraft {
  const normalized = sanitizeGeneratedNode(value, 2);
  return {
    ...normalized,
    children: [],
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

export async function generateStoryModeChildDrafts(input: GenerateStoryModeChildInput): Promise<StoryModeTreeDraft[]> {
  const parent = await prisma.novelStoryMode.findUnique({
    where: { id: input.parentId },
    select: {
      id: true,
      name: true,
      description: true,
      template: true,
      parentId: true,
      profileJson: true,
      children: {
        select: {
          name: true,
        },
        orderBy: {
          name: "asc",
        },
      },
    },
  });

  if (!parent) {
    throw new Error("父级流派模式不存在。");
  }
  if (parent.parentId) {
    throw new Error("新增子类只能挂在根流派模式下面。");
  }

  const count = Math.max(1, Math.min(5, Math.trunc(input.count ?? 1)));
  const result = await runStructuredPrompt({
    asset: storyModeChildPrompt,
    promptInput: {
      prompt: input.prompt,
      count,
      parentName: parent.name,
      parentDescription: parent.description ?? "",
      parentTemplate: parent.template ?? "",
      parentProfile: parseStoryModeProfileJson(parent.profileJson),
      existingSiblingNames: parent.children
        .map((child) => toTrimmedString(child.name))
        .filter(Boolean),
    },
    options: {
      provider: input.provider,
      model: input.model,
      temperature: input.temperature ?? 0.45,
      maxTokens: input.maxTokens,
    },
  });

  return result.output.map((item) => sanitizeGeneratedChildNode(item));
}

export async function generateStoryModeExpansionDrafts(input: GenerateStoryModeExpansionInput): Promise<StoryModeTreeDraft[]> {
  const parent = input.parentId?.trim()
    ? await prisma.novelStoryMode.findUnique({
      where: { id: input.parentId.trim() },
      select: {
        id: true, name: true, description: true, template: true, parentId: true,
        profileJson: true,
        children: { select: { name: true }, orderBy: { name: "asc" } },
      },
    })
    : null;
  if (input.parentId?.trim() && !parent) throw new Error("父级流派模式不存在。");
  if (parent?.parentId) throw new Error("扩展推进模式只能选择根模式。");

  const allModes = await prisma.novelStoryMode.findMany({
    select: {
      name: true,
      description: true,
      profileJson: true,
      parent: { select: { name: true } },
    },
    orderBy: [{ parentId: "asc" }, { name: "asc" }],
  });
  const count = Math.max(2, Math.min(5, Math.trunc(input.count ?? 3)));
  const existingRootNames = allModes.filter((mode) => !mode.parent).map((mode) => mode.name);
  const librarySummary = allModes.map((mode) => {
    const profile = parseStoryModeProfileJson(mode.profileJson);
    const path = mode.parent ? `${mode.parent.name} / ${mode.name}` : mode.name;
    const description = toTrimmedString(mode.description).slice(0, 160);
    return [
      path,
      description,
      `驱动：${profile.coreDrive}`,
      `回报：${profile.readerReward}`,
      `单元：${profile.progressionUnits.slice(0, 3).join("、")}`,
    ].filter(Boolean).join("；");
  }).join("\n");
  const result = await runStructuredPrompt({
    asset: storyModeExpansionPrompt,
    promptInput: {
      prompt: input.prompt,
      count,
      parentName: parent?.name ?? "",
      parentDescription: parent?.description ?? "",
      parentTemplate: parent?.template ?? "",
      parentProfile: parent ? parseStoryModeProfileJson(parent.profileJson) : parseStoryModeProfileJson("{}"),
      existingSiblingNames: parent
        ? parent.children.map((child) => toTrimmedString(child.name)).filter(Boolean)
        : existingRootNames,
      librarySummary,
    },
    options: {
      provider: input.provider,
      model: input.model,
      temperature: input.temperature ?? 0.55,
      maxTokens: input.maxTokens,
    },
  });
  return result.output.map((item) => sanitizeGeneratedChildNode(item));
}
