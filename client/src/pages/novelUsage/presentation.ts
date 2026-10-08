import type { NovelUsageQuery, NovelUsageSummary } from "@ai-novel/shared/types/llmUsage";

export function formatUsageTokens(value: number | null | undefined): string {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString() : "未提供";
}

export function usageCoverageNotes(summary: Pick<NovelUsageSummary, "recordedCallCount" | "unknownUsageCallCount" | "cacheReportedCallCount" | "partialCallCount">): string[] {
  const notes: string[] = [];
  if (summary.unknownUsageCallCount) notes.push(`${summary.unknownUsageCallCount} 次调用未返回 Token，用量合计仅包含已报告部分。`);
  if (summary.recordedCallCount && summary.cacheReportedCallCount < summary.recordedCallCount) {
    notes.push(`缓存统计覆盖 ${summary.cacheReportedCallCount}/${summary.recordedCallCount} 次调用，命中与未命中仅汇总已报告部分。`);
  }
  if (summary.partialCallCount) notes.push(`${summary.partialCallCount} 次调用仅部分返回，统计可能不完整。`);
  return notes;
}

export function usageFiltersFromParams(params: URLSearchParams): NovelUsageQuery {
  const filters: NovelUsageQuery = {};
  for (const key of ["chapterId", "stage", "provider", "model"] as const) {
    const value = params.get(key)?.trim();
    if (value) filters[key] = value;
  }
  const status = params.get("status");
  if (status === "completed" || status === "partial" || status === "failed") filters.status = status;
  return filters;
}

const stages: Record<string, string> = {
  writer: "正文生成", chapter_writer: "正文生成", chapter_writing: "正文生成",
  chapter_acceptance: "章节验收", review: "审校", chapter_review: "章节审校",
  chapter_repair: "正文修文", repair: "正文修文", chapter_patch: "局部修文",
  chapter_artifact_sync: "章节资料整理", chapter_summary: "章节总结",
  chapter_artifact_delta: "章节资源回填", payoff_ledger_reconcile: "伏笔整体校准", payoff_ledger_planning: "伏笔规划",
  chapter_batch: "章节批次创作", production_run: "正文创作",
  story_macro: "故事规划", story_macro_plan: "故事规划", book_contract: "全书创作目标",
  world_setup: "世界设定", character_setup: "角色设定", volume_strategy: "分卷规划",
  volume_beat_sheet: "节奏段规划", volume_chapter_list: "章节目录规划",
  chapter_detail_bundle: "章节任务与场景", structured_outline: "章节规划",
  replan: "后续重规划", chapter_local_replan: "后续章节重规划",
};
export function usageStageLabel(stage: string | null): string { return stage ? stages[stage] ?? stage : "创作步骤未记录"; }
export function usageStatusLabel(status: string): string {
  return status === "completed" ? "调用完成" : status === "partial" ? "部分返回" : status === "failed" ? "调用失败" : "状态未记录";
}
export function usageTime(value: string | null): string {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : "未记录";
}
