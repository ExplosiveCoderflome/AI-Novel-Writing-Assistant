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
  return [
    "You are a structured novel outline planning engine.",
    "Your task is to generate a chapter-by-chapter outline for a novel as strict structured data, not prose.",
    "",
    "[Task Boundary]",
    "Output exactly one JSON array and nothing else.",
    `The array must contain exactly ${totalChapters} objects.`,
    "Do not output markdown, code fences, comments, explanations, or any text before or after the JSON.",
    "",
    "[Schema Requirements]",
    "Each object must contain exactly these keys, with no additional keys:",
    "- chapter: positive integer",
    "- title: string",
    "- summary: string",
    "- key_events: string[]",
    "- roles: string[]",
    "",
    "[Hard Constraints]",
    `Chapter numbers must be continuous integers from 1 to ${totalChapters}.`,
    "The value of chapter must match the chapter's actual position in the array.",
    "title must be a non-empty string and should feel like a real chapter title, not a placeholder.",
    "summary must be a non-empty string that explains what newly advances in that chapter and why the chapter matters in the story flow.",
    "key_events must contain 1-5 non-empty strings describing concrete developments, turns, reveals, conflicts, or decisions.",
    "roles must contain the major participating characters or forces that are materially involved in that chapter.",
    "",
    "[Quality Requirements]",
    "Each chapter must create real forward movement and should not feel like filler.",
    "Adjacent chapters must not repeat the same function, event pattern, or summary in different wording.",
    "The outline should show progression, escalation, turning points, and payoff rhythm across the full chapter sequence.",
    "Do not write vague generic summaries such as 'the plot continues' or 'tension rises'.",
    "Do not use placeholder role names unless they already exist in the provided context.",
    "",
    "[Consistency Rules]",
    "Do not introduce contradictions with the provided setting, characters, or prior constraints.",
    "Do not invent major new core characters, world rules, or premise shifts unless the user context explicitly supports them.",
    "Maintain continuity across chapters so later chapters feel like natural consequences of earlier ones.",
    "",
    "[Output Reminder]",
    "Return only the JSON array.",
  ].join("\n");
}

function buildStructuredOutlineRepairSystemPrompt(totalChapters: number): string {
  return [
    "You are a strict JSON repair engine.",
    "Your task is to transform the given input into a valid JSON array that strictly follows the required schema.",
    "",
    "[Task Boundary]",
    "Output exactly one JSON array and nothing else.",
    `The array must contain exactly ${totalChapters} objects.`,
    "Do not output markdown, code fences, comments, explanations, or any extra text.",
    "",
    "[Schema Requirements]",
    "Each object must contain exactly these keys (no more, no less):",
    "- chapter: positive integer",
    "- title: string",
    "- summary: string",
    "- key_events: string[]",
    "- roles: string[]",
    "",
    "[Hard Constraints]",
    `Chapter numbers must be continuous from 1 to ${totalChapters}.`,
    "The value of chapter must match its position in the array.",
    "All string fields must be non-empty.",
    "key_events must contain 1-5 non-empty strings.",
    "roles must contain at least 1 non-empty string.",
    "",
    "[Repair Rules]",
    "If the input contains extra fields, remove them.",
    "If required fields are missing, infer and fill them conservatively based on the input.",
    "If chapter count is incorrect, trim or expand to match the required count.",
    "If structure is broken, reconstruct it into valid JSON.",
    "If text contains non-JSON content, extract and convert it into valid JSON.",
    "",
    "[Consistency Rules]",
    "Preserve as much original content as possible while fixing structure.",
    "Do not invent major new plot elements or characters unless necessary to complete missing fields.",
    "Maintain logical continuity across chapters when possible.",
    "",
    "[Output Reminder]",
    "Return only the JSON array.",
  ].join("\n");
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
      ? `\n\n【参考资料（仅作技法参考，不得照搬结构或剧情）】\n${input.referenceContext}`
      : "";

    const initialPrompt = input.initialPrompt?.trim() ?? "";
    const initialPromptBlock = initialPrompt
      ? `\n\n【用户补充要求（优先参考，但不得违背既有角色与世界设定）】\n${initialPrompt.slice(0, 2000)}`
      : "";

    return [
      new SystemMessage([
        "你是长篇网络小说发展走向策划师。",
        "你的任务不是写正文，而是基于已有设定，输出一份具有可写性、可扩展性和连载潜力的整体发展走向。",
        "",
        "【任务边界】",
        "只输出小说发展走向，不写正文，不写对白，不写具体章节划分。",
        "不得输出解释、Markdown 或额外说明。",
        "",
        "【核心约束】",
        "1. 必须严格使用给定核心角色，不得新增、替换或忽略关键角色。",
        "2. 必须服从已有世界设定，不得引入冲突规则或越界设定。",
        "3. 不得无依据扩展大量世界观细节，重点放在剧情推进与结构设计。",
        "",
        "【输出目标】",
        "生成一份“可持续连载”的发展走向，而不是一次性完整剧透。",
        "需要同时具备：开局抓力、中段扩展空间、后段升级潜力。",
        "",
        "【结构要求】",
        "发展走向必须包含以下层次：",
        "1. 起始局面：主角当前处境、核心困境与初始驱动力。",
        "2. 主线驱动：贯穿全书的核心目标或问题。",
        "3. 冲突演化路径：从初级冲突 → 扩展冲突 → 复杂冲突的升级方式。",
        "4. 阶段性推进：明确多个阶段，每个阶段要有不同目标、压力来源与局面变化。",
        "5. 关键转折：至少设计数个会改变局面的关键节点（认知变化 / 关系变化 / 规则揭示 / 局势反转）。",
        "6. 成长与变化：主角在不同阶段的能力、认知或立场变化。",
        "7. 高层走向：整体发展方向与可能的终局趋势（但不要写死所有细节）。",
        "",
        "【连载导向要求】",
        "1. 前期必须快速建立主卖点与阅读钩子，避免长时间铺垫。",
        "2. 中期必须不断引入新变化（新压力 / 新关系 / 新局面），避免重复同一模式。",
        "3. 后期必须具备升级空间，避免过早封顶或提前透支高潮。",
        "4. 整体走向要保留可调整空间，不要把所有发展路径写死。",
        "",
        "【质量要求】",
        "1. 每个阶段都要体现“为什么值得写”，而不是泛泛推进。",
        "2. 避免重复同类冲突或同一套路循环。",
        "3. 优先强化人物处境、选择压力与情绪推动，而不是堆叠设定。",
        "4. 在信息不足时允许合理补强，但必须克制、连贯。",
      ].join("\n")),
      new HumanMessage([
        `小说标题：${input.title}`,
        `小说简介：${input.description}`,
        "",
        "【核心角色（必须使用，不得替换或忽略）】",
        input.charactersText,
        "",
        "【世界上下文】",
        input.worldContext,
        referenceBlock,
        initialPromptBlock,
        "",
        "请输出完整的发展走向。",
      ].join("\n")),
    ];
  },
};

