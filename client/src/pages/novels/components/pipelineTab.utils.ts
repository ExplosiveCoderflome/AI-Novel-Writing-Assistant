import i18next from "i18next";
import type { Chapter, PipelineJob } from "@ai-novel/shared/types/novel";

export interface PipelineStageItem {
  key: string;
  label: string;
}

export const PIPELINE_STAGE_ITEMS: PipelineStageItem[] = [
  { key: "assemble_context", label: i18next.t("gen.pages.novels.components.pipelineTab.utils.gen_82bec748") },
  { key: "generate_task_sheet", label: i18next.t("gen.pages.novels.components.pipelineTab.utils.gen_1a742abd") },
  { key: "generate_scene_cards", label: i18next.t("gen.pages.novels.components.pipelineTab.utils.gen_041f3497") },
  { key: "generate_content", label: i18next.t("gen.pages.novels.components.pipelineTab.utils.gen_df396e50") },
  { key: "quality_check", label: i18next.t("gen.pages.novels.components.pipelineTab.utils.gen_46da0840") },
  { key: "auto_repair", label: i18next.t("gen.pages.novels.components.pipelineTab.utils.gen_fcc3d39a") },
  { key: "update_memory", label: i18next.t("gen.pages.novels.components.pipelineTab.utils.gen_60b095f1") },
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
