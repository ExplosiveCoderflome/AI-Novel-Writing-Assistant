import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import { novelBiblePayloadSchema } from "../../../services/novel/novelCoreSchemas";

export interface NovelOutlinePromptInput {
  title: string;
  description: string;
  charactersText: string;
  worldContext: string;
  referenceContext?: string;
  initialPrompt?: string;
}

export interface NovelStructuredOutlinePromptInput {
  charactersText: string;
  worldContext: string;
  outline: string;
  referenceContext?: string;
  totalChapters: number;
}

export interface NovelStructuredOutlineRepairPromptInput {
  rawContent: string;
  totalChapters: number;
  reason: string;
}

export interface NovelBiblePromptInput {
  title: string;
  genreName: string;
  description: string;
  charactersText: string;
  worldContext: string;
  referenceContext?: string;
}

export interface NovelBeatPromptInput {
  title: string;
  description: string;
  worldContext: string;
  bibleRawContent: string;
  targetChapters: number;
  referenceContext?: string;
}

export interface NovelChapterHookPromptInput {
  title: string;
  content: string;
}

const novelBeatPayloadSchema = z.array(
  z.object({
    chapterOrder: z.union([z.number(), z.string()]).optional(),
    beatType: z.string().optional(),
    title: z.string().optional(),
    content: z.string().optional(),
    status: z.string().optional(),
  }).passthrough(),
);

const novelChapterHookSchema = z.object({
  hook: z.string().optional(),
  nextExpectation: z.string().optional(),
}).passthrough();

function buildStructuredOutlineSystemPrompt(totalChapters: number): string {
  return `You are a structured novel planning engine.
Output exactly one JSON array with exactly ${totalChapters} objects.
Each object must contain exactly these keys:
- chapter: positive integer
- title: string
- summary: string
- key_events: string[]
- roles: string[]
Do not output markdown, comments, prose, or additional keys.
Chapter numbers must be continuous from 1 to ${totalChapters}.`;
}

function buildStructuredOutlineRepairSystemPrompt(totalChapters: number): string {
  return `You are a JSON repair engine.
Convert the given text into one valid JSON array with exactly ${totalChapters} objects.
Each object must contain exactly: chapter, title, summary, key_events, roles.
Do not output markdown or any explanation. Return JSON array only.`;
}

export const novelOutlinePrompt: PromptAsset<NovelOutlinePromptInput, string, string> = {
  id: "novel.outline.generate",
  version: "v1",
  taskType: "planner",
  mode: "text",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  render: (input) => {
    const referenceBlock = input.referenceContext?.trim()
      ? `\n\n参考资料（来自已有作品拆书分析，可借鉴但不必照搬）：\n${input.referenceContext}`
      : "";
    const initialPrompt = input.initialPrompt?.trim() ?? "";
    const initialPromptBlock = initialPrompt
      ? `\n\n用户本次生成补充提示词（优先参考，不能违背角色和世界设定）：\n${initialPrompt.slice(0, 2000)}`
      : "";

    return [
      new SystemMessage("你是一位专业的小说发展走向策划师，请严格基于给定角色设定输出完整发展走向，不得自行发明角色"),
      new HumanMessage(
        `小说标题：${input.title}
小说简介：${input.description}
核心角色（必须使用这些角色，不得替换或忽略）：
${input.charactersText}
世界上下文：
${input.worldContext}${referenceBlock}${initialPromptBlock}`,
      ),
    ];
  },
};

export const novelStructuredOutlinePrompt: PromptAsset<NovelStructuredOutlinePromptInput, string, string> = {
  id: "novel.structuredOutline.generate",
  version: "v1",
  taskType: "planner",
  mode: "text",
  language: "en",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  render: (input) => {
    const referenceBlock = input.referenceContext?.trim()
      ? `\n\n参考资料（来自已有作品拆书分析）：\n${input.referenceContext}`
      : "";

    return [
      new SystemMessage(buildStructuredOutlineSystemPrompt(input.totalChapters)),
      new HumanMessage(
        `核心角色（必须使用这些角色，不得替换或忽略）：
${input.charactersText}
世界上下文：
${input.worldContext}
基于下述发展走向，生成 ${input.totalChapters} 章规划：
${input.outline}${referenceBlock}

输出规则：
1. 只能输出 JSON 数组
2. 每个对象只能包含 chapter/title/summary/key_events/roles
3. chapter 必须从 1 开始连续编号
4. key_events 和 roles 必须是非空字符串数组`,
      ),
    ];
  },
};

export const novelStructuredOutlineRepairPrompt: PromptAsset<NovelStructuredOutlineRepairPromptInput, string, string> = {
  id: "novel.structuredOutline.repair",
  version: "v1",
  taskType: "planner",
  mode: "text",
  language: "en",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  render: (input) => [
    new SystemMessage(buildStructuredOutlineRepairSystemPrompt(input.totalChapters)),
    new HumanMessage(
      `请把下面内容修正为严格结构化 JSON 数组。
校验失败原因：${input.reason}

原始内容：
${input.rawContent}`,
    ),
  ],
};

export const novelBiblePrompt: PromptAsset<
  NovelBiblePromptInput,
  typeof novelBiblePayloadSchema._output
> = {
  id: "novel.bible.generate",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: novelBiblePayloadSchema,
  render: (input) => {
    const referenceBlock = input.referenceContext?.trim()
      ? `\n\n参考资料（来自已有作品拆书分析）：\n${input.referenceContext}`
      : "";

    return [
      new SystemMessage(
        `你是网文总编，请输出作品圣经 JSON：
{
  "coreSetting":"核心设定",
  "forbiddenRules":"禁止冲突规则",
  "mainPromise":"主线承诺",
  "characterArcs":"核心角色成长",
  "worldRules":"世界运行规则"
}
仅输出 JSON。`,
      ),
      new HumanMessage(
        `小说标题：${input.title}
类型：${input.genreName}
简介：${input.description}
角色：${input.charactersText}
世界上下文：
${input.worldContext}${referenceBlock}`,
      ),
    ];
  },
};

export const novelBeatPrompt: PromptAsset<
  NovelBeatPromptInput,
  z.infer<typeof novelBeatPayloadSchema>
> = {
  id: "novel.beat.generate",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: novelBeatPayloadSchema,
  render: (input) => {
    const referenceBlock = input.referenceContext?.trim()
      ? `\n\n参考资料（来自已有作品拆书分析）：\n${input.referenceContext}`
      : "";

    return [
      new SystemMessage(
        "你是网文剧情策划，请输出 JSON 数组，每项字段：chapterOrder/beatType/title/content/status",
      ),
      new HumanMessage(
        `小说标题：${input.title}
小说简介：${input.description}
世界上下文：${input.worldContext}
作品圣经：${input.bibleRawContent}
目标章节：${input.targetChapters}${referenceBlock}`,
      ),
    ];
  },
};

export const novelChapterHookPrompt: PromptAsset<
  NovelChapterHookPromptInput,
  z.infer<typeof novelChapterHookSchema>
> = {
  id: "novel.chapterHook.generate",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: novelChapterHookSchema,
  render: (input) => [
    new SystemMessage(
      "你是网文运营编辑。请输出 JSON：{\"hook\":\"章节末钩子\",\"nextExpectation\":\"下章期待点\"}",
    ),
    new HumanMessage(`章节标题：${input.title}\n章节内容：\n${input.content}`),
  ],
};
