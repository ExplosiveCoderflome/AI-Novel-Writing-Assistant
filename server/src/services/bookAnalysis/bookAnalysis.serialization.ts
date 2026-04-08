import type { BookAnalysis, BookAnalysisSection, BookAnalysisSectionKey, BookAnalysisStatus } from "@ai-novel/shared/types/bookAnalysis";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { resolveLiveBookAnalysisStatus } from "./bookAnalysis.status";
import { decodeEvidence, decodeStructuredData } from "./bookAnalysis.utils";

export interface AnalysisRowForSerialize {
  id: string;
  documentId: string;
  documentVersionId: string;
  title: string;
  status: BookAnalysisStatus;
  summary: string | null;
  provider: string | null;
  model: string | null;
  temperature: number | null;
  maxTokens: number | null;
  progress: number;
  heartbeatAt: Date | null;
  currentStage: string | null;
  currentItemKey: string | null;
  currentItemLabel: string | null;
  cancelRequestedAt: Date | null;
  attemptCount: number;
  maxAttempts: number;
  lastError: string | null;
  lastRunAt: Date | null;
  publishedDocumentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  document: {
    id: string;
    title: string;
    fileName: string;
    activeVersionId: string | null;
    activeVersionNumber: number;
  };
  documentVersion: {
    id: string;
    versionNumber: number;
  };
}

export interface SectionRowForSerialize {
  id: string;
  analysisId: string;
  sectionKey: string;
  title: string;
  status: "idle" | "running" | "succeeded" | "failed";
  aiContent: string | null;
  editedContent: string | null;
  notes: string | null;
  structuredDataJson: string | null;
  evidenceJson: string | null;
  frozen: boolean;
  sortOrder: number;
  updatedAt: Date;
}

export function serializeAnalysisRow(row: AnalysisRowForSerialize): BookAnalysis {
  return {
    id: row.id,
    documentId: row.documentId,
    documentVersionId: row.documentVersionId,
    documentTitle: row.document.title,
    documentFileName: row.document.fileName,
    documentVersionNumber: row.documentVersion.versionNumber,
    currentDocumentVersionId: row.document.activeVersionId,
    currentDocumentVersionNumber: row.document.activeVersionNumber,
    isCurrentVersion: row.document.activeVersionId === row.documentVersionId,
    title: row.title,
    status: resolveLiveBookAnalysisStatus({
      status: row.status,
      currentStage: row.currentStage,
      heartbeatAt: row.heartbeatAt,
    }),
    summary: row.summary,
    provider: (row.provider as LLMProvider | null) ?? null,
    model: row.model,
    temperature: row.temperature,
    maxTokens: row.maxTokens,
    progress: row.progress,
    heartbeatAt: row.heartbeatAt?.toISOString() ?? null,
    currentStage: row.currentStage,
    currentItemKey: row.currentItemKey,
    currentItemLabel: row.currentItemLabel,
    cancelRequestedAt: row.cancelRequestedAt?.toISOString() ?? null,
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
    lastError: row.lastError,
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    publishedDocumentId: row.publishedDocumentId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeSectionRow(row: SectionRowForSerialize): BookAnalysisSection {
  return {
    id: row.id,
    analysisId: row.analysisId,
    sectionKey: row.sectionKey as BookAnalysisSectionKey,
    title: row.title,
    status: row.status,
    aiContent: row.aiContent,
    editedContent: row.editedContent,
    notes: row.notes,
    structuredData: decodeStructuredData(row.structuredDataJson),
    evidence: decodeEvidence(row.evidenceJson),
    frozen: row.frozen,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt.toISOString(),
  };
}
