import type {
  VolumeBeatSheet,
  VolumePlan,
  VolumeStrategyPlan,
} from "@ai-novel/shared/types/novel";
import type { StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";
import type {
  ChapterDetailMode,
  VolumeGenerationNovel,
  VolumeWorkspace,
} from "../../../../services/novel/volume/volumeModels";

export interface VolumeStrategyPromptInput {
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: StoryMacroPlan | null;
  guidance?: string;
  suggestedVolumeCount: number;
}

export interface VolumeStrategyCritiquePromptInput {
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: StoryMacroPlan | null;
  strategyPlan: VolumeStrategyPlan;
  guidance?: string;
}

export interface VolumeSkeletonPromptInput {
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: StoryMacroPlan | null;
  strategyPlan: VolumeStrategyPlan;
  guidance?: string;
  chapterBudget: number;
}

export interface VolumeBeatSheetPromptInput {
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: StoryMacroPlan | null;
  strategyPlan: VolumeStrategyPlan | null;
  targetVolume: VolumePlan;
  guidance?: string;
}

export interface VolumeChapterListPromptInput {
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: StoryMacroPlan | null;
  targetVolume: VolumePlan;
  targetBeatSheet: VolumeBeatSheet;
  previousVolume?: VolumePlan;
  nextVolume?: VolumePlan;
  guidance?: string;
  targetChapterCount: number;
}

export interface VolumeChapterDetailPromptInput {
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: StoryMacroPlan | null;
  targetVolume: VolumePlan;
  targetBeatSheet: VolumeBeatSheet | null;
  targetChapter: VolumePlan["chapters"][number];
  guidance?: string;
  detailMode: ChapterDetailMode;
}

export interface VolumeRebalancePromptInput {
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: StoryMacroPlan | null;
  anchorVolume: VolumePlan;
  previousVolume?: VolumePlan;
  nextVolume?: VolumePlan;
  guidance?: string;
}

function parseCommercialTags(commercialTagsJson: string | null | undefined): string[] {
  try {
    return commercialTagsJson ? JSON.parse(commercialTagsJson) as string[] : [];
  } catch {
    return [];
  }
}

function serializePromptJson(value: unknown, maxLength = 1800): string {
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

export function buildCompactVolumeCard(volume: VolumePlan): string {
  return [
    `第${volume.sortOrder}卷《${volume.title}》`,
    `卷摘要：${volume.summary ?? "无"}`,
    `开卷抓手：${volume.openingHook ?? "无"}`,
    `主承诺：${volume.mainPromise ?? "无"}`,
    `主压迫源：${volume.primaryPressureSource ?? "无"}`,
    `核心卖点：${volume.coreSellingPoint ?? "无"}`,
    `升级方式：${volume.escalationMode ?? "无"}`,
    `主角变化：${volume.protagonistChange ?? "无"}`,
    `中段风险：${volume.midVolumeRisk ?? "无"}`,
    `卷末高潮：${volume.climax ?? "无"}`,
    `兑现类型：${volume.payoffType ?? "无"}`,
    `下卷钩子：${volume.nextVolumeHook ?? "无"}`,
    volume.openPayoffs.length > 0 ? `未兑现事项：${volume.openPayoffs.join("、")}` : "未兑现事项：无",
    `章节数：${volume.chapters.length}`,
  ].join("\n");
}

export function buildCompactVolumeContext(volumes: VolumePlan[]): string {
  if (volumes.length === 0) {
    return "无";
  }
  return volumes
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((volume) => buildCompactVolumeCard(volume))
    .join("\n\n");
}

function buildStrategyVolumeCard(strategyPlan: VolumeStrategyPlan): string {
  return strategyPlan.volumes
    .map((volume) => [
      `第${volume.sortOrder}卷`,
      `规划模式：${volume.planningMode}`,
      `卷定位：${volume.roleLabel}`,
      `读者回报：${volume.coreReward}`,
      `升级焦点：${volume.escalationFocus}`,
      `不确定性：${volume.uncertaintyLevel}`,
    ].join("\n"))
    .join("\n\n");
}

export function buildStrategyContext(strategyPlan: VolumeStrategyPlan | null): string {
  if (!strategyPlan) {
    return "无";
  }
  return [
    `推荐卷数：${strategyPlan.recommendedVolumeCount}`,
    `硬规划卷数：${strategyPlan.hardPlannedVolumeCount}`,
    `读者回报梯度：${strategyPlan.readerRewardLadder}`,
    `升级梯度：${strategyPlan.escalationLadder}`,
    `中盘转向：${strategyPlan.midpointShift}`,
    `备注：${strategyPlan.notes}`,
    `分卷建议：\n${buildStrategyVolumeCard(strategyPlan)}`,
    strategyPlan.uncertainties.length > 0
      ? `不确定区域：\n${strategyPlan.uncertainties.map((item) => `${item.targetType}:${item.targetRef}|${item.level}|${item.reason}`).join("\n")}`
      : "不确定区域：无",
  ].join("\n\n");
}

export function buildBeatSheetContext(beatSheet: VolumeBeatSheet | null | undefined): string {
  if (!beatSheet || beatSheet.beats.length === 0) {
    return "无";
  }
  return beatSheet.beats
    .map((beat) => [
      `${beat.label}(${beat.key})`,
      `摘要：${beat.summary}`,
      `章节跨度提示：${beat.chapterSpanHint}`,
      `必须交付：${beat.mustDeliver.join("、")}`,
    ].join("\n"))
    .join("\n\n");
}

export function buildCommonNovelContext(novel: VolumeGenerationNovel): string {
  const commercialTags = parseCommercialTags(novel.commercialTagsJson);
  return [
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
  ].filter(Boolean).join("\n\n");
}

export function buildStoryMacroContext(storyMacroPlan: StoryMacroPlan | null): string {
  return [
    storyMacroPlan?.decomposition ? `故事拆解：${serializePromptJson(storyMacroPlan.decomposition)}` : "故事拆解：无",
    storyMacroPlan?.constraintEngine ? `约束引擎：${serializePromptJson(storyMacroPlan.constraintEngine)}` : "约束引擎：无",
  ].join("\n\n");
}

export function buildChapterNeighborContext(volume: VolumePlan, chapterId: string): string {
  const index = volume.chapters.findIndex((chapter) => chapter.id === chapterId);
  if (index < 0) {
    return "无";
  }
  const previous = index > 0 ? volume.chapters[index - 1] : null;
  const current = volume.chapters[index];
  const next = index < volume.chapters.length - 1 ? volume.chapters[index + 1] : null;
  return [
    previous ? `上一章：第${previous.chapterOrder}章《${previous.title}》：${previous.summary || "无摘要"}` : "",
    `当前章：第${current.chapterOrder}章《${current.title}》：${current.summary || "无摘要"}`,
    next ? `下一章：第${next.chapterOrder}章《${next.title}》：${next.summary || "无摘要"}` : "",
  ].filter(Boolean).join("\n");
}

export function buildChapterDetailDraft(
  chapter: VolumePlan["chapters"][number],
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
