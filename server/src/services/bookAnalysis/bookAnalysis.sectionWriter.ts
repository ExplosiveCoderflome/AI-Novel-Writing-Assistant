import type { BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { invokeStructuredLlm } from "../../llm/structuredInvoke";
import { SECTION_PROMPTS } from "./bookAnalysis.constants";
import type { SectionGenerationResult, SourceNote } from "./bookAnalysis.types";
import { bookAnalysisRawOutputSchema } from "./bookAnalysisSchemas";
import {
  getSectionTitle,
  normalizeMaxTokens,
  normalizeTemperature,
  renderNotesForPrompt,
  toEvidenceList,
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
    const notesText = renderNotesForPrompt(notes);
    try {
      const parsed = await invokeStructuredLlm({
        label: `book-analysis-section:${sectionKey}`,
        provider,
        model,
        temperature: normalizeTemperature(temperature),
        maxTokens: normalizeMaxTokens(maxTokens),
        taskType: "planner",
        systemPrompt: `You are a senior Chinese fiction analyst. Generate section "${getSectionTitle(sectionKey)}".
Return JSON only:
{
  "markdown": "Markdown content",
  "structuredData": {},
  "evidence": [{ "label": "...", "excerpt": "...", "sourceLabel": "..." }]
}
Constraints:
- Keep conclusions specific.
- Evidence must be grounded in given notes.
- Write markdown in Chinese.
Extra focus: ${prompt}`,
        userPrompt: `Section notes:\n${notesText}`,
        schema: bookAnalysisRawOutputSchema,
        maxRepairAttempts: 1,
      });

      const markdown =
        typeof (parsed as any).markdown === "string" && (parsed as any).markdown.trim()
          ? (parsed as any).markdown.trim()
          : JSON.stringify(parsed);
      const structuredData =
        (parsed as any).structuredData && typeof (parsed as any).structuredData === "object"
          ? ((parsed as any).structuredData as Record<string, unknown>)
          : null;
      const evidence = toEvidenceList((parsed as any).evidence);
      return {
        markdown,
        structuredData,
        evidence,
      };
    } catch {
      return {
        markdown: "",
        structuredData: null,
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
    const notesText = renderNotesForPrompt(input.notes);
    try {
      const parsed = await invokeStructuredLlm({
        label: `book-analysis-optimized-draft:${input.sectionKey}`,
        provider: input.provider,
        model: input.model,
        temperature: normalizeTemperature(input.temperature),
        maxTokens: normalizeMaxTokens(input.maxTokens),
        taskType: "planner",
        systemPrompt: `You refine book-analysis drafts.
Keep section focus: ${getSectionTitle(input.sectionKey)}.
Follow user instruction, preserve factual consistency with notes, and avoid unnecessary expansion.
Return JSON only: {"optimizedDraft":"..."}`,
        userPrompt: `User instruction:
${input.instruction}

Current draft:
${input.currentDraft || "(empty)"}

Section notes:
${notesText}`,
        schema: bookAnalysisRawOutputSchema,
        maxRepairAttempts: 1,
      });

      if (typeof (parsed as any).optimizedDraft === "string" && (parsed as any).optimizedDraft.trim()) {
        return (parsed as any).optimizedDraft.trim();
      }

      return JSON.stringify(parsed);
    } catch {
      return "";
    }
  }
}
