import type { BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";

export * from "./structuredOutline.utils";
export * from "./structuredOutlineSync.utils";

export interface NovelBasicFormState {
  title: string;
  description: string;
  worldId: string;
  status: "draft" | "published";
  writingMode: "original" | "continuation";
  projectMode: "ai_led" | "co_pilot" | "draft_mode" | "auto_pipeline";
  narrativePov: "first_person" | "third_person" | "mixed";
  pacePreference: "slow" | "balanced" | "fast";
  styleTone: string;
  emotionIntensity: "low" | "medium" | "high";
  aiFreedom: "low" | "medium" | "high";
  defaultChapterLength: number;
  projectStatus: "not_started" | "in_progress" | "completed" | "rework" | "blocked";
  storylineStatus: "not_started" | "in_progress" | "completed" | "rework" | "blocked";
  outlineStatus: "not_started" | "in_progress" | "completed" | "rework" | "blocked";
  resourceReadyScore: number;
  continuationSourceType: "novel" | "knowledge_document";
  sourceNovelId: string;
  sourceKnowledgeDocumentId: string;
  continuationBookAnalysisId: string;
  continuationBookAnalysisSections: BookAnalysisSectionKey[];
}

interface WorldContextSummaryInput {
  name: string;
  worldType?: string | null;
  description?: string | null;
  overviewSummary?: string | null;
  axioms?: string | null;
  magicSystem?: string | null;
  conflicts?: string | null;
}

export function buildWorldInjectionSummary(world: WorldContextSummaryInput | null | undefined): string | null {
  if (!world) {
    return null;
  }

  let axioms: string[] = [];
  if (world.axioms?.trim()) {
    try {
      const parsed = JSON.parse(world.axioms) as string[];
      axioms = Array.isArray(parsed) ? parsed.filter((item) => item.trim()).slice(0, 3) : [];
    } catch {
      axioms = world.axioms
        .split(/[\n,，;；]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 3);
    }
  }

  const summaryBlock = world.overviewSummary?.trim() || world.description?.trim() || "No summary.";
  const magicBlock = world.magicSystem?.trim() ? world.magicSystem.trim().slice(0, 120) : "";
  const conflictBlock = world.conflicts?.trim() ? world.conflicts.trim().slice(0, 120) : "";

  const lines = [
    `${world.name}${world.worldType ? ` (${world.worldType})` : ""}`,
    `Summary: ${summaryBlock}`,
    ...(axioms.length > 0 ? [`Axioms: ${axioms.join(" | ")}`] : []),
    ...(magicBlock ? [`Power: ${magicBlock}`] : []),
    ...(conflictBlock ? [`Conflict: ${conflictBlock}`] : []),
  ];
  return lines.join("\n");
}

export function patchNovelBasicForm(
  previous: NovelBasicFormState,
  patch: Partial<NovelBasicFormState>,
): NovelBasicFormState {
  const next = { ...previous, ...patch };
  if (next.writingMode === "original") {
    next.sourceNovelId = "";
    next.sourceKnowledgeDocumentId = "";
    next.continuationBookAnalysisId = "";
    next.continuationBookAnalysisSections = [];
  } else if (next.continuationSourceType === "novel") {
    next.sourceKnowledgeDocumentId = "";
  } else if (next.continuationSourceType === "knowledge_document") {
    next.sourceNovelId = "";
  }
  if (
    patch.continuationSourceType !== undefined
    && patch.continuationSourceType !== previous.continuationSourceType
  ) {
    next.continuationBookAnalysisId = "";
    next.continuationBookAnalysisSections = [];
  }
  if (
    next.continuationSourceType === "novel"
    && patch.sourceNovelId !== undefined
    && patch.sourceNovelId !== previous.sourceNovelId
  ) {
    next.continuationBookAnalysisId = "";
    next.continuationBookAnalysisSections = [];
  }
  if (
    next.continuationSourceType === "knowledge_document"
    && patch.sourceKnowledgeDocumentId !== undefined
    && patch.sourceKnowledgeDocumentId !== previous.sourceKnowledgeDocumentId
  ) {
    next.continuationBookAnalysisId = "";
    next.continuationBookAnalysisSections = [];
  }
  if (patch.continuationBookAnalysisId !== undefined && !patch.continuationBookAnalysisId) {
    next.continuationBookAnalysisSections = [];
  }
  return next;
}
