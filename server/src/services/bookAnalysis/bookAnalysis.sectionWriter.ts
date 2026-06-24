import type { BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import {
  bookAnalysisOptimizedDraftPrompt,
  bookAnalysisSectionPrompt,
} from "../../prompting/prompts/bookAnalysis/bookAnalysis.prompts";
import { SECTION_PROMPTS } from "./bookAnalysis.constants";
import type { SectionGenerationResult, SourceNote } from "./bookAnalysis.types";
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
  ): Promise<SectionGenerationResult> {
    const prompt = SECTION_PROMPTS[sectionKey];
    const notesText = renderNotesForPrompt(selectNotesForBookAnalysisSection(sectionKey, notes), sectionKey);
    try {
      const result = await runStructuredPrompt({
        asset: bookAnalysisSectionPrompt,
        promptInput: {
          sectionKey,
          sectionTitle: getSectionTitle(sectionKey),
          promptFocus: prompt,
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
