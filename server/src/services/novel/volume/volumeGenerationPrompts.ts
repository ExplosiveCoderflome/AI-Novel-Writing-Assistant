import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  VolumeChapterPlan,
  VolumePlan,
} from "@ai-novel/shared/types/novel";
import type { StoryMacroPlanService } from "../storyMacro/StoryMacroPlanService";

export type ChapterDetailMode = "purpose" | "boundary" | "task_sheet";

export interface VolumeWorkspace {
  volumes: VolumePlan[];
  activeVersionId: string | null;
}

export interface VolumeGenerationNovel {
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
  storyModePromptBlock?: string | null;
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

type StoryMacroPlanResult = Awaited<ReturnType<StoryMacroPlanService["getPlan"]>> | null;

export interface VolumeGenerateOptions {
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

export function buildBookSkeletonPrompt(params: {
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: StoryMacroPlanResult;
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

export function buildVolumeChapterListPrompt(params: {
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  targetVolume: VolumePlan;
  previousVolume?: VolumePlan;
  nextVolume?: VolumePlan;
  storyMacroPlan: StoryMacroPlanResult;
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

export function buildChapterDetailPrompt(params: {
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  targetVolume: VolumePlan;
  targetChapter: VolumeChapterPlan;
  storyMacroPlan: StoryMacroPlanResult;
  guidance?: string;
  detailMode: ChapterDetailMode;
}): string {
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