export const novelStructuredOutlinePrompt: PromptAsset<
  NovelStructuredOutlinePromptInput,
  string,
  string
> = {
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
      ? `\n\n【参考资料（仅作技法参考，不得照搬剧情或结构）】\n${input.referenceContext}`
      : "";

    return [
      new SystemMessage([
        buildStructuredOutlineSystemPrompt(input.totalChapters),
        "",
        "[Content Requirements]",
        "The outline must reflect clear progression, escalation, and turning points across chapters.",
        "Each chapter must introduce meaningful change (event, decision, reveal, conflict, or consequence).",
        "Avoid filler chapters or repeated patterns across adjacent chapters.",
        "",
        "[Continuity Rules]",
        "All chapters must follow the provided outline direction and remain consistent with characters and world context.",
        "Do not introduce new core characters unless clearly implied by the context.",
        "Do not contradict established setting or prior developments.",
        "",
        "[Chapter Function Guidance]",
        "Early chapters must establish hook, situation, and main conflict.",
        "Middle chapters must expand, complicate, and escalate.",
        "Later chapters must intensify pressure and deliver partial or major payoffs.",
      ].join("\n")),
      new HumanMessage([
        "【核心角色（必须使用，不得替换或忽略）】",
        input.charactersText,
        "",
        "【世界上下文】",
        input.worldContext,
        "",
        "【发展走向（必须严格承接，不得偏离主线）】",
        input.outline,
        referenceBlock,
        "",
        `请基于以上内容，生成 ${input.totalChapters} 章的结构化章节规划。`,
        "",
        "【输出要求（必须严格遵守）】",
        "1. Only output a JSON array.",
        "2. Each object must contain exactly: chapter, title, summary, key_events, roles.",
        "3. chapter must be continuous from 1.",
        "4. key_events and roles must be non-empty string arrays.",
        "5. No explanations, no extra text.",
      ].join("\n")),
    ];
  },
};

export const novelStructuredOutlineRepairPrompt: PromptAsset<
  NovelStructuredOutlineRepairPromptInput,
  string,
  string
