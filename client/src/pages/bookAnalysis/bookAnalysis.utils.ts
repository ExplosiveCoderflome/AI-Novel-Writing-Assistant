import i18next from "i18next";
import type { BookAnalysisDetail, BookAnalysisSection, BookAnalysisStatus } from "@ai-novel/shared/types/bookAnalysis";
import type { SectionDraft } from "./bookAnalysis.types";

export function formatStatus(status: BookAnalysisStatus | BookAnalysisSection["status"]): string {
  switch (status) {
    case "draft":
      return i18next.t("gen.pages.bookAnalysis.bookAnalysis.utils.gen_22b4334f");
    case "queued":
      return i18next.t("gen.pages.bookAnalysis.bookAnalysis.utils.gen_e5ac1d20");
    case "running":
      return i18next.t("gen.pages.bookAnalysis.bookAnalysis.utils.gen_d679aea3");
    case "succeeded":
      return i18next.t("gen.pages.bookAnalysis.bookAnalysis.utils.gen_330363df");
    case "failed":
      return i18next.t("gen.pages.bookAnalysis.bookAnalysis.utils.gen_acd5cb84");
    case "archived":
      return i18next.t("gen.pages.bookAnalysis.bookAnalysis.utils.gen_c3ba167c");
    case "idle":
      return i18next.t("gen.pages.bookAnalysis.bookAnalysis.utils.gen_047109de");
    default:
      return status;
  }
}

export function formatStage(stage?: string | null): string {
  switch (stage) {
    case "loading_cache":
      return i18next.t("gen.pages.bookAnalysis.bookAnalysis.utils.gen_d5e64505");
    case "preparing_notes":
      return i18next.t("gen.pages.bookAnalysis.bookAnalysis.utils.gen_930dc9a1");
    case "generating_overview":
      return i18next.t("gen.pages.bookAnalysis.bookAnalysis.utils.gen_a28590de");
    case "generating_sections":
      return i18next.t("gen.pages.bookAnalysis.bookAnalysis.utils.gen_bd399ee5");
    default:
      return stage?.trim() || i18next.t("gen.pages.bookAnalysis.bookAnalysis.utils.gen_f61f4cf6");
  }
}

export function formatDate(value?: string | null): string {
  if (!value) {
    return i18next.t("gen.pages.bookAnalysis.bookAnalysis.utils.gen_f61f4cf6");
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
