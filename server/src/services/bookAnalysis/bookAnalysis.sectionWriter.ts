import type { BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import {
  bookAnalysisOptimizedDraftPrompt,
  bookAnalysisSectionPrompt,
} from "../../prompting/prompts/bookAnalysis/bookAnalysis.prompts";
import { SECTION_PROMPTS } from "./bookAnalysis.constants";
import type { BookAnalysisOverviewContext, SectionGenerationResult, SourceNote } from "./bookAnalysis.types";
import {
  getSectionTitle,
  normalizeBookAnalysisStructuredData,
  normalizeBookAnalysisEvidence,
  normalizeBookAnalysisStructuredDataWithWarnings,
  normalizeMaxTokens,
  normalizeTemperature,
  renderNotesForPrompt,
  selectNotesForBookAnalysisSection,
} from "./bookAnalysis.utils";

export class BookAnalysisSectionWriter {
  async generateSection(
    sectionKey: BookAnalysisSectionKey,
    notes: SourceNote[],
    provider: LLMProvider,
    model?: string,
    temperature?: number,
    maxTokens?: number,
    overviewContext?: BookAnalysisOverviewContext | null,
  ): Promise<SectionGenerationResult> {
    const prompt = SECTION_PROMPTS[sectionKey];
    const notesText = renderNotesForPrompt(selectNotesForBookAnalysisSection(sectionKey, notes), sectionKey);
    const overviewContextText = sectionKey === "overview" || !overviewContext
      ? ""
      : renderOverviewContextForPrompt(overviewContext);
    try {
      const result = await runStructuredPrompt({
        asset: bookAnalysisSectionPrompt,
        promptInput: {
          sectionKey,
          sectionTitle: getSectionTitle(sectionKey),
          promptFocus: prompt,
          overviewContextText,
          notesText,
        },
        options: {
          provider,
          model,
          temperature: normalizeTemperature(temperature),
          maxTokens: normalizeMaxTokens(maxTokens),
        },
      });
      const parsed = result.output;

      const markdown =
        typeof (parsed as any).markdown === "string" && (parsed as any).markdown.trim()
          ? (parsed as any).markdown.trim()
          : JSON.stringify(parsed);
      const normalizedStructuredData =
        (parsed as any).structuredData && typeof (parsed as any).structuredData === "object"
          ? normalizeBookAnalysisStructuredDataWithWarnings(sectionKey, (parsed as any).structuredData as Record<string, unknown>)
          : normalizeBookAnalysisStructuredDataWithWarnings(sectionKey, null);
      const evidence = normalizeBookAnalysisEvidence(
        sectionKey,
        (parsed as any).evidence,
        normalizedStructuredData.structuredData,
      );
      return {
        markdown,
        structuredData: normalizedStructuredData.structuredData,
        normalizationWarnings: normalizedStructuredData.normalizationWarnings,
        evidence,
      };
    } catch {
      return {
        markdown: "",
        structuredData: normalizeBookAnalysisStructuredData(sectionKey, null),
        normalizationWarnings: [],
        evidence: [],
      };
    }
  }

  async generateOptimizedDraft(input: {
    sectionKey: BookAnalysisSectionKey;
    currentDraft: string;
    instruction: string;
    notes: SourceNote[];
    provider: LLMProvider;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const notesText = renderNotesForPrompt(
      selectNotesForBookAnalysisSection(input.sectionKey, input.notes),
      input.sectionKey,
    );
    try {
      const result = await runStructuredPrompt({
        asset: bookAnalysisOptimizedDraftPrompt,
        promptInput: {
          sectionKey: input.sectionKey,
          sectionTitle: getSectionTitle(input.sectionKey),
          instruction: input.instruction,
          currentDraft: input.currentDraft,
          notesText,
        },
        options: {
          provider: input.provider,
          model: input.model,
          temperature: normalizeTemperature(input.temperature),
          maxTokens: normalizeMaxTokens(input.maxTokens),
        },
      });
      const parsed = result.output;

      if (typeof (parsed as any).optimizedDraft === "string" && (parsed as any).optimizedDraft.trim()) {
        return (parsed as any).optimizedDraft.trim();
      }

      return JSON.stringify(parsed);
    } catch {
      return "";
    }
  }
}

function renderOverviewContextForPrompt(context: BookAnalysisOverviewContext): string {
  const lines = [
    context.markdownSummary ? `总览摘要：${context.markdownSummary}` : "",
    context.oneLinePositioning ? `一句话定位：${context.oneLinePositioning}` : "",
    context.genreTags.length > 0 ? `题材标签：${context.genreTags.join("、")}` : "",
    context.sellingPointTags.length > 0 ? `卖点标签：${context.sellingPointTags.join("、")}` : "",
    context.targetReaders.length > 0 ? `目标读者：${context.targetReaders.join("、")}` : "",
    context.strengths.length > 0 ? `整体优势：${context.strengths.join("、")}` : "",
    context.weaknesses.length > 0 ? `整体短板：${context.weaknesses.join("、")}` : "",
  ].filter(Boolean);

  return lines.length > 0
    ? ["## 整本定位（来自总览小节）", ...lines].join("\n")
    : "";
}
