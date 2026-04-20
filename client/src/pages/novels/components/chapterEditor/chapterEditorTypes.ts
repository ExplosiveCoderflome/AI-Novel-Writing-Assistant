import type {
  ChapterEditorAiRevisionRequest,
  ChapterEditorAiRevisionResponse,
  Chapter,
  ChapterEditorDiagnosticCard,
  ChapterEditorOperation,
  ChapterEditorRevisionScope,
  ChapterEditorWorkspaceResponse,
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

export interface ChapterEditorSessionState extends Partial<ChapterEditorAiRevisionResponse> {
  status: "idle" | "loading" | "ready" | "error";
  requestLabel?: string;
  customInstruction?: string;
  viewMode: "inline" | "block";
  errorMessage?: string;
}

export interface ChapterEditorShellProps {
  novelId: string;
  chapter: Chapter | undefined;
  workspace: ChapterEditorWorkspaceResponse | null;
  workspaceStatus: "loading" | "ready" | "error";
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
  source: "preset" | "freeform";
  scope: ChapterEditorRevisionScope;
  presetOperation?: ChapterEditorOperation;
  instruction?: string;
  selection?: ChapterEditorSelectionRange | null;
  content: string;
  contextRange?: ChapterEditorSelectionRange | null;
  provider?: import("@ai-novel/shared/types/llm").LLMProvider;
  model?: string;
  temperature?: number;
}

export interface ChapterEditorDiagnosticSelectionState {
  card: ChapterEditorDiagnosticCard;
  fromTask?: boolean;
}

export type BuildAiRevisionRequest = (
  input: ChapterEditorRequestBuilderInput,
) => ChapterEditorAiRevisionRequest;
