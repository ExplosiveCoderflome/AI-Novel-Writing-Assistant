import type { VolumePlan, VolumePlanDocument } from "@ai-novel/shared/types/novel";
import {
  CHAPTER_DETAIL_MODES,
  hasAnyChapterDetailDraft,
  hasChapterDetailDraft,
  type ChapterDetailBundleRequest,
  type ChapterDetailMode,
} from "../chapterDetailPlanning.shared";

export interface ChapterDetailTarget {
  chapterId: string;
  chapterOrder: number;
  title: string;
}

export interface ChapterDetailBatchFailure {
  targetVolumeId: string;
  targets: ChapterDetailTarget[];
  chapterId: string;
  chapterOrder: number;
  chapterTitle: string;
  mode: ChapterDetailMode;
  message: string;
}

interface ResolvedChapterDetailBatch {
  label: string;
  missingCount: number;
  targets: ChapterDetailTarget[];
  hasExistingDrafts: boolean;
}

interface ChapterDetailMutationPayload {
  targetVolumeId: string;
  targetChapterId: string;
  detailMode: ChapterDetailMode;
  draftVolumesOverride: VolumePlan[];
  suppressSuccessMessage: true;
}

interface ChapterDetailMutationResult {
  nextDocument: VolumePlanDocument;
}

interface RunChapterDetailBatchGenerationArgs {
  initialDraft: VolumePlan[];
  label: string;
  targetVolumeId: string;
  targets: ChapterDetailTarget[];
  setIsGenerating: (value: boolean) => void;
  setCurrentChapterId: (value: string) => void;
  setCurrentMode: (value: ChapterDetailMode | "") => void;
  setFailure: (failure: ChapterDetailBatchFailure | null) => void;
  setStructuredMessage: (value: string) => void;
  generateChapterDetail: (
    payload: ChapterDetailMutationPayload,
  ) => Promise<ChapterDetailMutationResult>;
}

function describeChapterTarget(target: ChapterDetailTarget): string {
  return `第${target.chapterOrder}章《${target.title || "未命名章节"}》`;
}

function buildFallbackLabel(targets: ChapterDetailTarget[]): string {
  if (targets.length === 1) {
    return describeChapterTarget(targets[0]);
  }
  const first = targets[0];
  const last = targets[targets.length - 1];
  if (!first || !last) {
    return "当前章节范围";
  }
  return `第${first.chapterOrder}-${last.chapterOrder}章（共 ${targets.length} 章）`;
}

function resolveMissingChapterDetailModes(
  draft: VolumePlan[],
  targetVolumeId: string,
  targetChapterId: string,
): ChapterDetailMode[] {
  const chapter = draft
    .find((volume) => volume.id === targetVolumeId)
    ?.chapters.find((item) => item.id === targetChapterId);
  if (!chapter) {
    return [];
  }
  return CHAPTER_DETAIL_MODES.filter((mode) => !hasChapterDetailDraft(chapter, mode));
}

export function resolveChapterDetailBatch(
  volume: VolumePlan | undefined,
  request: ChapterDetailBundleRequest,
): ResolvedChapterDetailBatch {
  const requestedIds = typeof request === "string"
    ? [request]
    : Array.from(new Set(request.chapterIds.map((id) => id.trim()).filter(Boolean)));
  const matchedChapters = requestedIds
    .map((chapterId) => volume?.chapters.find((chapter) => chapter.id === chapterId))
    .filter((chapter): chapter is VolumePlan["chapters"][number] => Boolean(chapter));

  return {
    label: typeof request === "string"
      ? buildFallbackLabel(matchedChapters.map((chapter) => ({
        chapterId: chapter.id,
        chapterOrder: chapter.chapterOrder,
        title: chapter.title,
      })))
      : request.label?.trim() || buildFallbackLabel(matchedChapters.map((chapter) => ({
        chapterId: chapter.id,
        chapterOrder: chapter.chapterOrder,
        title: chapter.title,
      }))),
    missingCount: Math.max(requestedIds.length - matchedChapters.length, 0),
    targets: matchedChapters.map((chapter) => ({
      chapterId: chapter.id,
      chapterOrder: chapter.chapterOrder,
      title: chapter.title,
    })),
    hasExistingDrafts: matchedChapters.some((chapter) => hasAnyChapterDetailDraft(chapter)),
  };
}

export function buildChapterDetailBatchConfirmationMessage(
  batch: ResolvedChapterDetailBatch,
): string {
  return [
    batch.targets.length === 1
      ? `将基于当前内容为${batch.label} AI 补齐章节目标、执行边界和任务单。`
      : `将基于当前内容为${batch.label}连续补齐章节目标、执行边界和任务单。`,
    batch.hasExistingDrafts
      ? "会优先沿用各章已填写结果，只修正空缺、模糊和不够可执行的部分。"
      : "当前这些章节还是空白，AI 会先补出首版，再按现有标题和摘要逐章收束。",
    "不会改动章节标题和摘要。",
    batch.missingCount > 0 ? `有 ${batch.missingCount} 章已不在当前卷草稿中，会自动跳过。` : "",
  ].filter(Boolean).join("\n\n");
}

export async function runChapterDetailBatchGeneration({
  initialDraft,
  label,
  targetVolumeId,
  targets,
  setIsGenerating,
  setCurrentChapterId,
  setCurrentMode,
  setFailure,
  setStructuredMessage,
  generateChapterDetail,
}: RunChapterDetailBatchGenerationArgs): Promise<void> {
  let workingDraft = initialDraft;
  let processedModeCount = 0;
  setIsGenerating(true);
  setFailure(null);
  setCurrentMode("");
  setCurrentChapterId(targets[0]?.chapterId ?? "");
  setStructuredMessage(`正在为${label}补齐缺失的章节目标、执行边界和任务单...`);

  try {
    for (const [targetIndex, target] of targets.entries()) {
      const missingModes = resolveMissingChapterDetailModes(workingDraft, targetVolumeId, target.chapterId);
      if (missingModes.length === 0) {
        continue;
      }
      setCurrentChapterId(target.chapterId);
      for (const mode of missingModes) {
        setCurrentMode(mode);
        try {
          const result = await generateChapterDetail({
            targetVolumeId,
            targetChapterId: target.chapterId,
            detailMode: mode,
            draftVolumesOverride: workingDraft,
            suppressSuccessMessage: true,
          });
          workingDraft = result.nextDocument.volumes;
          processedModeCount += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : "AI 暂时没有完成这一项细化。";
          setFailure({
            targetVolumeId,
            targets: targets.slice(targetIndex),
            chapterId: target.chapterId,
            chapterOrder: target.chapterOrder,
            chapterTitle: target.title,
            mode,
            message,
          });
          setStructuredMessage(`第${target.chapterOrder}章的${mode === "purpose" ? "章节目标" : mode === "boundary" ? "执行边界" : "任务单"}暂未完成，可从这里继续细化。`);
          return;
        }
      }
    }
    setStructuredMessage(
      processedModeCount > 0
        ? `${label}的章节目标、执行边界和任务单已补齐并自动保存。`
        : `${label}当前已经完整，无需重复生成章节细化。`,
    );
  } finally {
    setIsGenerating(false);
    setCurrentChapterId("");
    setCurrentMode("");
  }
}
