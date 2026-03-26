import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type {
  VolumeChapterPlan,
  VolumePlan,
} from "@ai-novel/shared/types/novel";
import type { StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";
import type { PromptAsset } from "../../core/promptTypes";
import type {
  ChapterDetailMode,
  VolumeGenerationNovel,
  VolumeWorkspace,
} from "../../../services/novel/volume/volumeModels";
import {
  createBookVolumeSkeletonSchema,
  createChapterBoundarySchema,
  createChapterPurposeSchema,
  createChapterTaskSheetSchema,
  createVolumeChapterListSchema,
} from "../../../services/novel/volume/volumeGenerationSchemas";

interface VolumeSkeletonPromptInput {
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: StoryMacroPlan | null;
  guidance?: string;
  chapterBudget: number;
  targetVolumeCount: number;
  chapterBudgets: number[];
}

interface VolumeChapterListPromptInput {
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  targetVolume: VolumePlan;
  previousVolume?: VolumePlan;
  nextVolume?: VolumePlan;
  storyMacroPlan: StoryMacroPlan | null;
  guidance?: string;
  chapterBudget: number;
  targetChapterCount: number;
}

interface VolumeChapterDetailPromptInput {
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  targetVolume: VolumePlan;
  targetChapter: VolumeChapterPlan;
  storyMacroPlan: StoryMacroPlan | null;
  guidance?: string;
  detailMode: ChapterDetailMode;
}

function parseCommercialTags(commercialTagsJson: string | null | undefined): string[] {
  try {
    return commercialTagsJson ? JSON.parse(commercialTagsJson) as string[] : [];
  } catch {
    return [];
  }
}

function serializePromptJson(value: unknown, maxLength = 2400): string {
  if (value == null) {
    return "无";
  }
  const raw = JSON.stringify(value);
  if (!raw) {
    return "无";
  }
  if (raw.length <= maxLength) {
    return raw;
  }
  return `${raw.slice(0, maxLength)}...`;
}

function buildCharacterContext(novel: VolumeGenerationNovel): string {
  if (novel.characters.length === 0) {
    return "无";
  }
  return novel.characters
    .map((item) => `${item.name}|${item.role}|goal=${item.currentGoal ?? "无"}|state=${item.currentState ?? "无"}`)
    .join("\n");
}

function buildCompactVolumeCard(volume: VolumePlan): string {
  return [
    `第${volume.sortOrder}卷《${volume.title}》`,
    `章节数：${volume.chapters.length}`,
    `卷摘要：${volume.summary ?? "无"}`,
    `主承诺：${volume.mainPromise ?? "无"}`,
    `升级方式：${volume.escalationMode ?? "无"}`,
    `主角变化：${volume.protagonistChange ?? "无"}`,
    `卷末高潮：${volume.climax ?? "无"}`,
    `下卷钩子：${volume.nextVolumeHook ?? "无"}`,
    volume.openPayoffs.length > 0 ? `未兑现事项：${volume.openPayoffs.join("、")}` : "未兑现事项：无",
  ].join("\n");
}

function buildCompactVolumeContext(volumes: VolumePlan[]): string {
  if (volumes.length === 0) {
    return "无";
  }
  return volumes
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((volume) => buildCompactVolumeCard(volume))
    .join("\n\n");
}

function buildCurrentVolumeChapterContext(volume: VolumePlan): string {
  if (volume.chapters.length === 0) {
    return "无";
  }
  return volume.chapters
    .slice()
    .sort((a, b) => a.chapterOrder - b.chapterOrder)
    .map((chapter) => `第${chapter.chapterOrder}章《${chapter.title}》：${chapter.summary || "待补充摘要"}`)
    .join("\n");
}

function buildNeighborChapterContext(volume: VolumePlan, chapterId: string): string {
  const index = volume.chapters.findIndex((chapter) => chapter.id === chapterId);
  if (index < 0) {
    return "无";
  }
  const lines: string[] = [];
  const previous = index > 0 ? volume.chapters[index - 1] : null;
  const current = volume.chapters[index];
  const next = index < volume.chapters.length - 1 ? volume.chapters[index + 1] : null;

  if (previous) {
    lines.push(`上一章：第${previous.chapterOrder}章《${previous.title}》：${previous.summary || "无摘要"}`);
  }
  lines.push(`当前章：第${current.chapterOrder}章《${current.title}》：${current.summary || "无摘要"}`);
  if (next) {
    lines.push(`下一章：第${next.chapterOrder}章《${next.title}》：${next.summary || "无摘要"}`);
  }

  return lines.join("\n");
}

function buildCurrentChapterDetailDraft(
  chapter: VolumeChapterPlan,
  detailMode: ChapterDetailMode,
): string {
  if (detailMode === "purpose") {
    return `当前章节目标草稿：${chapter.purpose?.trim() || "暂无，请先补出首版。"}`;
  }
  if (detailMode === "boundary") {
    return [
      `当前冲突等级：${typeof chapter.conflictLevel === "number" ? chapter.conflictLevel : "暂无"}`,
      `当前揭露等级：${typeof chapter.revealLevel === "number" ? chapter.revealLevel : "暂无"}`,
      `当前目标字数：${typeof chapter.targetWordCount === "number" ? chapter.targetWordCount : "暂无"}`,
      `当前禁止事项：${chapter.mustAvoid?.trim() || "暂无"}`,
      `当前兑现关联：${chapter.payoffRefs.length > 0 ? chapter.payoffRefs.join("、") : "暂无"}`,
    ].join("\n");
  }
  return `当前任务单草稿：${chapter.taskSheet?.trim() || "暂无，请先补出首版。"}`;
}

function buildBookSkeletonPrompt(params: VolumeSkeletonPromptInput): string {
  const { novel, workspace, storyMacroPlan, guidance, chapterBudget, targetVolumeCount, chapterBudgets } = params;
  const commercialTags = parseCommercialTags(novel.commercialTagsJson);
  return [
    "工作模式：全书卷骨架生成",
    "这一步只做卷级骨架，不要拆章节列表。",
    `小说标题：${novel.title}`,
    `题材：${novel.genre?.name ?? "未设置"}`,
    novel.storyModePromptBlock?.trim() ? novel.storyModePromptBlock.trim() : "",
    `简介：${novel.description ?? "无"}`,
    `目标读者：${novel.targetAudience ?? "无"}`,
    `卖点：${novel.bookSellingPoint ?? "无"}`,
    `竞品体感：${novel.competingFeel ?? "无"}`,
    `前30章承诺：${novel.first30ChapterPromise ?? "无"}`,
    `商业标签：${commercialTags.join("、") || "无"}`,
    `叙事视角：${novel.narrativePov ?? "未设置"}`,
    `节奏偏好：${novel.pacePreference ?? "未设置"}`,
    `情绪强度：${novel.emotionIntensity ?? "未设置"}`,
    `全书章节预算：${chapterBudget}`,
    `必须保持卷数：${targetVolumeCount}`,
    `建议每卷章节预算：${chapterBudgets.map((count, index) => `第${index + 1}卷约 ${count} 章`).join("；")}`,
    `角色上下文：${buildCharacterContext(novel)}`,
    `当前卷骨架摘要：${buildCompactVolumeContext(workspace.volumes)}`,
    storyMacroPlan?.decomposition ? `故事拆解：${serializePromptJson(storyMacroPlan.decomposition)}` : "故事拆解：无",
    storyMacroPlan?.constraintEngine ? `约束引擎：${serializePromptJson(storyMacroPlan.constraintEngine)}` : "约束引擎：无",
    guidance?.trim() ? `额外指令：${guidance.trim()}` : "",
  ].filter(Boolean).join("\n\n");
}

function buildVolumeChapterListPrompt(params: VolumeChapterListPromptInput): string {
  const { novel, workspace, targetVolume, previousVolume, nextVolume, storyMacroPlan, guidance, chapterBudget, targetChapterCount } = params;
  const commercialTags = parseCommercialTags(novel.commercialTagsJson);
  return [
    "工作模式：单卷章节列表生成",
    "这一步只生成章节标题和章节摘要，不要输出章节目标、执行边界、任务单。",
    `小说标题：${novel.title}`,
    `题材：${novel.genre?.name ?? "未设置"}`,
    novel.storyModePromptBlock?.trim() ? novel.storyModePromptBlock.trim() : "",
    `简介：${novel.description ?? "无"}`,
    `目标读者：${novel.targetAudience ?? "无"}`,
    `卖点：${novel.bookSellingPoint ?? "无"}`,
    `竞品体感：${novel.competingFeel ?? "无"}`,
    `前30章承诺：${novel.first30ChapterPromise ?? "无"}`,
    `商业标签：${commercialTags.join("、") || "无"}`,
    `叙事视角：${novel.narrativePov ?? "未设置"}`,
    `节奏偏好：${novel.pacePreference ?? "未设置"}`,
    `情绪强度：${novel.emotionIntensity ?? "未设置"}`,
    `角色上下文：${buildCharacterContext(novel)}`,
    `全书章节预算：${chapterBudget}`,
    `全书卷数：${Math.max(workspace.volumes.length, 1)}`,
    `本次只允许输出第${targetVolume.sortOrder}卷，目标章节数：${targetChapterCount}`,
    `上一卷摘要：${previousVolume ? buildCompactVolumeCard(previousVolume) : "无"}`,
    `当前卷设定：${buildCompactVolumeCard(targetVolume)}`,
    `当前卷现有章节列表：${buildCurrentVolumeChapterContext(targetVolume)}`,
    `下一卷摘要：${nextVolume ? buildCompactVolumeCard(nextVolume) : "无"}`,
    `全书卷骨架摘要：${buildCompactVolumeContext(workspace.volumes)}`,
    storyMacroPlan?.decomposition ? `故事拆解：${serializePromptJson(storyMacroPlan.decomposition, 1800)}` : "故事拆解：无",
    storyMacroPlan?.constraintEngine ? `约束引擎：${serializePromptJson(storyMacroPlan.constraintEngine, 1800)}` : "约束引擎：无",
    guidance?.trim() ? `额外指令：${guidance.trim()}` : "",
  ].filter(Boolean).join("\n\n");
}

function buildChapterDetailPrompt(params: VolumeChapterDetailPromptInput): string {
  const { novel, workspace, targetVolume, targetChapter, storyMacroPlan, guidance, detailMode } = params;
  const commercialTags = parseCommercialTags(novel.commercialTagsJson);
  const detailInstruction = detailMode === "purpose"
    ? "请围绕当前章节摘要和卷纲位置，优先在已有章节目标草稿基础上修正、补强和收束；如果草稿为空，再补出首版。"
    : detailMode === "boundary"
      ? "请围绕当前章节摘要和已有边界草稿，修正冲突等级、揭露等级、目标字数、禁止事项和兑现关联；缺失项补齐，已有项优先优化而不是推翻。"
      : "请围绕当前章节摘要和已有任务单草稿，把任务单修正成更可执行的写作指令；如果草稿为空，再补出首版。";

  return [
    `工作模式：章节细化修正（${detailMode}）`,
    detailInstruction,
    "修正原则：不要改动章节标题和摘要；优先沿用已确定的信息，只修正空缺、模糊、重复或不够可执行的部分。",
    `小说标题：${novel.title}`,
    `题材：${novel.genre?.name ?? "未设置"}`,
    novel.storyModePromptBlock?.trim() ? novel.storyModePromptBlock.trim() : "",
    `简介：${novel.description ?? "无"}`,
    `目标读者：${novel.targetAudience ?? "无"}`,
    `卖点：${novel.bookSellingPoint ?? "无"}`,
    `竞品体感：${novel.competingFeel ?? "无"}`,
    `前30章承诺：${novel.first30ChapterPromise ?? "无"}`,
    `商业标签：${commercialTags.join("、") || "无"}`,
    `角色上下文：${buildCharacterContext(novel)}`,
    `当前卷设定：${buildCompactVolumeCard(targetVolume)}`,
    `章节邻接上下文：${buildNeighborChapterContext(targetVolume, targetChapter.id)}`,
    buildCurrentChapterDetailDraft(targetChapter, detailMode),
    `全书卷骨架摘要：${buildCompactVolumeContext(workspace.volumes)}`,
    storyMacroPlan?.decomposition ? `故事拆解：${serializePromptJson(storyMacroPlan.decomposition, 1800)}` : "故事拆解：无",
    storyMacroPlan?.constraintEngine ? `约束引擎：${serializePromptJson(storyMacroPlan.constraintEngine, 1800)}` : "约束引擎：无",
    guidance?.trim() ? `额外指令：${guidance.trim()}` : "",
  ].filter(Boolean).join("\n\n");
}

function createVolumeDetailSystemPrompt(detailMode: ChapterDetailMode): string {
  if (detailMode === "purpose") {
    return [
      "你是资深网文编辑，负责对“单章目标”进行收敛与强化，使其可直接指导写作。",
      "",
      "只输出严格 JSON，不要输出解释、Markdown、注释或额外文本。",
      "",
      "任务要求：",
      "1. 优先基于已有草稿做修正、补强与收束；仅在为空时补出首版。",
      "2. 目标必须聚焦“本章要推进什么”，而不是复述内容或写摘要。",
      "3. 必须体现至少一个核心推进：剧情推进 / 关系变化 / 信息兑现 / 冲突升级。",
      "4. 避免空话，如“推动剧情发展”“增加冲突张力”。",
      "",
      "质量标准：",
      "1. 表达必须具体，可直接指导写作。",
      "2. 只能写一条核心目标，不要拆成多点列表。",
      "3. 不要引入未在当前上下文出现的新设定或新角色。",
      "",
      "输出规则：",
      "最终 JSON 只能包含字段：purpose",
      "示例：{\"purpose\":\"本章必须推进主角与反派的第一次正面试探，并暴露一个关键弱点\"}",
      "禁止使用中文键名。",
    ].join("\n");
  }

  if (detailMode === "boundary") {
    return [
      "你是资深网文编辑，负责为单章定义“执行边界”，用于约束写作阶段不跑偏。",
      "",
      "只输出严格 JSON，不要输出解释、Markdown、注释或额外文本。",
      "",
      "任务要求：",
      "1. 优先沿用已有边界草稿，修正空缺、模糊或不合理之处，不要无故推翻已成立方向。",
      "2. 所有字段必须可执行，不能写抽象概念。",
      "",
      "字段规则：",
      "1. conflictLevel：0-100 整数，表示本章冲突强度（必须与当前剧情阶段匹配）。",
      "2. revealLevel：0-100 整数，表示信息揭露程度（控制信息释放节奏）。",
      "3. targetWordCount：合理字数范围，需符合章节节奏（避免过短或冗长）。",
      "4. mustAvoid：数组，写明确禁止事项（如避免重复场景、避免无效对话、避免提前揭露等）。",
      "5. payoffRefs：数组，写本章必须触碰或兑现的伏笔、承诺或前文铺垫。",
      "",
      "质量标准：",
      "1. 各字段之间必须一致，例如高 conflictLevel 不应配低信息密度推进。",
      "2. mustAvoid 必须具体，不能写“避免无聊”“避免拖沓”。",
      "3. payoffRefs 必须指向明确内容，而不是泛指“前文伏笔”。",
      "",
      "输出规则：",
      "最终 JSON 只能包含字段：conflictLevel、revealLevel、targetWordCount、mustAvoid、payoffRefs",
      "禁止使用中文键名。",
    ].join("\n");
  }

  return [
    "你是资深网文编辑，负责为单章生成“可直接执行的任务单”。",
    "",
    "只输出严格 JSON，不要输出解释、Markdown、注释或额外文本。",
    "",
    "任务要求：",
    "1. 优先基于已有任务单进行修正与补强；仅在为空时补出首版。",
    "2. 任务单必须可直接指导写作，不是摘要或分析。",
    "",
    "内容要求：",
    "任务单必须同时包含：",
    "1. 本章情绪基调（例如压迫、试探、爆发、回收等）。",
    "2. 核心冲突（谁与谁，在什么层面产生对抗）。",
    "3. 关键推进点（这一章具体推进了什么）。",
    "4. 收尾要求（这一章必须留下什么状态或钩子）。",
    "",
    "质量标准：",
    "1. 表达必须具体、可执行，避免空话。",
    "2. 不要拆成列表或多字段，必须整合成一段可读文本。",
    "3. 不得引入未出现的新设定或角色。",
    "",
    "输出规则：",
    "最终 JSON 只能包含字段：taskSheet",
    "示例：{\"taskSheet\":\"本章以压迫氛围展开，主角在被试探中暴露弱点，同时反向获取关键信息，结尾必须留下更大的威胁信号\"}",
    "禁止使用中文键名。",
  ].join("\n");
}

export function createVolumeSkeletonPrompt(
  targetVolumeCount: number
): PromptAsset<
  VolumeSkeletonPromptInput,
  ReturnType<typeof createBookVolumeSkeletonSchema>["_output"]
> {
  return {
    id: "novel.volume.skeleton",
    version: "v1",
    taskType: "planner",
    mode: "structured",
    language: "zh",
    contextPolicy: {
      maxTokensBudget: 0,
    },
    outputSchema: createBookVolumeSkeletonSchema(targetVolumeCount),
    render: (input) => [
      new SystemMessage([
        "你是擅长长篇网文结构设计的总策划，负责把整本书拆成“卷级骨架”。",
        "你的任务不是写章节列表，也不是扩写剧情细节，而是给出可直接用于后续分卷开发的结构化卷纲。",
        "",
        "只输出严格 JSON，不要输出 Markdown、解释、注释、代码块或额外文本。",
        "输出必须包含 volumes 数组。",
        `必须严格输出 ${input.targetVolumeCount} 卷，不能增减卷数。`,
        "",
        "结构规则：",
        "1. volumes 数组长度必须与目标卷数完全一致。",
        "2. 每一卷都必须且只能包含以下字段：title、mainPromise、escalationMode、protagonistChange、climax、nextVolumeHook。",
        "3. 不得新增字段，不得删除字段，不得改字段名。",
        "4. 禁止输出章节列表，这一步只做卷级骨架。",
        "",
        "卷级规划原则：",
        "1. 每一卷都必须承担清晰的阶段性结构作用，而不是简单把剧情平均切段。",
        "2. 每一卷都要有独立承诺、独立升级方式、阶段高潮，以及把读者推向下一卷的钩子。",
        "3. 各卷之间必须形成递进关系，不能每卷都重复同一种冲突模式。",
        "4. 卷与卷之间要体现主角处境、压力等级、关系格局或目标难度的变化。",
        "5. 整体结构必须服务长篇连载，不要前强后弱，也不要中段塌陷。",
        "",
        "字段要求：",
        "1. title：卷名要像真实网文分卷标题，简洁、有辨识度，不要占位词。",
        "2. mainPromise：写清这一卷主要兑现给读者什么，例如主线推进、关系升级、设定展开、阶段反击、身份揭示等，不能空泛。",
        "3. escalationMode：写清这一卷是通过什么方式升级压力或提高看点，例如敌人升级、局势反转、代价抬高、关系失衡、规则揭露等。",
        "4. protagonistChange：写清主角在这一卷结束后会发生什么阶段性变化，可以是认知、能力、处境、立场、关系位置的变化。",
        "5. climax：写清这一卷最大的爆点、兑现点或阶段决战，不要只写“高潮战斗”“矛盾爆发”这种空话。",
        "6. nextVolumeHook：写清卷末如何把读者顺势推入下一卷，必须体现新的问题、代价、威胁或更高层目标。",
        "",
        "质量要求：",
        "1. 所有字段都必须具体、清楚、可直接用于后续细化。",
        "2. 不要写空泛套话，如“剧情升级”“人物成长”“矛盾加深”。",
        "3. 各卷内容必须彼此区分，不能像同一个模板换标题。",
        "4. 结果必须与输入中的书级方向保持一致，不得跑题。",
      ].join("\n")),
      new HumanMessage(buildBookSkeletonPrompt(input)),
    ],
  };
}

export function createVolumeChapterListPrompt(
  targetChapterCount: number
): PromptAsset<
  VolumeChapterListPromptInput,
  ReturnType<typeof createVolumeChapterListSchema>["_output"]
> {
  return {
    id: "novel.volume.chapter_list",
    version: "v1",
    taskType: "planner",
    mode: "structured",
    language: "zh",
    contextPolicy: {
      maxTokensBudget: 0,
    },
    outputSchema: createVolumeChapterListSchema(targetChapterCount),
    render: (input) => [
      new SystemMessage([
        "你是擅长长篇网文章节拆分的章纲策划，负责把单卷骨架拆成可直接继续细化的章节列表。",
        "你的任务不是写正文，不是写任务单，也不是写执行边界，而是输出“本卷的章节清单”。",
        "",
        "只输出严格 JSON，不要输出 Markdown、解释、注释、代码块或额外文本。",
        "输出必须包含 chapters 数组。",
        `只允许为第 ${input.targetVolume.sortOrder} 卷生成 ${input.targetChapterCount} 个章节，不能增减章节数。`,
        "",
        "结构规则：",
        "1. chapters 数组长度必须与目标章节数完全一致。",
        "2. 每章只允许输出以下字段：title、summary。",
        "3. 不得新增字段，不得删除字段，不得改字段名。",
        "4. 禁止输出章节目标、执行边界、任务单或其他扩展结构。",
        "",
        "章节拆分原则：",
        "1. 所有章节必须严格服务于当前这一卷的卷目标、卷承诺、升级方式、卷高潮与卷末钩子。",
        "2. 章节之间必须形成连续推进，而不是一组松散事件。",
        "3. 每章都要承担明确功能，不能出现无效过渡章或重复章。",
        "4. 本卷前段要负责进入局面和建立问题，中段要持续升级，后段要收束并推向卷高潮与下一卷钩子。",
        "5. 章节分布要符合连载节奏，不要前松后挤，也不要平均切块到毫无起伏。",
        "",
        "title 要求：",
        "1. title 必须像真实网文章节名，简洁、明确、有吸引力。",
        "2. 不要使用占位词或机械编号式标题。",
        "3. 标题要能体现该章最核心的事件、异常、冲突或悬念，但不要剧透过度。",
        "",
        "summary 要求：",
        "1. summary 必须用 1-3 句写清这一章具体发生什么，以及它如何推进本卷。",
        "2. 必须具体到事件、冲突、关系变化、信息揭露或局势变化，不能写成抽象套话。",
        "3. 不要写“推动剧情发展”“矛盾升级”“主角成长”这类空泛表述。",
        "4. summary 要体现这一章相对上一章的新推进，而不是复述卷简介。",
        "5. 每章 summary 都应能直接作为后续细化章纲的基础。",
        "",
        "质量要求：",
        "1. 各章之间必须有明显递进关系，避免同质重复。",
        "2. 至少应有若干章节承担钩子、转折、压迫升级、阶段兑现或高潮前置功能。",
        "3. 卷末几章必须明显朝卷高潮与 next hook 收束，不要自然散掉。",
        "4. 整体结果必须与当前卷骨架保持一致，不得跑题或另起一套故事。",
        "",
        "风格要求：",
        "1. 全部内容使用简体中文。",
        "2. 表达清楚、具体、可执行，像可直接交给后续细化流程的章纲草案。",
      ].join("\n")),
      new HumanMessage(buildVolumeChapterListPrompt(input)),
    ],
  };
}

export const volumeChapterPurposePrompt: PromptAsset<VolumeChapterDetailPromptInput, ReturnType<typeof createChapterPurposeSchema>["_output"]> = {
  id: "novel.volume.chapter_purpose",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: createChapterPurposeSchema(),
  render: (input) => [
    new SystemMessage(createVolumeDetailSystemPrompt("purpose")),
    new HumanMessage(buildChapterDetailPrompt(input)),
  ],
};

export const volumeChapterBoundaryPrompt: PromptAsset<VolumeChapterDetailPromptInput, ReturnType<typeof createChapterBoundarySchema>["_output"]> = {
  id: "novel.volume.chapter_boundary",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: createChapterBoundarySchema(),
  render: (input) => [
    new SystemMessage(createVolumeDetailSystemPrompt("boundary")),
    new HumanMessage(buildChapterDetailPrompt(input)),
  ],
};

export const volumeChapterTaskSheetPrompt: PromptAsset<VolumeChapterDetailPromptInput, ReturnType<typeof createChapterTaskSheetSchema>["_output"]> = {
  id: "novel.volume.chapter_task_sheet",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: createChapterTaskSheetSchema(),
  render: (input) => [
    new SystemMessage(createVolumeDetailSystemPrompt("task_sheet")),
    new HumanMessage(buildChapterDetailPrompt(input)),
  ],
};
