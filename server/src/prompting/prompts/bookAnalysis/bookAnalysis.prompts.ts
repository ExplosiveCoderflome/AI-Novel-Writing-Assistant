import type { BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import { bookAnalysisRawOutputSchema } from "../../../services/bookAnalysis/bookAnalysisSchemas";

export interface BookAnalysisSourceNotePromptInput {
  segmentLabel: string;
  segmentContent: string;
}

export interface BookAnalysisSectionPromptInput {
  sectionKey: BookAnalysisSectionKey;
  sectionTitle: string;
  promptFocus: string;
  notesText: string;
}

export interface BookAnalysisOptimizeDraftPromptInput {
  sectionKey: BookAnalysisSectionKey;
  sectionTitle: string;
  instruction: string;
  currentDraft: string;
  notesText: string;
}

export const bookAnalysisSourceNotePrompt: PromptAsset<
  BookAnalysisSourceNotePromptInput,
  z.infer<typeof bookAnalysisRawOutputSchema>
> = {
  id: "bookAnalysis.source.note",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: bookAnalysisRawOutputSchema,
  render: (input) => [
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
    new HumanMessage(`Segment title: ${input.segmentLabel}\n\nSegment content:\n${input.segmentContent}`),
  ],
};

export const bookAnalysisSectionPrompt: PromptAsset<
  BookAnalysisSectionPromptInput,
  z.infer<typeof bookAnalysisRawOutputSchema>
> = {
  id: "bookAnalysis.section.generate",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: bookAnalysisRawOutputSchema,
  render: (input) => [
    new SystemMessage(`You are a senior Chinese fiction analyst. Generate section "${input.sectionTitle}".
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
Extra focus: ${input.promptFocus}`),
    new HumanMessage(`Section notes:\n${input.notesText}`),
  ],
};

export const bookAnalysisOptimizedDraftPrompt: PromptAsset<
  BookAnalysisOptimizeDraftPromptInput,
  z.infer<typeof bookAnalysisRawOutputSchema>
> = {
  id: "bookAnalysis.section.optimize",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: bookAnalysisRawOutputSchema,
  render: (input) => [
    new SystemMessage(`You refine book-analysis drafts.
Keep section focus: ${input.sectionTitle}.
Follow user instruction, preserve factual consistency with notes, and avoid unnecessary expansion.
Return JSON only: {"optimizedDraft":"..."}`),
    new HumanMessage(`User instruction:
${input.instruction}

Current draft:
${input.currentDraft || "(empty)"}

Section notes:
${input.notesText}`),
  ],
};
