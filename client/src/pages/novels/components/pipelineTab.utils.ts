import type { Chapter, PipelineJob } from "@ai-novel/shared/types/novel";

export interface PipelineStageItem {
  key: string;
  label: string;
}

export const PIPELINE_STAGE_ITEMS: PipelineStageItem[] = [
  { key: "assemble_context", label: "装配上下文" },
  { key: "generate_task_sheet", label: "生成任务单" },
  { key: "generate_scene_cards", label: "生成场景拍点" },
  { key: "generate_content", label: "生成正文" },
  { key: "quality_check", label: "质量检测" },
  { key: "auto_repair", label: "自动修复" },
  { key: "update_memory", label: "更新剧情记忆" },
];

function mapCurrentStage(currentStage: string | null | undefined): string | null {
  if (!currentStage) {
    return null;
  }
  const mapping: Record<string, string> = {
    queued: "assemble_context",
    generating_chapters: "generate_content",
    reviewing: "quality_check",
    repairing: "auto_repair",
    finalizing: "update_memory",
  };
  return mapping[currentStage] ?? currentStage;
}

export function getPipelineStageState(
  stageKey: string,
  job: PipelineJob | undefined,
  order: PipelineStageItem[],
): "pending" | "active" | "completed" | "failed" {
  if (!job) {
    return "pending";
  }
  const normalizedCurrent = mapCurrentStage(job.currentStage);
  if (job.status === "succeeded") {
    return "completed";
  }
  if ((job.status === "failed" || job.status === "cancelled") && normalizedCurrent === stageKey) {
    return "failed";
  }
  const currentIndex = normalizedCurrent ? order.findIndex((item) => item.key === normalizedCurrent) : -1;
  const stageIndex = order.findIndex((item) => item.key === stageKey);
  if (normalizedCurrent === stageKey) {
    return "active";
  }
  if (currentIndex > stageIndex && stageIndex >= 0) {
    return "completed";
  }
  return "pending";
}

export function getLowScoreChapterRange(
  chapters: Chapter[],
  chapterReports: Array<{ chapterId?: string | null; overall: number }>,
  threshold: number,
): { startOrder: number; endOrder: number; count: number } | null {
  const lowScoreIds = chapterReports
    .filter((item) => item.chapterId && item.overall < threshold)
    .map((item) => item.chapterId as string);
  if (lowScoreIds.length === 0) {
    return null;
  }
  const matched = chapters
    .filter((chapter) => lowScoreIds.includes(chapter.id))
    .sort((a, b) => a.order - b.order);
  if (matched.length === 0) {
    return null;
  }
  return {
    startOrder: matched[0].order,
    endOrder: matched[matched.length - 1].order,
    count: matched.length,
  };
}
