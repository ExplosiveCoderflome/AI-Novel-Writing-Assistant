import type { BookAnalysisSectionKey } from "./bookAnalysis";

export interface ShortStoryReferenceSelection {
  analysisId: string;
  documentId: string;
  sectionKeys?: BookAnalysisSectionKey[];
  goal: string;
}
export interface ShortStoryReferenceContract {
  sourceTitle: string;
  goal: string;
  structureLessons: string[];
  pacingLessons: string[];
  styleLessons: string[];
  endingLessons: string[];
  endingEvidence: "available" | "not_available";
  originalityConstraints: string[];
}
export interface ShortStoryReferenceSnapshot extends ShortStoryReferenceContract {
  schemaVersion: 1;
  mode: "adaptation";
  analysisId: string;
  documentId: string;
  documentVersionId: string;
  documentVersionNumber: number;
  analysisRevision: string;
  selection: ShortStoryReferenceSelection;
  originalIdea: string;
  selectedConclusions: Array<{ sectionKey: string; title: string; content: string; evidence: string | null }>;
}
export interface ShortStoryReferenceView extends ShortStoryReferenceContract {
  analysisId: string;
  documentId: string;
  documentVersionNumber: number;
  analysisRevision: string;
  sourceState: "available" | "updated" | "unavailable";
}
