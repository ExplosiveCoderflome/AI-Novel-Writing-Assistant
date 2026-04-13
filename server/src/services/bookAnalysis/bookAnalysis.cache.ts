import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { isBuiltInProvider, PROVIDERS } from "../../llm/providers";
import { AppError } from "../../middleware/errorHandler";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { bookAnalysisSourceNotePrompt } from "../../prompting/prompts/bookAnalysis/bookAnalysis.prompts";
import { getBookAnalysisCacheSegmentVersion, getBookAnalysisNotesConcurrency } from "./bookAnalysis.config";
import { runWithConcurrency } from "./bookAnalysis.concurrent";
import {
  formatCacheHitLabel,
  formatCacheLookupLabel,
  formatSegmentProgressLabel,
  getCacheHitProgress,
  getLoadingCacheProgress,
  getNotesStageProgress,
} from "./bookAnalysis.progress";
import type { BookAnalysisProgressUpdate, SourceNote, SourceNotesResult } from "./bookAnalysis.types";
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
} from "./bookAnalysis.utils";

interface GetOrBuildSourceNotesInput {
  analysisId?: string;
  documentVersionId: string;
  content: string;
  provider: LLMProvider;
  model?: string;
  temperature?: number;
  sectionMaxTokens?: number;
  ensureNotCancelled?: () => Promise<void>;
  onProgress?: (update: BookAnalysisProgressUpdate) => Promise<void>;
}

export class BookAnalysisSourceCacheService {
  async getOrBuildSourceNotes(input: GetOrBuildSourceNotesInput): Promise<SourceNotesResult> {
    const cacheIdentity = this.buildCacheIdentity(input.provider, input.model, input.temperature, input.sectionMaxTokens);

    await input.onProgress?.({
      stage: "loading_cache",
      progress: getLoadingCacheProgress(),
      itemKey: "source-notes-cache",
      itemLabel: formatCacheLookupLabel(),
    });

    const cached = await prisma.bookAnalysisSourceCache.findUnique({
      where: {
        documentVersionId_provider_model_temperature_notesMaxTokens_segmentVersion: {
          documentVersionId: input.documentVersionId,
          provider: cacheIdentity.provider,
          model: cacheIdentity.model,
          temperature: cacheIdentity.temperature,
          notesMaxTokens: cacheIdentity.notesMaxTokens,
          segmentVersion: cacheIdentity.segmentVersion,
        },
      },
    });

    const cachedNotes = this.parseCachedNotes(cached?.notesJson ?? null);
    if (cached && cachedNotes) {
      await input.onProgress?.({
        stage: "preparing_notes",
        progress: getCacheHitProgress(),
        itemKey: "source-notes-cache-hit",
        itemLabel: formatCacheHitLabel(cached.segmentCount),
      });
      return {
        notes: cachedNotes,
        segmentCount: cached.segmentCount,
        cacheHit: true,
      };
    }

    const segments = buildSourceSegments(input.content);
    if (segments.length === 0) {
      throw new AppError("Knowledge document version content is empty.", 400);
    }

    const notes = new Array<SourceNote>(segments.length);
    let completedCount = 0;

    await runWithConcurrency(segments, getBookAnalysisNotesConcurrency(), async (segment, index) => {
      await input.ensureNotCancelled?.();
      await input.onProgress?.({
        stage: "preparing_notes",
        progress: getNotesStageProgress(completedCount, segments.length),
        itemKey: `segment-${index + 1}`,
        itemLabel: formatSegmentProgressLabel(index + 1, segments.length, segment.label),
      });

      notes[index] = await this.buildSingleSourceNote({
        provider: input.provider,
        model: input.model,
        temperature: cacheIdentity.temperature,
        maxTokens: cacheIdentity.requestMaxTokens,
        segment,
      });

      completedCount += 1;
      await input.onProgress?.({
        stage: "preparing_notes",
        progress: getNotesStageProgress(completedCount, segments.length),
        itemKey: `segment-${index + 1}`,
        itemLabel: formatSegmentProgressLabel(index + 1, segments.length, segment.label),
      });
    });

    await prisma.bookAnalysisSourceCache.upsert({
      where: {
        documentVersionId_provider_model_temperature_notesMaxTokens_segmentVersion: {
          documentVersionId: input.documentVersionId,
          provider: cacheIdentity.provider,
          model: cacheIdentity.model,
          temperature: cacheIdentity.temperature,
          notesMaxTokens: cacheIdentity.notesMaxTokens,
          segmentVersion: cacheIdentity.segmentVersion,
        },
      },
      update: {
        segmentCount: segments.length,
        notesJson: JSON.stringify(notes),
      },
      create: {
        documentVersionId: input.documentVersionId,
        provider: cacheIdentity.provider,
        model: cacheIdentity.model,
        temperature: cacheIdentity.temperature,
        notesMaxTokens: cacheIdentity.notesMaxTokens,
        segmentVersion: cacheIdentity.segmentVersion,
        segmentCount: segments.length,
        notesJson: JSON.stringify(notes),
      },
    });

    return {
      notes,
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

  private parseCachedNotes(notesJson: string | null): SourceNote[] | null {
    if (!notesJson) {
      return null;
    }
    const parsed = safeParseJSON<SourceNote[] | null>(notesJson, null);
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  }

  private async buildSingleSourceNote(input: {
    provider: LLMProvider;
    model?: string;
    temperature: number;
    maxTokens?: number;
    segment: { label: string; content: string };
  }): Promise<SourceNote> {
    try {
      const result = await runStructuredPrompt({
        asset: bookAnalysisSourceNotePrompt,
        promptInput: {
          segmentLabel: input.segment.label,
          segmentContent: input.segment.content,
        },
        options: {
          provider: input.provider,
          model: input.model,
          temperature: input.temperature,
          maxTokens: input.maxTokens,
        },
      });
      const parsed = result.output;

      const record = parsed as any as Record<string, unknown>;
      return {
        sourceLabel: input.segment.label,
        summary:
          (typeof record.summary === "string" && record.summary.trim()) || compactExcerpt(input.segment.content, 120),
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
      };
    } catch {
      return {
        sourceLabel: input.segment.label,
        summary: compactExcerpt(input.segment.content, 120),
        plotPoints: [],
        timelineEvents: [],
        characters: [],
        worldbuilding: [],
        themes: [],
        styleTechniques: [],
        marketHighlights: [],
        readerSignals: [],
        weaknessSignals: [],
        evidence: [],
      };
    }
  }
}
