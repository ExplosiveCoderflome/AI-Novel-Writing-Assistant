import type { BookAnalysisStatus } from "@ai-novel/shared/types/bookAnalysis";

export const EMPTY_BOOK_ANALYSIS_RESULT_ERROR = "拆书没有生成可展示的结果，请确认所选模型可用后重新生成。";

interface BookAnalysisSectionResultState {
  status: string;
  frozen: boolean;
  aiContent: string | null;
  editedContent: string | null;
  structuredDataJson: string | null;
}

function hasMeaningfulStructuredValue(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.some(hasMeaningfulStructuredValue);
  }
  if (value && typeof value === "object") {
    return Object.values(value).some(hasMeaningfulStructuredValue);
  }
  return false;
}

function hasMeaningfulStructuredData(value: string | null): boolean {
  if (!value) {
    return false;
  }
  try {
    return hasMeaningfulStructuredValue(JSON.parse(value));
  } catch {
    return false;
  }
}

export function isEmptySucceededBookAnalysisSection(
  section: BookAnalysisSectionResultState,
): boolean {
  if (section.frozen || section.status !== "succeeded") {
    return false;
  }
  const effectiveContent = section.editedContent ?? section.aiContent ?? "";
  return !effectiveContent.trim() && !hasMeaningfulStructuredData(section.structuredDataJson);
}

export function hasEmptySucceededBookAnalysisSection(
  sections: BookAnalysisSectionResultState[],
): boolean {
  return sections.some(isEmptySucceededBookAnalysisSection);
}

export function reconcileBookAnalysisResultStatus(
  status: BookAnalysisStatus,
  sections: BookAnalysisSectionResultState[],
): BookAnalysisStatus {
  return status === "succeeded" && hasEmptySucceededBookAnalysisSection(sections)
    ? "failed"
    : status;
}

export function resolveLiveBookAnalysisStatus(input: {
  status: BookAnalysisStatus;
  currentStage?: string | null;
  heartbeatAt?: Date | string | null;
}): BookAnalysisStatus {
  if (input.status !== "queued") {
    return input.status;
  }

  const hasCurrentStage = typeof input.currentStage === "string" && input.currentStage.trim().length > 0;
  const hasHeartbeat = Boolean(input.heartbeatAt);

  return hasCurrentStage || hasHeartbeat ? "running" : input.status;
}
