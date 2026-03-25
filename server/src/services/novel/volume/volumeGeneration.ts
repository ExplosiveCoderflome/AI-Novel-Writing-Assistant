import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  VolumeChapterPlan,
  VolumePlan,
  VolumePlanDocument,
} from "@ai-novel/shared/types/novel";
import { prisma } from "../../../db/prisma";
import { invokeStructuredLlm } from "../../../llm/structuredInvoke";
import type { StoryMacroPlanService } from "../storyMacro/StoryMacroPlanService";
import {
  buildDerivedOutlineFromVolumes,
  buildDerivedStructuredOutlineFromVolumes,
  normalizeVolumeDraftInput,
} from "./volumePlanUtils";
import {
  createBookVolumeSkeletonSchema,
  createChapterBoundarySchema,
  createChapterPurposeSchema,
  createChapterTaskSheetSchema,
  createVolumeChapterListSchema,
} from "./volumeGenerationSchemas";

type ChapterDetailMode = "purpose" | "boundary" | "task_sheet";

interface VolumeGenerateOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  guidance?: string;
  scope?: "book" | "volume" | "chapter_detail";
  targetVolumeId?: string;
  targetChapterId?: string;
  detailMode?: ChapterDetailMode;
  estimatedChapterCount?: number;
  respectExistingVolumeCount?: boolean;
}

interface VolumeWorkspace {
  volumes: VolumePlan[];
  activeVersionId: string | null;
}

