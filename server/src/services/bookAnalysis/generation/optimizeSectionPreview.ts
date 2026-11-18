import type { BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { BookAnalysisBudgetGuard } from "../caching/bookAnalysis.budget";
import type { BookAnalysisSourceCacheService } from "../caching/bookAnalysis.cache";
import type { BookAnalysisSectionWriter } from "../writing/bookAnalysis.sectionWriter";
import {
  normalizeMaxTokens,
  normalizeTemperature,
} from "../shared/bookAnalysis.utils";
import { buildBookAnalysisSourceScope } from "./sourceScope";

export async function optimizeSectionPreview(
  deps: {
    sourceCacheService: BookAnalysisSourceCacheService;
    sectionWriter: BookAnalysisSectionWriter;
  },
  input: {
    analysisId: string;
    sectionKey: BookAnalysisSectionKey;
    currentDraft: string;
    instruction: string;
  },
): Promise<string> {
  const section = await prisma.bookAnalysisSection.findFirst({
    where: {
      analysisId: input.analysisId,
      sectionKey: input.sectionKey,
    },
    include: {
      analysis: {
        include: {
          documentVersion: true,
        },
      },
    },
  });
  if (!section) {
    throw new AppError("Book analysis section not found.", 404);
  }
  if (section.analysis.status === "archived") {
    throw new AppError("Archived book analysis cannot be optimized.", 400);
  }
  if (section.frozen) {
    throw new AppError("Frozen sections cannot be optimized until unfrozen.", 400);
  }
  const provider = (section.analysis.provider as LLMProvider | null) ?? "deepseek";
  const model = section.analysis.model ?? undefined;
  const temperature = normalizeTemperature(section.analysis.temperature);
  const maxTokens = normalizeMaxTokens(section.analysis.maxTokens);
  const sourceScope = buildBookAnalysisSourceScope(section.analysis);
  const budget = new BookAnalysisBudgetGuard(input.analysisId);
  const notes = await deps.sourceCacheService.getOrBuildSourceNotes({
    analysisId: input.analysisId,
    documentVersionId: section.analysis.documentVersionId,
    content: sourceScope.content,
    provider,
    model,
    temperature,
    sectionMaxTokens: maxTokens,
    sourceScopeKey: sourceScope.sourceScopeKey,
  });
  const baseDraft =
    input.currentDraft.trim() || section.editedContent?.trim() || section.aiContent?.trim() || "";
  await budget.assertCanDispatch();
  const optimized = await deps.sectionWriter.generateOptimizedDraft({
    sectionKey: input.sectionKey,
    currentDraft: baseDraft,
    instruction: input.instruction,
    notes: notes.notes,
    provider,
    model,
    temperature,
    maxTokens,
    onTokenUsage: async (usage) => {
      // Keep a completed preview available when its final usage reaches the soft limit.
      await budget.recordUsage(usage);
    },
  });
  return optimized.trim() || baseDraft;
}
