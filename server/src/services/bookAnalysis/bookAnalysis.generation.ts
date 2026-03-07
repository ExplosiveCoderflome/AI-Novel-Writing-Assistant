import type { BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { prisma } from "../../db/prisma";
import { getLLM } from "../../llm/factory";
import { AppError } from "../../middleware/errorHandler";
import { SECTION_PROMPTS } from "./bookAnalysis.constants";
import { invokeWithJsonGuard } from "./bookAnalysis.llm";
import type { SectionGenerationResult, SourceNote } from "./bookAnalysis.types";
import {
  buildAnalysisSummaryFromContent,
  buildSourceSegments,
  compactExcerpt,
  encodeEvidence,
  encodeStructuredData,
  extractJSONObject,
  getEffectiveContent,
  getNotesMaxTokens,
  getSectionTitle,
  normalizeMaxTokens,
  normalizeTemperature,
  renderNotesForPrompt,
  safeParseJSON,
  toEvidenceList,
  toStringList,
} from "./bookAnalysis.utils";
export class BookAnalysisGenerationService {
  async runFullAnalysis(analysisId: string): Promise<void> {
    const analysis = await prisma.bookAnalysis.findUnique({
      where: { id: analysisId },
      include: {
        documentVersion: true,
        sections: {
          orderBy: [{ sortOrder: "asc" }],
        },
      },
    });
    if (!analysis || analysis.status === "archived") {
      return;
    }
    const activeSections = analysis.sections.filter((section) => !section.frozen);
    await prisma.bookAnalysis.update({
      where: { id: analysisId },
      data: {
        status: "running",
        progress: activeSections.length === 0 ? 1 : 0,
        lastError: null,
        lastRunAt: new Date(),
      },
    });
    if (activeSections.length === 0) {
      await prisma.bookAnalysis.update({
        where: { id: analysisId },
        data: {
          status: "succeeded",
          progress: 1,
        },
      });
      return;
    }
    const provider = (analysis.provider as LLMProvider | null) ?? "deepseek";
    const model = analysis.model ?? undefined;
    const temperature = normalizeTemperature(analysis.temperature);
    const maxTokens = normalizeMaxTokens(analysis.maxTokens);
    try {
      const notes = await this.buildSourceNotes(analysis.documentVersion.content, provider, model, temperature, maxTokens);
      let completedCount = 0;
      const errors: string[] = [];
      let summary = analysis.summary;
      for (const section of analysis.sections) {
        if (section.frozen) {
          continue;
        }
        try {
          await prisma.bookAnalysisSection.update({
            where: {
              analysisId_sectionKey: {
                analysisId,
                sectionKey: section.sectionKey,
              },
            },
            data: {
              status: "running",
            },
          });
          const generated = await this.generateSection(
            section.sectionKey as BookAnalysisSectionKey,
            notes,
            provider,
            model,
            temperature,
            maxTokens,
          );
          await prisma.bookAnalysisSection.update({
            where: {
              analysisId_sectionKey: {
                analysisId,
                sectionKey: section.sectionKey,
              },
            },
            data: {
              status: "succeeded",
              aiContent: generated.markdown,
              structuredDataJson: encodeStructuredData(generated.structuredData),
              evidenceJson: encodeEvidence(generated.evidence),
            },
          });
          if (section.sectionKey === "overview") {
            summary = buildAnalysisSummaryFromContent(generated.markdown);
          }
        } catch (error) {
          errors.push(`${section.title}: ${error instanceof Error ? error.message : "Unknown error"}`);
          await prisma.bookAnalysisSection.update({
            where: {
              analysisId_sectionKey: {
                analysisId,
                sectionKey: section.sectionKey,
              },
            },
            data: {
              status: "failed",
            },
          });
        } finally {
          completedCount += 1;
          await prisma.bookAnalysis.update({
            where: { id: analysisId },
            data: {
              progress: Math.min(1, completedCount / activeSections.length),
            },
          });
        }
      }
      await prisma.bookAnalysis.update({
        where: { id: analysisId },
        data: {
          status: errors.length > 0 ? "failed" : "succeeded",
          progress: 1,
          summary,
          lastError: errors.length > 0 ? errors.join(" | ") : null,
        },
      });
    } catch (error) {
      await prisma.bookAnalysis.update({
        where: { id: analysisId },
        data: {
          status: "failed",
          progress: 1,
          lastError: error instanceof Error ? error.message : "Book analysis failed.",
        },
      });
    }
  }
  async runSingleSection(analysisId: string, sectionKey: BookAnalysisSectionKey): Promise<void> {
    const analysis = await prisma.bookAnalysis.findUnique({
      where: { id: analysisId },
      include: {
        documentVersion: true,
        sections: true,
      },
    });
    if (!analysis || analysis.status === "archived") {
      return;
    }
    const section = analysis.sections.find((item) => item.sectionKey === sectionKey);
    if (!section || section.frozen) {
      return;
    }
    const provider = (analysis.provider as LLMProvider | null) ?? "deepseek";
    const model = analysis.model ?? undefined;
    const temperature = normalizeTemperature(analysis.temperature);
    const maxTokens = normalizeMaxTokens(analysis.maxTokens);
    await prisma.bookAnalysis.update({
      where: { id: analysisId },
      data: {
        status: "running",
        lastError: null,
        lastRunAt: new Date(),
      },
    });
    try {
      await prisma.bookAnalysisSection.update({
        where: {
          analysisId_sectionKey: {
            analysisId,
            sectionKey,
          },
        },
        data: {
          status: "running",
        },
      });
      const notes = await this.buildSourceNotes(analysis.documentVersion.content, provider, model, temperature, maxTokens);
      const generated = await this.generateSection(sectionKey, notes, provider, model, temperature, maxTokens);
      await prisma.bookAnalysisSection.update({
        where: {
          analysisId_sectionKey: {
            analysisId,
            sectionKey,
          },
        },
        data: {
          status: "succeeded",
          aiContent: generated.markdown,
          structuredDataJson: encodeStructuredData(generated.structuredData),
          evidenceJson: encodeEvidence(generated.evidence),
        },
      });
      const sectionStatuses = await prisma.bookAnalysisSection.findMany({
        where: { analysisId },
        select: {
          sectionKey: true,
          status: true,
          frozen: true,
          editedContent: true,
          aiContent: true,
        },
      });
      const overview = sectionKey === "overview"
        ? generated.markdown
        : getEffectiveContent(
          sectionStatuses.find((item) => item.sectionKey === "overview") ?? { aiContent: null, editedContent: null },
        );
      await prisma.bookAnalysis.update({
        where: { id: analysisId },
        data: {
          status: sectionStatuses.some((item) => !item.frozen && item.status === "failed") ? "failed" : "succeeded",
          progress: 1,
          summary: buildAnalysisSummaryFromContent(overview),
          lastError: null,
        },
      });
    } catch (error) {
      await prisma.bookAnalysisSection.update({
        where: {
          analysisId_sectionKey: {
            analysisId,
            sectionKey,
          },
        },
        data: {
          status: "failed",
        },
      });
      await prisma.bookAnalysis.update({
        where: { id: analysisId },
        data: {
          status: "failed",
          progress: 1,
          lastError: error instanceof Error ? error.message : "Section regeneration failed.",
        },
      });
    }
  }
  async optimizeSectionPreview(input: {
    analysisId: string;
    sectionKey: BookAnalysisSectionKey;
    currentDraft: string;
    instruction: string;
  }): Promise<string> {
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
    const notes = await this.buildSourceNotes(
      section.analysis.documentVersion.content,
      provider,
      model,
      temperature,
      maxTokens,
    );
    const baseDraft = input.currentDraft.trim()
      || section.editedContent?.trim()
      || section.aiContent?.trim()
      || "";
    const optimized = await this.generateOptimizedDraft({
      sectionKey: input.sectionKey,
      currentDraft: baseDraft,
      instruction: input.instruction,
      notes,
      provider,
      model,
      temperature,
      maxTokens,
    });
    return optimized.trim() || baseDraft;
  }
  private async buildSourceNotes(
    content: string,
    provider: LLMProvider,
    model?: string,
    temperature?: number,
    sectionMaxTokens?: number,
  ): Promise<SourceNote[]> {
    const segments = buildSourceSegments(content);
    if (segments.length === 0) {
      throw new AppError("Knowledge document version content is empty.", 400);
    }
    const llm = await getLLM(provider, {
      model,
      temperature: normalizeTemperature(temperature),
      maxTokens: getNotesMaxTokens(normalizeMaxTokens(sectionMaxTokens)),
    });
    const notes: SourceNote[] = [];
    for (const segment of segments) {
      try {
        const result = await invokeWithJsonGuard(llm, [
          new SystemMessage(`You are a book-analysis assistant. Output compact JSON only:
{
  "summary": "short summary in Chinese",
  "plotPoints": ["..."],
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
          new HumanMessage(`Segment title: ${segment.label}\n\nSegment content:\n${segment.content}`),
        ], provider, model);
        const parsed = safeParseJSON<Record<string, unknown>>(
          extractJSONObject(String(result.content)),
          {},
        );
        notes.push({
          sourceLabel: segment.label,
          summary:
            (typeof parsed.summary === "string" && parsed.summary.trim())
            || compactExcerpt(segment.content, 120),
          plotPoints: toStringList(parsed.plotPoints),
          characters: toStringList(parsed.characters),
          worldbuilding: toStringList(parsed.worldbuilding),
          themes: toStringList(parsed.themes),
          styleTechniques: toStringList(parsed.styleTechniques),
          marketHighlights: toStringList(parsed.marketHighlights),
          evidence: toEvidenceList(parsed.evidence, segment.label),
        });
      } catch {
        notes.push({
          sourceLabel: segment.label,
          summary: compactExcerpt(segment.content, 120),
          plotPoints: [],
          characters: [],
          worldbuilding: [],
          themes: [],
          styleTechniques: [],
          marketHighlights: [],
          evidence: [],
        });
      }
    }
    return notes;
  }
  private async generateSection(
    sectionKey: BookAnalysisSectionKey,
    notes: SourceNote[],
    provider: LLMProvider,
    model?: string,
    temperature?: number,
    maxTokens?: number,
  ): Promise<SectionGenerationResult> {
    const llm = await getLLM(provider, {
      model,
      temperature: normalizeTemperature(temperature),
      maxTokens: normalizeMaxTokens(maxTokens),
    });
    const prompt = SECTION_PROMPTS[sectionKey];
    const notesText = renderNotesForPrompt(notes);
    const result = await invokeWithJsonGuard(llm, [
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
    ], provider, model);
    try {
      const parsed = safeParseJSON<Record<string, unknown>>(
        extractJSONObject(String(result.content)),
        {},
      );
      const markdown =
        (typeof parsed.markdown === "string" && parsed.markdown.trim())
        || String(result.content).trim();
      const structuredData = parsed.structuredData && typeof parsed.structuredData === "object"
        ? parsed.structuredData as Record<string, unknown>
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
  private async generateOptimizedDraft(input: {
    sectionKey: BookAnalysisSectionKey;
    currentDraft: string;
    instruction: string;
    notes: SourceNote[];
    provider: LLMProvider;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const llm = await getLLM(input.provider, {
      model: input.model,
      temperature: normalizeTemperature(input.temperature),
      maxTokens: normalizeMaxTokens(input.maxTokens),
    });
    const notesText = renderNotesForPrompt(input.notes);
    const result = await invokeWithJsonGuard(llm, [
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
    ], input.provider, input.model);
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