interface VolumeGenerationNovel {
  title: string;
  description: string | null;
  targetAudience: string | null;
  bookSellingPoint: string | null;
  competingFeel: string | null;
  first30ChapterPromise: string | null;
  commercialTagsJson: string | null;
  estimatedChapterCount: number | null;
  narrativePov: string | null;
  pacePreference: string | null;
  emotionIntensity: string | null;
  genre: {
    name: string;
  } | null;
  characters: Array<{
    name: string;
    role: string;
    currentGoal: string | null;
    currentState: string | null;
  }>;
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

function deriveChapterBudget(params: {
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  options: VolumeGenerateOptions;
}): number {
  const { novel, workspace, options } = params;
  return Math.max(
    options.estimatedChapterCount ?? 0,
    novel.estimatedChapterCount ?? 0,
    workspace.volumes.flatMap((volume) => volume.chapters).length,
    12,
  );
}

function suggestVolumeCount(chapterBudget: number): number {
  if (chapterBudget <= 24) return 1;
  if (chapterBudget <= 60) return 3;
  return 4;
}

function deriveVolumeCount(params: {
  workspace: VolumeWorkspace;
  chapterBudget: number;
  options: VolumeGenerateOptions;
}): number {
  const { workspace, chapterBudget, options } = params;
  if (workspace.volumes.length > 0 && options.respectExistingVolumeCount !== false) {
    return workspace.volumes.length;
  }
  return suggestVolumeCount(chapterBudget);
}

function allocateChapterBudgets(params: {
  volumeCount: number;
  chapterBudget: number;
  existingVolumes: VolumePlan[];
}): number[] {
  const { volumeCount, chapterBudget, existingVolumes } = params;
  const safeVolumeCount = Math.max(volumeCount, 1);
  const minimumPerVolume = 3;
  const totalBudget = Math.max(chapterBudget, safeVolumeCount * minimumPerVolume);
  const existingCounts = Array.from({ length: safeVolumeCount }, (_, index) => Math.max(existingVolumes[index]?.chapters.length ?? 0, 0));
  const hasUsefulWeights = existingCounts.some((count) => count >= minimumPerVolume);
  const weights = hasUsefulWeights
    ? existingCounts.map((count) => Math.max(count, 1))
    : Array.from({ length: safeVolumeCount }, () => 1);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const budgets = weights.map((weight) => Math.max(minimumPerVolume, Math.round((totalBudget * weight) / totalWeight)));
  let delta = totalBudget - budgets.reduce((sum, budget) => sum + budget, 0);

  while (delta !== 0) {
    const direction = delta > 0 ? 1 : -1;
    for (let index = 0; index < budgets.length && delta !== 0; index += 1) {
      if (direction < 0 && budgets[index] <= minimumPerVolume) {
        continue;
      }
      budgets[index] += direction;
      delta -= direction;
    }
  }

  return budgets;
}

function buildBookSkeletonPrompt(params: {
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: Awaited<ReturnType<StoryMacroPlanService["getPlan"]>> | null;
  guidance?: string;
  chapterBudget: number;
  targetVolumeCount: number;
  chapterBudgets: number[];
}): string {
  const { novel, workspace, storyMacroPlan, guidance, chapterBudget, targetVolumeCount, chapterBudgets } = params;
  const commercialTags = parseCommercialTags(novel.commercialTagsJson);
  return [
    "工作模式：全书卷骨架生成",
    "这一步只做卷级骨架，不要拆章节列表。",
    `小说标题：${novel.title}`,
    `题材：${novel.genre?.name ?? "未设置"}`,
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

function buildVolumeChapterListPrompt(params: {
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  targetVolume: VolumePlan;
  previousVolume?: VolumePlan;
  nextVolume?: VolumePlan;
  storyMacroPlan: Awaited<ReturnType<StoryMacroPlanService["getPlan"]>> | null;
  guidance?: string;
  chapterBudget: number;
  targetChapterCount: number;
}): string {
  const { novel, workspace, targetVolume, previousVolume, nextVolume, storyMacroPlan, guidance, chapterBudget, targetChapterCount } = params;
  const commercialTags = parseCommercialTags(novel.commercialTagsJson);
  return [
    "工作模式：单卷章节列表生成",
    "这一步只生成章节标题和章节摘要，不要输出章节目标、执行边界、任务单。",
    `小说标题：${novel.title}`,
    `题材：${novel.genre?.name ?? "未设置"}`,
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

function buildChapterDetailPrompt(params: {
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  targetVolume: VolumePlan;
  targetChapter: VolumeChapterPlan;
  storyMacroPlan: Awaited<ReturnType<StoryMacroPlanService["getPlan"]>> | null;
  guidance?: string;
  detailMode: ChapterDetailMode;
}): string {
  const { novel, workspace, targetVolume, targetChapter, storyMacroPlan, guidance, detailMode } = params;
  const commercialTags = parseCommercialTags(novel.commercialTagsJson);
  const detailInstruction = detailMode === "purpose"
    ? "请只生成这一章的章节目标，说明这章必须推进什么关系、冲突或信息兑现。"
    : detailMode === "boundary"
      ? "请只生成这一章的执行边界：冲突等级、揭露等级、目标字数、禁止事项、兑现关联。"
      : "请只生成这一章的任务单，给写作执行阶段可直接照做的指令。";

  return [
    `工作模式：章节细化生成（${detailMode}）`,
    detailInstruction,
    `小说标题：${novel.title}`,
    `题材：${novel.genre?.name ?? "未设置"}`,
    `简介：${novel.description ?? "无"}`,
    `目标读者：${novel.targetAudience ?? "无"}`,
    `卖点：${novel.bookSellingPoint ?? "无"}`,
    `竞品体感：${novel.competingFeel ?? "无"}`,
    `前30章承诺：${novel.first30ChapterPromise ?? "无"}`,
    `商业标签：${commercialTags.join("、") || "无"}`,
    `角色上下文：${buildCharacterContext(novel)}`,
    `当前卷设定：${buildCompactVolumeCard(targetVolume)}`,
    `章节邻接上下文：${buildNeighborChapterContext(targetVolume, targetChapter.id)}`,
    `全书卷骨架摘要：${buildCompactVolumeContext(workspace.volumes)}`,
    storyMacroPlan?.decomposition ? `故事拆解：${serializePromptJson(storyMacroPlan.decomposition, 1800)}` : "故事拆解：无",
    storyMacroPlan?.constraintEngine ? `约束引擎：${serializePromptJson(storyMacroPlan.constraintEngine, 1800)}` : "约束引擎：无",
    guidance?.trim() ? `额外指令：${guidance.trim()}` : "",
  ].filter(Boolean).join("\n\n");
}

function mergeBookSkeletonIntoWorkspace(params: {
  novelId: string;
  workspace: VolumeWorkspace;
  generatedVolumes: Array<{
    title: string;
    summary?: string | null;
    mainPromise: string;
    escalationMode: string;
    protagonistChange: string;
    climax: string;
    nextVolumeHook: string;
    resetPoint?: string | null;
    openPayoffs: string[];
  }>;
}): VolumePlan[] {
  const { novelId, workspace, generatedVolumes } = params;
  const merged = generatedVolumes.map((volume, index) => {
    const existing = workspace.volumes[index];
    return {
      id: existing?.id,
      novelId,
      sortOrder: index + 1,
      title: volume.title,
      summary: volume.summary ?? null,
      mainPromise: volume.mainPromise,
      escalationMode: volume.escalationMode,
      protagonistChange: volume.protagonistChange,
      climax: volume.climax,
      nextVolumeHook: volume.nextVolumeHook,
      resetPoint: volume.resetPoint ?? null,
      openPayoffs: volume.openPayoffs,
      status: existing?.status ?? "active",
      sourceVersionId: existing?.sourceVersionId ?? null,
      chapters: existing?.chapters ?? [],
    };
  });
  return normalizeVolumeDraftInput(novelId, merged);
}

function mergeVolumeChapterListIntoWorkspace(params: {
  novelId: string;
  workspace: VolumeWorkspace;
  targetVolumeId: string;
  generatedChapters: Array<{
    title: string;
    summary: string;
  }>;
}): VolumePlan[] {
  const { novelId, workspace, targetVolumeId, generatedChapters } = params;
  const targetIndex = workspace.volumes.findIndex((volume) => volume.id === targetVolumeId);
  if (targetIndex < 0) {
    throw new Error("目标卷不存在，无法生成章节列表。");
  }
  const merged = workspace.volumes.map((volume, index) => {
    if (index !== targetIndex) {
      return volume;
    }
    return {
      ...volume,
      chapters: generatedChapters.map((chapter, chapterIndex) => {
        const existingChapter = volume.chapters[chapterIndex];
        return {
          id: existingChapter?.id,
          volumeId: volume.id,
          chapterOrder: existingChapter?.chapterOrder ?? chapterIndex + 1,
          title: chapter.title,
          summary: chapter.summary,
          purpose: existingChapter?.purpose ?? null,
          conflictLevel: existingChapter?.conflictLevel ?? null,
          revealLevel: existingChapter?.revealLevel ?? null,
          targetWordCount: existingChapter?.targetWordCount ?? null,
          mustAvoid: existingChapter?.mustAvoid ?? null,
          taskSheet: existingChapter?.taskSheet ?? null,
          payoffRefs: existingChapter?.payoffRefs ?? [],
        };
      }),
    };
  });
  return normalizeVolumeDraftInput(novelId, merged);
}

function mergeChapterDetailIntoWorkspace(params: {
  novelId: string;
  workspace: VolumeWorkspace;
  targetVolumeId: string;
  targetChapterId: string;
  detailMode: ChapterDetailMode;
  generatedDetail: Record<string, unknown>;
}): VolumePlan[] {
  const { novelId, workspace, targetVolumeId, targetChapterId, detailMode, generatedDetail } = params;
  const merged = workspace.volumes.map((volume) => {
    if (volume.id !== targetVolumeId) {
      return volume;
    }
    return {
      ...volume,
      chapters: volume.chapters.map((chapter) => {
        if (chapter.id !== targetChapterId) {
          return chapter;
        }
        if (detailMode === "purpose") {
          return {
            ...chapter,
            purpose: typeof generatedDetail.purpose === "string" ? generatedDetail.purpose : chapter.purpose,
          };
        }
        if (detailMode === "boundary") {
          return {
            ...chapter,
            conflictLevel: typeof generatedDetail.conflictLevel === "number" ? generatedDetail.conflictLevel : chapter.conflictLevel,
            revealLevel: typeof generatedDetail.revealLevel === "number" ? generatedDetail.revealLevel : chapter.revealLevel,
            targetWordCount: typeof generatedDetail.targetWordCount === "number" ? generatedDetail.targetWordCount : chapter.targetWordCount,
            mustAvoid: typeof generatedDetail.mustAvoid === "string" ? generatedDetail.mustAvoid : chapter.mustAvoid,
            payoffRefs: Array.isArray(generatedDetail.payoffRefs)
              ? generatedDetail.payoffRefs.filter((item): item is string => typeof item === "string")
              : chapter.payoffRefs,
          };
        }
        return {
          ...chapter,
          taskSheet: typeof generatedDetail.taskSheet === "string" ? generatedDetail.taskSheet : chapter.taskSheet,
        };
      }),
    };
  });
  return normalizeVolumeDraftInput(novelId, merged);
}

async function generateBookSkeleton(params: {
  novelId: string;
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: Awaited<ReturnType<StoryMacroPlanService["getPlan"]>> | null;
  options: VolumeGenerateOptions;
}): Promise<VolumePlan[]> {
  const { novelId, novel, workspace, storyMacroPlan, options } = params;
  const chapterBudget = deriveChapterBudget({ novel, workspace, options });
  const targetVolumeCount = deriveVolumeCount({ workspace, chapterBudget, options });
  const chapterBudgets = allocateChapterBudgets({
    volumeCount: targetVolumeCount,
    chapterBudget,
    existingVolumes: workspace.volumes,
  });
  const generated = await invokeStructuredLlm({
    label: `volume-skeleton:${novelId}`,
    provider: options.provider,
    model: options.model,
    temperature: options.temperature ?? 0.35,
    taskType: "planner",
    systemPrompt: [
      "你是擅长长篇网文结构设计的总策划。",
      `必须严格输出 ${targetVolumeCount} 卷，不能增减卷数。`,
      "请输出严格 JSON，包含 volumes 数组。",
      "每卷必须给出：title、mainPromise、escalationMode、protagonistChange、climax、nextVolumeHook。",
      "禁止输出章节列表，这一步只做卷级骨架。",
    ].join("\n"),
    userPrompt: buildBookSkeletonPrompt({
      novel,
      workspace,
      storyMacroPlan,
      guidance: options.guidance,
      chapterBudget,
      targetVolumeCount,
      chapterBudgets,
    }),
    schema: createBookVolumeSkeletonSchema(targetVolumeCount),
    maxRepairAttempts: 1,
  });
  return mergeBookSkeletonIntoWorkspace({
    novelId,
    workspace,
    generatedVolumes: generated.volumes,
  });
}

async function generateVolumeChapterList(params: {
  novelId: string;
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: Awaited<ReturnType<StoryMacroPlanService["getPlan"]>> | null;
  options: VolumeGenerateOptions;
}): Promise<VolumePlan[]> {
  const { novelId, novel, workspace, storyMacroPlan, options } = params;
  const targetVolumeId = options.targetVolumeId?.trim();
  if (!targetVolumeId) {
    throw new Error("按卷生成章节列表时必须指定目标卷。");
  }
  const targetIndex = workspace.volumes.findIndex((volume) => volume.id === targetVolumeId);
  if (targetIndex < 0) {
    throw new Error("目标卷不存在，无法生成章节列表。");
  }
  const chapterBudget = deriveChapterBudget({ novel, workspace, options });
  const chapterBudgets = allocateChapterBudgets({
    volumeCount: Math.max(workspace.volumes.length, 1),
    chapterBudget,
    existingVolumes: workspace.volumes,
  });
  const targetVolume = workspace.volumes[targetIndex];
  const targetChapterCount = targetVolume.chapters.length >= 3
    ? targetVolume.chapters.length
    : chapterBudgets[targetIndex] ?? Math.max(3, Math.round(chapterBudget / Math.max(workspace.volumes.length, 1)));

  const generated = await invokeStructuredLlm({
    label: `volume-chapters:${novelId}:${targetVolume.sortOrder}`,
    provider: options.provider,
    model: options.model,
    temperature: options.temperature ?? 0.35,
    taskType: "planner",
    systemPrompt: [
      "你是擅长长篇网文章节拆分的章纲策划。",
      `只允许为第${targetVolume.sortOrder}卷生成 ${targetChapterCount} 个章节。`,
      "请输出严格 JSON，包含 chapters 数组。",
      "每章只允许输出 title 和 summary。",
      "禁止输出章节目标、执行边界、任务单。",
    ].join("\n"),
    userPrompt: buildVolumeChapterListPrompt({
      novel,
      workspace,
      targetVolume,
      previousVolume: targetIndex > 0 ? workspace.volumes[targetIndex - 1] : undefined,
      nextVolume: targetIndex < workspace.volumes.length - 1 ? workspace.volumes[targetIndex + 1] : undefined,
      storyMacroPlan,
      guidance: options.guidance,
      chapterBudget,
      targetChapterCount,
    }),
    schema: createVolumeChapterListSchema(targetChapterCount),
    maxRepairAttempts: 1,
  });

  return mergeVolumeChapterListIntoWorkspace({
    novelId,
    workspace,
    targetVolumeId,
    generatedChapters: generated.chapters,
  });
}

async function generateChapterDetail(params: {
  novelId: string;
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: Awaited<ReturnType<StoryMacroPlanService["getPlan"]>> | null;
  options: VolumeGenerateOptions;
}): Promise<VolumePlan[]> {
  const { novelId, novel, workspace, storyMacroPlan, options } = params;
  const targetVolumeId = options.targetVolumeId?.trim();
  const targetChapterId = options.targetChapterId?.trim();
  const detailMode = options.detailMode;

  if (!targetVolumeId || !targetChapterId || !detailMode) {
    throw new Error("生成章节细化时缺少必要参数。");
  }

  const targetVolume = workspace.volumes.find((volume) => volume.id === targetVolumeId);
  if (!targetVolume) {
    throw new Error("目标卷不存在，无法生成章节细化。");
  }
  const targetChapter = targetVolume.chapters.find((chapter) => chapter.id === targetChapterId);
  if (!targetChapter) {
    throw new Error("目标章节不存在，无法生成章节细化。");
  }

  const systemPrompt = detailMode === "purpose"
    ? [
      "你是资深网文编辑。",
      "请输出严格 JSON，只填写这一章必须推进的目标。",
      "目标要聚焦剧情推进、人物关系或信息兑现，不要写成复述摘要。",
    ].join("\n")
    : detailMode === "boundary"
      ? [
        "你是资深网文编辑。",
        "请输出严格 JSON，只填写这一章的执行边界。",
        "冲突等级和揭露等级用 0-100 的整数；目标字数给出适合本章节奏的建议；禁止事项要具体；兑现关联给出本章该碰到的伏笔或承诺。",
      ].join("\n")
      : [
        "你是资深网文编辑。",
      "请输出严格 JSON，只填写这一章的任务单。",
      "任务单要能直接交给写作阶段执行，包含情绪、冲突、推进点和收尾要求。",
    ].join("\n");

  const prompt = buildChapterDetailPrompt({
    novel,
    workspace,
    targetVolume,
    targetChapter,
    storyMacroPlan,
    guidance: options.guidance,
    detailMode,
  });
  const generated = detailMode === "purpose"
    ? await invokeStructuredLlm({
      label: `chapter-detail:${novelId}:${targetChapter.chapterOrder}:${detailMode}`,
      provider: options.provider,
      model: options.model,
      temperature: options.temperature ?? 0.35,
      taskType: "planner",
      systemPrompt,
      userPrompt: prompt,
      schema: createChapterPurposeSchema(),
      maxRepairAttempts: 1,
    })
    : detailMode === "boundary"
      ? await invokeStructuredLlm({
        label: `chapter-detail:${novelId}:${targetChapter.chapterOrder}:${detailMode}`,
        provider: options.provider,
        model: options.model,
        temperature: options.temperature ?? 0.35,
        taskType: "planner",
        systemPrompt,
        userPrompt: prompt,
        schema: createChapterBoundarySchema(),
        maxRepairAttempts: 1,
      })
      : await invokeStructuredLlm({
        label: `chapter-detail:${novelId}:${targetChapter.chapterOrder}:${detailMode}`,
        provider: options.provider,
        model: options.model,
        temperature: options.temperature ?? 0.35,
        taskType: "planner",
        systemPrompt,
        userPrompt: prompt,
        schema: createChapterTaskSheetSchema(),
        maxRepairAttempts: 1,
      });

  return mergeChapterDetailIntoWorkspace({
    novelId,
    workspace,
    targetVolumeId,
    targetChapterId,
    detailMode,
    generatedDetail: generated as Record<string, unknown>,
  });
}

export async function generateVolumePlanDocument(params: {
  novelId: string;
  workspace: VolumeWorkspace;
  options?: VolumeGenerateOptions;
  storyMacroPlanService: Pick<StoryMacroPlanService, "getPlan">;
}): Promise<VolumePlanDocument> {
  const { novelId, workspace, options = {}, storyMacroPlanService } = params;
  const [novel, storyMacroPlan]: [
    VolumeGenerationNovel | null,
    Awaited<ReturnType<StoryMacroPlanService["getPlan"]>> | null,
  ] = await Promise.all([
    prisma.novel.findUnique({
      where: { id: novelId },
      select: {
        title: true,
        description: true,
        targetAudience: true,
        bookSellingPoint: true,
        competingFeel: true,
        first30ChapterPromise: true,
        commercialTagsJson: true,
        estimatedChapterCount: true,
        narrativePov: true,
        pacePreference: true,
        emotionIntensity: true,
        genre: {
          select: { name: true },
        },
        characters: {
          orderBy: { createdAt: "asc" },
          select: {
            name: true,
            role: true,
            currentGoal: true,
            currentState: true,
          },
        },
      },
    }),
    storyMacroPlanService.getPlan(novelId).catch(() => null),
  ]);

  if (!novel) {
    throw new Error("小说不存在。");
  }

  const volumes = options.scope === "volume"
    ? await generateVolumeChapterList({
      novelId,
      novel,
      workspace,
      storyMacroPlan,
      options,
    })
    : options.scope === "chapter_detail"
      ? await generateChapterDetail({
        novelId,
        novel,
        workspace,
        storyMacroPlan,
        options,
      })
      : await generateBookSkeleton({
        novelId,
        novel,
        workspace,
        storyMacroPlan,
        options,
      });

  return {
    novelId,
    volumes,
    derivedOutline: buildDerivedOutlineFromVolumes(volumes),
    derivedStructuredOutline: buildDerivedStructuredOutlineFromVolumes(volumes),
    source: "volume",
    activeVersionId: workspace.activeVersionId,
  };
}
