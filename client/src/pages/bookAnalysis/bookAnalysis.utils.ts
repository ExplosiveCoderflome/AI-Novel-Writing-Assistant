import i18next from "i18next";
import type { BookAnalysisDetail, BookAnalysisSection, BookAnalysisStatus } from "@ai-novel/shared/types/bookAnalysis";
import type { SectionDraft } from "./bookAnalysis.types";

export function formatStatus(status: BookAnalysisStatus | BookAnalysisSection["status"], t?: (key: string, defaultValue?: string) => string): string {
  const tr = t ?? ((k: string, v?: string) => i18next.t(k, { defaultValue: v }) as string);
  switch (status) {
    case "draft":
      return tr("bookAnalysis.status.draft", "草稿");
    case "queued":
      return tr("bookAnalysis.status.queued", "排队中");
    case "running":
      return tr("bookAnalysis.status.running", "运行中");
    case "succeeded":
      return tr("bookAnalysis.status.succeeded", "成功");
    case "failed":
      return tr("bookAnalysis.status.failed", "失败");
    case "cancelled":
      return tr("bookAnalysis.status.cancelled", "已取消");
    case "archived":
      return tr("bookAnalysis.status.archived", "已归档");
    case "idle":
      return tr("bookAnalysis.status.idle", "待处理");
    default:
      return status;
  }
}

export function formatStage(stage?: string | null, t?: (key: string, defaultValue?: string) => string): string {
  const tr = t ?? ((k: string, v?: string) => i18next.t(k, { defaultValue: v }) as string);
  switch (stage) {
    case "loading_cache":
      return tr("bookAnalysis.stage.loading_cache", "查找可复用结果");
    case "preparing_notes":
      return tr("bookAnalysis.stage.preparing_notes", "准备分析资料");
    case "generating_overview":
      return tr("bookAnalysis.stage.generating_overview", "生成总览");
    case "generating_sections":
      return tr("bookAnalysis.stage.generating_sections", "生成拆书小节");
    default:
      return stage?.trim() || tr("common.none", "暂无");
  }
}

export const BOOK_ANALYSIS_BUDGET_EXCEEDED_CODE = "budget_exceeded";

export function isBookAnalysisBudgetExceeded(lastError?: string | null): boolean {
  return lastError?.includes(BOOK_ANALYSIS_BUDGET_EXCEEDED_CODE) ?? false;
}

export function formatDate(value?: string | null): string {
  if (!value) {
    return "暂无";
  }
  return new Date(value).toLocaleString();
}

export function syncDrafts(detail: BookAnalysisDetail): Record<string, SectionDraft> {
  return Object.fromEntries(
    detail.sections.map((section) => [
      section.id,
      {
        editedContent: section.editedContent ?? section.aiContent ?? "",
        notes: section.notes ?? "",
        focusInstruction: section.focusInstruction ?? "",
        frozen: section.frozen,
        optimizeInstruction: "",
        optimizePreview: "",
      },
    ]),
  );
}

export function createDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function buildSectionDraft(section: BookAnalysisSection): SectionDraft {
  return {
    editedContent: section.editedContent ?? section.aiContent ?? "",
    notes: section.notes ?? "",
    focusInstruction: section.focusInstruction ?? "",
    frozen: section.frozen,
    optimizeInstruction: "",
    optimizePreview: "",
  };
}
