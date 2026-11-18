import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { analysisSignal } from "../generation/lifecycle";
import { prisma } from "../../../db/prisma";
import { withSqliteRetry } from "../../../db/sqliteRetry";
import { isBuiltInProvider, PROVIDERS } from "../../../llm/providers";
import type { LlmTokenUsageSnapshot } from "../../../llm/usageTracking";
import { AppError } from "../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import { bookAnalysisSourceNotePrompt } from "../../../prompting/prompts/bookAnalysis/bookAnalysis.prompts";
import { BookAnalysisBudgetGuard } from "./bookAnalysis.budget";
import { getBookAnalysisCacheSegmentVersion, getBookAnalysisNotesConcurrency } from "../shared/bookAnalysis.config";
import { runWithConcurrency } from "../infrastructure/bookAnalysis.concurrent";
import {
  formatCacheHitLabel,
  formatCacheLookupLabel,
  formatSegmentProgressLabel,
  getCacheHitProgress,
  getLoadingCacheProgress,
  getNotesStageProgress,
} from "../infrastructure/bookAnalysis.progress";
import type { BookAnalysisProgressUpdate, SourceNote, SourceNotesResult } from "../shared/bookAnalysis.types";
import {
  buildSourceSegments,
  compactExcerpt,
  getNotesMaxTokensCacheKey,
  getNotesMaxTokens,
  normalizeMaxTokens,
  normalizeTemperature,
  safeParseJSON,
  toEvidenceList,
  toStringList,
} from "../shared/bookAnalysis.utils";

interface GetOrBuildSourceNotesInput {
  analysisId?: string;
  documentVersionId: string;
  content: string;
  provider: LLMProvider;
  model?: string;
  temperature?: number;
  sectionMaxTokens?: number;
  sourceScopeKey?: string;
  ensureNotCancelled?: () => Promise<void>;
  onProgress?: (update: BookAnalysisProgressUpdate) => Promise<void>;
}

export class BookAnalysisSourceCacheService {
  async getOrBuildSourceNotes(input: GetOrBuildSourceNotesInput): Promise<SourceNotesResult> {
    const { requestMaxTokens, ...cacheIdentity } = this.buildCacheIdentity(
      input.provider,
      input.model,
      input.temperature,
      input.sectionMaxTokens,
    );
    const identity = { documentVersionId: input.documentVersionId, ...cacheIdentity };
    const sourceScopeKey = input.sourceScopeKey?.trim() || "full";
    const segments = buildSourceSegments(input.content);
    if (segments.length === 0) {
      throw new AppError("Knowledge document version content is empty.", 400);
    }
    const segmentKeys = segments.map((_, index) => `${sourceScopeKey}:note:${index + 1}`);

    await input.onProgress?.({
      stage: "loading_cache",
      progress: getLoadingCacheProgress(),
      itemKey: "source-notes-cache",
      itemLabel: formatCacheLookupLabel(),
    });

    const rows = await prisma.bookAnalysisSourceCache.findMany({
      where: {
        ...identity,
        sourceScopeKey: { in: [sourceScopeKey, ...segmentKeys] },
      },
      select: { sourceScopeKey: true, notesJson: true },
    });
    const cachedByScope = new Map(rows.map((row) => [row.sourceScopeKey, row.notesJson]));
    const aggregate = this.parseCachedNotes(cachedByScope.get(sourceScopeKey));
    const canReuseAggregate = aggregate.length === segments.length
      && aggregate.every((note, index) => note.sourceLabel === segments[index].label)
      && !this.isLegacyFallbackCache(aggregate, segments);
    const notes = canReuseAggregate ? [...aggregate] : segments.map((segment, index) => {
      const [note] = this.parseCachedNotes(cachedByScope.get(segmentKeys[index]));
      return note?.sourceLabel === segment.label ? note : null;
    });
    const missing = segments.flatMap((segment, index) => notes[index] ? [] : [{ segment, index }]);

    if (missing.length === 0) {
      await input.onProgress?.({
        stage: "preparing_notes",
        progress: getCacheHitProgress(),
        itemKey: "source-notes-cache-hit",
        itemLabel: formatCacheHitLabel(segments.length),
      });
      return {
        notes: notes.filter((note): note is SourceNote => note !== null),
        segmentCount: segments.length,
        cacheHit: true,
      };
    }

    let completedCount = segments.length - missing.length;
    const budget = input.analysisId ? new BookAnalysisBudgetGuard(input.analysisId) : null;

    await runWithConcurrency(missing, getBookAnalysisNotesConcurrency(), async ({ segment, index }) => {
      await input.ensureNotCancelled?.();
      await input.onProgress?.({
        stage: "preparing_notes",
        progress: getNotesStageProgress(completedCount, segments.length),
        itemKey: `segment-${index + 1}`,
        itemLabel: formatSegmentProgressLabel(index + 1, segments.length, segment.label),
      });

      await budget?.assertCanDispatch();
      const { note, tokenUsage } = await this.buildSingleSourceNote({
        provider: input.provider,
        model: input.model,
        temperature: cacheIdentity.temperature,
        maxTokens: requestMaxTokens,
        segment,
      });
      if (!note) {
        await budget?.onSectionFinished(tokenUsage);
        throw new AppError("AI 未返回可用的原文分析笔记，请检查模型配置后重试。", 502);
      }

      const key = { ...identity, sourceScopeKey: segmentKeys[index] };
      const notesJson = JSON.stringify([note]);
      const save = (db: Pick<typeof prisma, "bookAnalysisSourceCache">) => db.bookAnalysisSourceCache.upsert({
        where: { documentVersionId_sourceScopeKey_provider_model_temperature_notesMaxTokens_segmentVersion: key },
        create: { ...key, segmentCount: 1, notesJson },
        update: { segmentCount: 1, notesJson },
      });
      if (budget) {
        const recorded = await withSqliteRetry(() => prisma.$transaction(async (tx) => {
          await save(tx);
          return budget.recordUsage(tokenUsage, tx);
        }), { label: "book-analysis-source-note" });
        budget.assertWithinBudget(recorded);
      } else {
        await save(prisma);
      }

      notes[index] = note;
      completedCount += 1;
      await input.onProgress?.({
        stage: "preparing_notes",
        progress: getNotesStageProgress(completedCount, segments.length),
        itemKey: `segment-${index + 1}`,
        itemLabel: formatSegmentProgressLabel(index + 1, segments.length, segment.label),
      });
    });

    return {
      notes: notes.filter((note): note is SourceNote => note !== null),
      segmentCount: segments.length,
      cacheHit: false,
    };
  }

