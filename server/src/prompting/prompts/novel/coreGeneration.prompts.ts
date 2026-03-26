import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import { novelBiblePayloadSchema } from "../../../services/novel/novelCoreSchemas";
import type { StructuredOutlineChapter } from "../../../services/novel/structuredOutline";

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

const structuredOutlineChapterSchema = z.object({
  chapter: z.coerce.number().int().positive(),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  key_events: z.array(z.string().trim().min(1)).min(1),
  roles: z.array(z.string().trim().min(1)).min(1),
}).strict();

const structuredOutlineArraySchema = z.array(structuredOutlineChapterSchema).min(1);

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

function buildReferenceBlock(referenceContext?: string): string {
  const value = referenceContext?.trim();
  if (!value) {
    return "";
  }
  return `\n\n参考资料（来自已有作品拆书分析，可借鉴结构、节奏与冲突组织方式，但不得照搬具体桥段、设定、角色关系或措辞）：\n${value}`;
}

function normalizeStructuredOutlineOutput(
  output: z.infer<typeof structuredOutlineArraySchema>,
  input: NovelStructuredOutlinePromptInput,
): StructuredOutlineChapter[] {
  if (output.length !== input.totalChapters) {
    throw new Error(`Structured outline chapter count mismatch. Expected ${input.totalChapters}, got ${output.length}.`);
  }

  const chapters = output
    .map((item) => ({
      chapter: item.chapter,
      title: item.title.trim(),
      summary: item.summary.trim(),
      key_events: item.key_events.map((value) => value.trim()),
      roles: item.roles.map((value) => value.trim()),
    }))
    .sort((a, b) => a.chapter - b.chapter);

  const chapterSet = new Set<number>();
  for (const chapter of chapters) {
    if (chapterSet.has(chapter.chapter)) {
      throw new Error(`Structured outline has duplicated chapter number: ${chapter.chapter}.`);
    }
    chapterSet.add(chapter.chapter);
  }

  for (let index = 0; index < chapters.length; index += 1) {
    if (chapters[index].chapter !== index + 1) {
      throw new Error(`Structured outline chapter numbering must be continuous from 1 to ${input.totalChapters}.`);
    }
  }

  return chapters;
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
    const referenceBlock = buildReferenceBlock(input.referenceContext);
    const initialPrompt = input.initialPrompt?.trim()
      ? `\n\n用户本次补充要求（优先参考，但不得违背既有角色设定、世界规则和小说主方向）：\n${input.initialPrompt.trim().slice(0, 2000)}`
      : "";

    return [
      new SystemMessage([
        "你是一名长篇网文策划编辑，负责为小说生成可持续推进的发展走向稿。",
        "你必须严格基于给定书名、简介、角色和世界上下文进行规划，不得擅自替换核心角色、突破世界规则或发明与输入冲突的新设定。",
        "",
        "输出要求：",
        "1. 只输出最终正文，不要输出解释、标题、备注或代码块。",
        "2. 结果必须像后续创作可以直接参考的长篇发展路线，而不是泛泛简介。",
        "3. 必须体现主线目标、阶段推进、关键冲突、人物作用、关系变化、转折与后续牵引。",
        "4. 必须适合长篇连载，避免一口气把所有高潮耗尽，也不要空泛概括。",
        "5. 如果存在参考资料，只能借鉴结构方法和节奏经验，不能照搬具体内容。",
      ].join("\n")),
      new HumanMessage(
        `小说标题：${input.title}
小说简介：${input.description}
核心角色（必须使用这些角色，不得替换或忽略）：
${input.charactersText}
世界上下文：
${input.worldContext}${referenceBlock}${initialPrompt}

请直接输出这本小说的发展走向稿。`,
      ),
    ];
  },
};

export const novelStructuredOutlinePrompt: PromptAsset<
  NovelStructuredOutlinePromptInput,
  StructuredOutlineChapter[],
  z.infer<typeof structuredOutlineArraySchema>
