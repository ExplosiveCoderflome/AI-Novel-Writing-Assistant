import type { BookAnalysisDetail, BookAnalysisSection, BookAnalysisStatus } from "@ai-novel/shared/types/bookAnalysis";
import type { SectionDraft } from "./bookAnalysis.types";

export function formatStatus(status: BookAnalysisStatus | BookAnalysisSection["status"]): string {
  switch (status) {
    case "draft":
      return "草稿";
    case "queued":
      return "排队中";
    case "running":
      return "运行中";
    case "succeeded":
      return "成功";
    case "failed":
      return "失败";
    case "cancelled":
      return "已取消";
    case "archived":
      return "已归档";
    case "idle":
      return "待处理";
    default:
      return status;
  }
}

export function formatStage(stage?: string | null): string {
  switch (stage) {
    case "loading_cache":
      return "查找可复用结果";
    case "preparing_notes":
      return "准备分析资料";
    case "generating_overview":
      return "生成总览";
    case "generating_sections":
      return "生成拆书小节";
    default:
      return stage?.trim() || "暂无";
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
