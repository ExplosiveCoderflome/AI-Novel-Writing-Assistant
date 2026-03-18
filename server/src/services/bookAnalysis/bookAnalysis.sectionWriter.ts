import type { BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getLLM } from "../../llm/factory";
import { SECTION_PROMPTS } from "./bookAnalysis.constants";
import { invokeWithJsonGuard } from "./bookAnalysis.llm";
import type { SectionGenerationResult, SourceNote } from "./bookAnalysis.types";
import {
  extractJSONObject,
  getSectionTitle,
  normalizeMaxTokens,
  normalizeTemperature,
  renderNotesForPrompt,
  safeParseJSON,
  toEvidenceList,
} from "./bookAnalysis.utils";

type LlmFactory = typeof getLLM;
type InvokeJsonGuard = typeof invokeWithJsonGuard;

export class BookAnalysisSectionWriter {
  constructor(
    private readonly llmFactory: LlmFactory = getLLM,
    private readonly invokeJson: InvokeJsonGuard = invokeWithJsonGuard,
  ) {}

  async generateSection(
    sectionKey: BookAnalysisSectionKey,
    notes: SourceNote[],
    provider: LLMProvider,
    model?: string,
    temperature?: number,
    maxTokens?: number,
  ): Promise<SectionGenerationResult> {
    const llm = await this.llmFactory(provider, {
      model,
      temperature: normalizeTemperature(temperature),
      maxTokens: normalizeMaxTokens(maxTokens),
    });
    const prompt = SECTION_PROMPTS[sectionKey];
    const notesText = renderNotesForPrompt(notes);
    const result = await this.invokeJson(
      llm,
      [
        new SystemMessage(`You are a senior Chinese fiction analyst. Generate section "${getSectionTitle(sectionKey)}".
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
Extra focus: ${prompt}`),
        new HumanMessage(`Section notes:\n${notesText}`),
      ],
      provider,
      model,
    );
    try {
      const parsed = safeParseJSON<Record<string, unknown>>(extractJSONObject(String(result.content)), {});
      const markdown =
        (typeof parsed.markdown === "string" && parsed.markdown.trim()) || String(result.content).trim();
      const structuredData =
        parsed.structuredData && typeof parsed.structuredData === "object"
          ? (parsed.structuredData as Record<string, unknown>)
          : null;
      const evidence = toEvidenceList(parsed.evidence);
      return {
        markdown,
        structuredData,
        evidence,
      };
    } catch {
      return {
        markdown: String(result.content).trim(),
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
    const llm = await this.llmFactory(input.provider, {
      model: input.model,
      temperature: normalizeTemperature(input.temperature),
      maxTokens: normalizeMaxTokens(input.maxTokens),
    });
    const notesText = renderNotesForPrompt(input.notes);
    const result = await this.invokeJson(
      llm,
      [
        new SystemMessage(`You refine book-analysis drafts.
Keep section focus: ${getSectionTitle(input.sectionKey)}.
Follow user instruction, preserve factual consistency with notes, and avoid unnecessary expansion.
Return JSON only: {"optimizedDraft":"..."}`),
        new HumanMessage(`User instruction:
${input.instruction}

Current draft:
${input.currentDraft || "(empty)"}

Section notes:
${notesText}`),
      ],
      input.provider,
      input.model,
    );
    try {
      const parsed = safeParseJSON<Record<string, unknown>>(extractJSONObject(String(result.content)), {});
      if (typeof parsed.optimizedDraft === "string" && parsed.optimizedDraft.trim()) {
        return parsed.optimizedDraft.trim();
      }
      return String(result.content).trim();
    } catch {
      return String(result.content).trim();
    }
  }
}
