import type {
  AuditReport,
  Chapter,
  ChapterEditorOperation,
  ChapterEditorRewritePreviewRequest,
  ChapterEditorRewritePreviewResponse,
  StoryPlan,
  StoryStateSnapshot,
} from "@ai-novel/shared/types/novel";

export interface ChapterEditorSelectionRange {
  from: number;
  to: number;
  text: string;
}

export interface SelectionToolbarPosition {
  top: number;
  left: number;
}

export interface ChapterEditorSessionState extends ChapterEditorRewritePreviewResponse {
  status: "idle" | "loading" | "ready" | "error";
  operationLabel?: string;
  customInstruction?: string;
  viewMode: "inline" | "block";
  errorMessage?: string;
}

export interface ChapterEditorShellProps {
  novelId: string;
  chapter: Chapter | undefined;
  chapterPlan?: StoryPlan | null;
  latestStateSnapshot?: StoryStateSnapshot | null;
  chapterAuditReports: AuditReport[];
  worldInjectionSummary?: string | null;
  styleSummary?: string | null;
  chapterSummary?: string | null;
  onBack?: () => void;
  onOpenVersionHistory?: () => void;
  onRunFullAudit?: () => void;
  onGenerateChapterPlan?: () => void;
  onReplanChapter?: () => void;
  isRunningFullAudit?: boolean;
  isGeneratingChapterPlan?: boolean;
  isReplanningChapter?: boolean;
}

export interface ChapterEditorRequestBuilderInput {
  operation: ChapterEditorOperation;
  customInstruction?: string;
  selection: ChapterEditorSelectionRange;
  content: string;
  goalSummary?: string | null;
  chapterSummary?: string | null;
  styleSummary?: string | null;
  characterStateSummary?: string | null;
  worldConstraintSummary?: string | null;
  provider?: import("@ai-novel/shared/types/llm").LLMProvider;
  model?: string;
  temperature?: number;
}

export type BuildRewritePreviewRequest = (
  input: ChapterEditorRequestBuilderInput,
) => ChapterEditorRewritePreviewRequest;