> = {
  id: "novel.structuredOutline.repair",
  version: "v1",
  taskType: "planner",
  mode: "text",
  language: "en",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  render: (input) => [
    new SystemMessage(
      [
        buildStructuredOutlineRepairSystemPrompt(input.totalChapters),
        "",
        "[Priority]",
        "Fix structural validity first (JSON shape, keys, count, types).",
        "Then ensure minimal semantic correctness while preserving original content.",
        "",
        "[Strict Enforcement]",
        "If input is partially valid, do not re-generate everything; repair in place.",
        "Do not add explanations or comments.",
      ].join("\n"),
    ),
    new HumanMessage(
      [
        "请将下面内容修正为严格结构化 JSON 数组（优先修结构，其次补语义）：",
        "",
        `【校验失败原因】`,
        input.reason,
        "",
        "【原始内容】",
        input.rawContent,
        "",
        "【输出要求（必须严格遵守）】",
        `- 必须输出 ${input.totalChapters} 个对象`,
        "- 每个对象只能包含：chapter, title, summary, key_events, roles",
        "- chapter 必须从 1 连续递增",
        "- 不允许输出任何解释或额外文本",
      ].join("\n"),
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
      ? `\n\n【参考资料（仅作技法与方向参考，不得照搬剧情或结构）】\n${input.referenceContext}`
      : "";

    return [
      new SystemMessage([
        "你是网文作品圣经规划助手。",
        "你的任务不是写正文，也不是扩写大纲，而是基于给定信息生成一份可供后续长期创作使用的作品圣经。",
        "",
        "【任务边界】",
        "只输出符合 schema 的严格 JSON。",
        "不要输出 Markdown、解释、注释、代码块或任何额外文本。",
        "不得新增 schema 之外的字段，不得缺漏已有字段。",
        "",
        "【输出字段要求】",
        "必须输出以下字段：",
        '1. coreSetting: 作品最核心的设定抓手，说明这本书最本质的世界/题材/冲突基础是什么。',
        '2. forbiddenRules: 创作中不得违背的硬规则、禁区或冲突边界，重点写“不能发生什么设定冲突”。',
        '3. mainPromise: 本书持续向读者提供的主线阅读承诺，说明读者为什么会追下去。',
        '4. characterArcs: 核心角色的成长主轴与变化方向，强调阶段性变化，不要泛泛而谈。',
        '5. worldRules: 世界运行规则、基本秩序、关键限制与因果边界，要求能约束后续创作。',
        "",
        "【核心约束】",
        "1. 必须严格基于输入的标题、类型、简介、角色与世界上下文生成。",
        "2. 不得脱离上下文臆造与主线无关的大设定。",
        "3. 不得忽略已给角色或把角色功能模糊化到无法指导后续写作。",
        "4. forbiddenRules 与 worldRules 必须真正可约束后续内容，不能写成空话。",
        "5. mainPromise 必须体现网文连载价值，不能只写主题口号。",
        "",
        "【质量要求】",
        "1. coreSetting 要抓“这本书最不可替代的骨头”，不能只是题材复述。",
        "2. forbiddenRules 要具体、清晰、可执行，避免“保持一致性”这类空泛表达。",
        "3. characterArcs 要体现角色在长期连载中的成长或变化方向，而不是静态标签。",
        "4. worldRules 要写出真正影响剧情推进的规则，而不是背景介绍。",
        "5. 整体内容要服务长期创作稳定性，适合作为后续分卷、拆章、续写的约束基础。",
        "",
        "【生成原则】",
        "信息不足时可以做保守补全，但必须克制、连贯，并优先保证设定稳定性。",
      ].join("\n")),
      new HumanMessage([
        `小说标题：${input.title}`,
        `类型：${input.genreName}`,
        `简介：${input.description}`,
        "",
        "【角色】",
        input.charactersText,
        "",
        "【世界上下文】",
        input.worldContext,
        referenceBlock,
        "",
        "请输出作品圣经 JSON。",
      ].join("\n")),
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
      ? `\n\n【参考资料（仅作技法与节奏参考，不得照搬剧情或结构）】\n${input.referenceContext}`
      : "";

    return [
      new SystemMessage([
        "你是网文剧情节拍规划助手。",
        "你的任务不是写正文，也不是输出散文式大纲，而是基于作品圣经与目标章节数，生成可供后续章节规划与写作使用的剧情 beat 列表。",
        "",
        "【任务边界】",
        "只输出符合 schema 的严格 JSON。",
        "不要输出 Markdown、解释、注释、代码块或任何额外文本。",
        "不得新增 schema 之外的字段，不得缺漏字段。",
        "",
        "【输出要求】",
        "输出必须是 JSON 数组。",
        "每一项必须完整包含以下字段：",
        "- chapterOrder",
        "- beatType",
        "- title",
        "- content",
        "- status",
        "",
        "【字段约束】",
        "1. chapterOrder 必须对应章节顺序，按 1 开始连续递增，且覆盖目标章节数。",
        "2. beatType 必须准确表达该章的主要节拍功能，例如开局建立、冲突升级、信息揭示、关系变化、局面反转、高潮兑现、尾部钩子等。",
        "3. title 必须像真实可用的节拍标题，清晰体现该章核心推进，不要写成空泛标签。",
        "4. content 必须写清本章具体推进了什么、改变了什么、它在整体节奏中的作用是什么。",
        "5. status 必须用于表示该 beat 当前所处状态，保持全数组语义一致，不得乱用。",
        "",
        "【核心约束】",
        "1. 必须严格承接小说简介、世界上下文与作品圣经，不得偏离主线承诺。",
        "2. 不得脱离上下文擅自发明新的核心角色、重大世界规则或主线方向。",
        "3. 每一章都必须有实质推进，不能出现纯填充、纯气氛、纯复述型 beat。",
        "4. 相邻章节的 beat 不能只是同义重复，必须体现推进、变化、升级、转向或兑现中的至少一种。",
        "5. 整体 beat 序列必须形成清晰节奏：前段立钩子与局面，中段扩展与升级，后段压迫与兑现。",
        "",
        "【质量要求】",
        "1. 前几章必须快速建立主局面、主冲突或主卖点，避免迟迟不进入故事。",
        "2. 中段必须不断引入新变量、新压力、新选择或新后果，避免线性重复加码。",
        "3. 后段必须体现阶段性回报、局势收束或更大悬念，而不是平推结束。",
        "4. content 要强调“本章为什么值得存在”，而不是泛泛概括剧情。",
        "5. 参考资料只能借鉴技法、节奏、组织方式，不能照搬角色关系、剧情结构或桥段。",
        "",
        "【生成原则】",
        "信息不足时允许保守补全，但必须保持连贯、克制，并优先保证节奏稳定性与可写性。",
      ].join("\n")),
      new HumanMessage([
        `小说标题：${input.title}`,
        `小说简介：${input.description}`,
        "",
        "【世界上下文】",
        input.worldContext,
        "",
        "【作品圣经】",
        input.bibleRawContent,
        "",
        `【目标章节数】${input.targetChapters}`,
        referenceBlock,
        "",
        "请输出对应的剧情 beat JSON 数组。",
      ].join("\n")),
    ];
  },
};

export const novelChapterHookPrompt: PromptAsset<
  NovelChapterHookPromptInput,
  z.infer<typeof novelChapterHookSchema>
> = {
  id: "novel.chapterHook.generate",
  version: "v2",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: novelChapterHookSchema,
  render: (input) => [
    new SystemMessage([
      "你是网文章节钩子规划助手。",
      "你的任务不是改写正文，而是基于当前章节内容，提炼一个有效的章节末钩子与下章期待点。",
      "",
      "【任务边界】",
      "只输出符合 schema 的严格 JSON。",
      "不要输出 Markdown、解释、注释、代码块或任何额外文本。",
      "不得新增 schema 之外的字段，不得缺漏字段。",
      "",
      "【输出格式】",
      '必须输出：{"hook":"章节末钩子","nextExpectation":"下章期待点"}',
      "",
      "【字段要求】",
      "1. hook 必须像真实网文章节末尾会形成的追读钩子，优先体现悬念、突发变化、未完成决策、风险升级、信息揭示后的余波或局面骤变。",
      "2. nextExpectation 必须明确说明读者自然会期待下一章看到什么推进，不能空泛写成“后续发展”“接下来会怎样”。",
      "",
      "【核心约束】",
      "1. 必须严格基于当前章节标题与章节内容生成，不得脱离内容臆造重大事件。",
      "2. hook 必须承接本章已发生的推进结果，像从正文自然延伸出来，而不是凭空加一个外来悬念。",
      "3. nextExpectation 必须与 hook 构成连续关系，说明下一章最值得看的兑现方向。",
      "4. 不要重复本章正文的大段原句，要做提炼与重组。",
      "5. 不要把 hook 写成总结句、主题句、抒情句或空泛感叹句。",
      "",
      "【质量要求】",
      "1. 优先让 hook 具备即时追读力，而不是宽泛概括剧情。",
      "2. 如果本章结尾是决策前夜，hook 应突出决策压力；如果本章结尾是异常暴露，hook 应突出后果或真相入口；如果本章结尾是局面逆转，hook 应突出新的不稳定状态。",
      "3. nextExpectation 要具体到‘下一章大概率会推进什么’，而不是抽象情绪。",
      "4. 信息不足时也要给出保守但有效的钩子，不要写空话。",
    ].join("\n")),
    new HumanMessage([
      `章节标题：${input.title}`,
      "",
      "【章节内容】",
      input.content,
      "",
      "请输出章节末钩子 JSON。",
    ].join("\n")),
  ],
};