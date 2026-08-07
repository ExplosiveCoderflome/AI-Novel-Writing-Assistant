import type { BookAnalysisDetail, BookAnalysisSection, BookAnalysisStatus } from "@ai-novel/shared/types/bookAnalysis";
import type { SectionDraft } from "./bookAnalysis.types";

export function formatStatus(status: BookAnalysisStatus | BookAnalysisSection["status"]): string {
  switch (status) {
    case "draft":
      return "draft";
    case "queued":
      return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
    case "running":
      return "Running";
    case "succeeded":
      return "success";
    case "failed":
      return "fail";
    case "cancelled":
      return "Canceled";
    case "archived":
      return "Archived";
    case "idle":
      return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
    default:
      return status;
  }
}

export function formatStage(stage?: string | null): string {
  switch (stage) {
    case "loading_cache":
      return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
    case "preparing_notes":
      return "Prepare data for analysis";
    case "generating_overview":
      return "Generate overview";
    case "generating_sections":
      return "Generate split book sections";
    default:
      return stage?.trim() || "None yet";
  }
}

export const BOOK_ANALYSIS_BUDGET_EXCEEDED_CODE = "budget_exceeded";

export function isBookAnalysisBudgetExceeded(lastError?: string | null): boolean {
  return lastError?.includes(BOOK_ANALYSIS_BUDGET_EXCEEDED_CODE) ?? false;
}

export function formatDate(value?: string | null): string {
  if (!value) {
    return "None yet";
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