> = {
  id: "novel.structuredOutline.generate",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: structuredOutlineArraySchema,
  semanticRetryPolicy: {
    maxAttempts: 1,
  },
  postValidate: (output, input) => normalizeStructuredOutlineOutput(output, input),
  render: (input) => {
    const referenceBlock = buildReferenceBlock(input.referenceContext);
    return [
      new SystemMessage([
        "你是一名长篇小说结构规划师，负责把发展走向稿拆成严格结构化的章节大纲。",
        "你只允许输出 JSON 数组，不得输出 Markdown、解释或额外文本。",
        "",
        "硬性格式：",
        "1. 每个对象只能包含 chapter、title、summary、key_events、roles 五个字段。",
        "2. chapter 必须从 1 开始连续编号，到指定章节数结束。",
        "3. title 和 summary 必须是非空字符串。",
        "4. key_events 和 roles 必须是非空字符串数组。",
        "5. 总条目数必须等于目标章节数。",
        "",
        "内容要求：",
        "1. 必须严格沿着既定发展走向展开，不得偏离主线。",
        "2. 每章都要有明确推进价值，不能写成重复的空章节。",
        "3. roles 只填写本章关键承担推进功能的角色。",
        "4. key_events 需要具体，不要写“推进剧情”“矛盾升级”这类空话。",
      ].join("\n")),
      new HumanMessage(
        `核心角色：
${input.charactersText}

世界上下文：
${input.worldContext}

发展走向稿：
${input.outline}${referenceBlock}

目标章节数：${input.totalChapters}

请输出严格符合要求的 JSON 数组。`,
      ),
    ];
  },
};

export const novelBiblePrompt: PromptAsset<
  NovelBiblePromptInput,
  z.infer<typeof novelBiblePayloadSchema>
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
    const referenceBlock = buildReferenceBlock(input.referenceContext);
    return [
      new SystemMessage([
        "你是一名网文总编，负责生成约束后续创作的作品圣经。",
        "你只允许输出一个 JSON 对象，不得输出 Markdown、解释或额外文本。",
        "",
        "固定字段：",
        '{ "coreSetting": "", "forbiddenRules": "", "mainPromise": "", "characterArcs": "", "worldRules": "" }',
        "",
        "要求：",
        "1. 所有字段都要可用于后续规划和写作约束，不能空泛。",
        "2. forbiddenRules 要明确写出不能触碰的冲突或写法。",
        "3. mainPromise 要写清读者持续追更会得到什么回报。",
        "4. characterArcs 要提炼核心角色的成长逻辑，而不是人物履历。",
        "5. worldRules 要写清世界规则如何影响剧情推进。",
      ].join("\n")),
      new HumanMessage(
        `小说标题：${input.title}
类型：${input.genreName}
小说简介：${input.description}
核心角色：${input.charactersText}
世界上下文：
${input.worldContext}${referenceBlock}

请输出作品圣经 JSON。`,
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
    const referenceBlock = buildReferenceBlock(input.referenceContext);
    return [
      new SystemMessage([
        "你是一名网文剧情 Beat 策划师，负责把小说推进拆成章节级节拍列表。",
        "你只允许输出 JSON 数组，不得输出 Markdown、解释或额外文本。",
        "",
        "每个数组项只能包含 chapterOrder、beatType、title、content、status。",
        "chapterOrder 必须从 1 连续编号到目标章节数。",
        "beatType 要体现本章结构功能，例如 setup、progress、pressure、twist、reveal、payoff、hook。",
        "content 必须具体写清本章发生什么以及如何推进主线，不能写空话。",
        "status 通常填 planned，保持简单稳定。",
      ].join("\n")),
      new HumanMessage(
        `小说标题：${input.title}
小说简介：${input.description}
世界上下文：
${input.worldContext}

作品圣经：
${input.bibleRawContent}${referenceBlock}

目标章节数：${input.targetChapters}

请输出完整的章节节拍 JSON 数组。`,
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
    new SystemMessage([
      "你是一名网文运营编辑，负责提炼单章结尾的追更牵引点。",
      "你只允许输出一个 JSON 对象，不得输出 Markdown、解释或额外文本。",
      '固定格式：{ "hook": "", "nextExpectation": "" }',
      "",
      "要求：",
      "1. hook 要抓住本章结尾最能吊住读者的悬点、反转、危险或关系变化。",
      "2. nextExpectation 要明确写出读者最自然会期待下一章兑现什么。",
      "3. 只能基于给定章节内容提炼，不得编造正文中不存在的新事件。",
      "4. 语言要短、准、抓人，不要泛泛总结整章。",
    ].join("\n")),
    new HumanMessage(
      `章节标题：${input.title}

章节内容：
${input.content}`,
    ),
  ],
};