  private buildCacheIdentity(
    provider: LLMProvider,
    requestedModel: string | undefined,
    temperature: number | undefined,
    sectionMaxTokens: number | undefined,
  ) {
    const normalizedSectionMaxTokens = normalizeMaxTokens(sectionMaxTokens);
    const requestMaxTokens = getNotesMaxTokens(normalizedSectionMaxTokens);
    const resolvedModel = requestedModel?.trim()
      || (isBuiltInProvider(provider) ? PROVIDERS[provider].defaultModel : "");
    if (!resolvedModel) {
      throw new AppError("Custom provider requires an explicit model for book analysis.", 400);
    }
    return {
      provider,
      model: resolvedModel,
      temperature: normalizeTemperature(temperature),
      notesMaxTokens: getNotesMaxTokensCacheKey(normalizedSectionMaxTokens),
      requestMaxTokens,
      segmentVersion: getBookAnalysisCacheSegmentVersion(),
    };
  }

  private parseCachedNotes(notesJson?: string): SourceNote[] {
    const parsed = safeParseJSON<SourceNote[] | null>(notesJson ?? null, null);
    if (!Array.isArray(parsed) || !parsed.every((note) => note && typeof note.sourceLabel === "string"
      && typeof note.summary === "string" && note.summary.trim()
      && [note.plotPoints, note.timelineEvents, note.characters, note.worldbuilding, note.themes,
        note.styleTechniques, note.marketHighlights, note.readerSignals, note.weaknessSignals, note.evidence]
        .every(Array.isArray))) {
      return [];
    }
    return parsed;
  }

  private isLegacyFallbackCache(
    notes: SourceNote[],
    segments: Array<{ label: string; content: string }>,
  ): boolean {
    if (notes.length !== segments.length || notes.length === 0) {
      return false;
    }
    return notes.every((note, index) => {
      const segment = segments[index];
      return note.sourceLabel === segment.label
        && note.summary === compactExcerpt(segment.content, 120)
        && note.plotPoints.length === 0
        && note.timelineEvents.length === 0
        && note.characters.length === 0
        && note.worldbuilding.length === 0
        && note.themes.length === 0
        && note.styleTechniques.length === 0
        && note.marketHighlights.length === 0
        && note.readerSignals.length === 0
        && note.weaknessSignals.length === 0
        && note.evidence.length === 0;
    });
  }

  private async buildSingleSourceNote(input: {
    provider: LLMProvider;
    model?: string;
    temperature: number;
    maxTokens?: number;
    segment: { label: string; content: string };
  }): Promise<{ note: SourceNote | null; tokenUsage?: LlmTokenUsageSnapshot | null }> {
    const result = await runStructuredPrompt({
      asset: bookAnalysisSourceNotePrompt,
      promptInput: {
        segmentLabel: input.segment.label,
        segmentContent: input.segment.content,
      },
      options: {
        signal: analysisSignal(),
        provider: input.provider,
        model: input.model,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
      },
    });
    const record = result.output as Record<string, unknown>;
    const summary = typeof record.summary === "string" ? record.summary.trim() : "";
    const tokenUsage = result.meta?.tokenUsage;
    if (!summary) {
      return { note: null, tokenUsage };
    }
    return {
      tokenUsage,
      note: {
        sourceLabel: input.segment.label,
        summary,
        plotPoints: toStringList(record.plotPoints),
        timelineEvents: toStringList(record.timelineEvents),
        characters: toStringList(record.characters),
        worldbuilding: toStringList(record.worldbuilding),
        themes: toStringList(record.themes),
        styleTechniques: toStringList(record.styleTechniques),
        marketHighlights: toStringList(record.marketHighlights),
        readerSignals: toStringList(record.readerSignals),
        weaknessSignals: toStringList(record.weaknessSignals),
        evidence: toEvidenceList(record.evidence, input.segment.label),
      },
    };
  }
}
