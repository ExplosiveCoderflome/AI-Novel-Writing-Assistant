import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { prisma } from "../../db/prisma";
import { getLLM } from "../../llm/factory";
import { PROVIDERS } from "../../llm/providers";
import { AppError } from "../../middleware/errorHandler";
import { invokeWithJsonGuard } from "./bookAnalysis.llm";
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
  extractJSONObject,
  getNotesMaxTokens,
  normalizeMaxTokens,
  normalizeTemperature,
  safeParseJSON,
  toEvidenceList,
  toStringList,
} from "./bookAnalysis.utils";

type LlmFactory = typeof getLLM;
type InvokeJsonGuard = typeof invokeWithJsonGuard;

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
  constructor(
    private readonly llmFactory: LlmFactory = getLLM,
    private readonly invokeJson: InvokeJsonGuard = invokeWithJsonGuard,
  ) {}

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

    const llm = await this.llmFactory(input.provider, {
      model: input.model,
      temperature: cacheIdentity.temperature,
      maxTokens: cacheIdentity.notesMaxTokens,
    });

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
        llm,
        provider: input.provider,
        model: input.model,
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
    return {
      provider,
      model: requestedModel?.trim() || PROVIDERS[provider].defaultModel,
      temperature: normalizeTemperature(temperature),
      notesMaxTokens: getNotesMaxTokens(normalizeMaxTokens(sectionMaxTokens)),
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
    llm: Awaited<ReturnType<LlmFactory>>;
    provider: LLMProvider;
    model?: string;
    segment: { label: string; content: string };
  }): Promise<SourceNote> {
    try {
      const result = await this.invokeJson(
        input.llm,
        [
          new SystemMessage(`You are a book-analysis assistant. Output compact JSON only:
{
  "summary": "short summary in Chinese",
  "plotPoints": ["..."],
  "timelineEvents": ["..."],
  "characters": ["..."],
  "worldbuilding": ["..."],
  "themes": ["..."],
  "styleTechniques": ["..."],
  "marketHighlights": ["..."],
  "evidence": [{"label": "...", "excerpt": "..."}]
}
Rules:
- Use simplified Chinese for values.
- Max 5 items per array.
- Max 3 items in evidence.`),
          new HumanMessage(`Segment title: ${input.segment.label}\n\nSegment content:\n${input.segment.content}`),
        ],
        input.provider,
        input.model,
      );
      const parsed = safeParseJSON<Record<string, unknown>>(extractJSONObject(String(result.content)), {});
      return {
        sourceLabel: input.segment.label,
        summary: (typeof parsed.summary === "string" && parsed.summary.trim()) || compactExcerpt(input.segment.content, 120),
        plotPoints: toStringList(parsed.plotPoints),
        timelineEvents: toStringList(parsed.timelineEvents),
        characters: toStringList(parsed.characters),
        worldbuilding: toStringList(parsed.worldbuilding),
        themes: toStringList(parsed.themes),
        styleTechniques: toStringList(parsed.styleTechniques),
        marketHighlights: toStringList(parsed.marketHighlights),
        evidence: toEvidenceList(parsed.evidence, input.segment.label),
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
        evidence: [],
      };
    }
  }
}
