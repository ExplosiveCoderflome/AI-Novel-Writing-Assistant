import type { BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { BookAnalysisSourceCacheService } from "./bookAnalysis.cache";
import { getBookAnalysisSectionConcurrency } from "./bookAnalysis.config";
import { runWithConcurrency } from "./bookAnalysis.concurrent";
import {
  formatSectionProgressLabel,
  getSectionStageProgress,
} from "./bookAnalysis.progress";
import { BookAnalysisSectionWriter } from "./bookAnalysis.sectionWriter";
import type { BookAnalysisProgressUpdate, SourceNote } from "./bookAnalysis.types";
import {
  buildAnalysisSummaryFromContent,
  encodeEvidence,
  encodeStructuredData,
  getEffectiveContent,
  normalizeMaxTokens,
  normalizeTemperature,
} from "./bookAnalysis.utils";

class AnalysisCancelledError extends Error {
  constructor() {
    super("BOOK_ANALYSIS_CANCELLED");
  }
}

const BOOK_ANALYSIS_HEARTBEAT_INTERVAL_MS = 20_000;

export class BookAnalysisGenerationService {
  constructor(
    private readonly sourceCacheService = new BookAnalysisSourceCacheService(),
    private readonly sectionWriter = new BookAnalysisSectionWriter(),
  ) {}

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
    if (!analysis || analysis.status === "archived" || analysis.status === "cancelled") {
      return;
    }
    if (analysis.cancelRequestedAt) {
      await this.markCancelled(analysisId, analysis.progress);
      return;
    }

    const activeSections = analysis.sections.filter((section) => !section.frozen);
    await prisma.bookAnalysis.update({
      where: { id: analysisId },
      data: {
        status: "running",
        progress: activeSections.length === 0 ? 1 : 0,
        heartbeatAt: new Date(),
        currentStage: "loading_cache",
        currentItemKey: null,
        currentItemLabel: null,
        lastError: null,
        lastRunAt: new Date(),
      },
    });

    if (activeSections.length === 0) {
      await this.markSucceeded(analysisId, analysis.summary);
      return;
    }

    const provider = (analysis.provider as LLMProvider | null) ?? "deepseek";
    const model = analysis.model ?? undefined;
    const temperature = normalizeTemperature(analysis.temperature);
    const maxTokens = normalizeMaxTokens(analysis.maxTokens);

    await this.withAnalysisHeartbeat(analysisId, async () => {
      try {
        const notes = await this.getSourceNotes({
          analysisId,
          documentVersionId: analysis.documentVersionId,
          content: analysis.documentVersion.content,
          provider,
          model,
          temperature,
          sectionMaxTokens: maxTokens,
        });

        let completedSections = 0;
        const errors: string[] = [];
        let summary = analysis.summary;

        await runWithConcurrency(activeSections, getBookAnalysisSectionConcurrency(), async (section, index) => {
          await this.ensureNotCancelled(analysisId);
          await this.updateAnalysisProgress(analysisId, {
            stage: "generating_sections",
            progress: getSectionStageProgress(completedSections, activeSections.length),
            itemKey: section.sectionKey,
            itemLabel: formatSectionProgressLabel(index + 1, activeSections.length, section.title),
          });

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

          try {
            const generated = await this.sectionWriter.generateSection(
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
            if (error instanceof AnalysisCancelledError) {
              throw error;
            }
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
            completedSections += 1;
            await this.updateAnalysisProgress(analysisId, {
              stage: "generating_sections",
              progress: getSectionStageProgress(completedSections, activeSections.length),
              itemKey: section.sectionKey,
              itemLabel: formatSectionProgressLabel(index + 1, activeSections.length, section.title),
            });
          }
        });

        await this.ensureNotCancelled(analysisId);
        await prisma.bookAnalysis.update({
          where: { id: analysisId },
          data: {
            status: errors.length > 0 ? "failed" : "succeeded",
            progress: 1,
            summary,
            lastError: errors.length > 0 ? errors.join(" | ") : null,
            heartbeatAt: null,
            currentStage: null,
            currentItemKey: null,
            currentItemLabel: null,
            cancelRequestedAt: null,
          },
        });
      } catch (error) {
        if (error instanceof AnalysisCancelledError) {
          await this.markCancelled(analysisId);
          return;
        }
        await this.markFailed(analysisId, error instanceof Error ? error.message : "Book analysis failed.");
      }
    });
  }

  async runSingleSection(analysisId: string, sectionKey: BookAnalysisSectionKey): Promise<void> {
    const analysis = await prisma.bookAnalysis.findUnique({
      where: { id: analysisId },
      include: {
        documentVersion: true,
        sections: true,
      },
    });
    if (!analysis || analysis.status === "archived" || analysis.status === "cancelled") {
      return;
    }
    const section = analysis.sections.find((item) => item.sectionKey === sectionKey);
    if (!section || section.frozen) {
      return;
    }
    if (analysis.cancelRequestedAt) {
      await this.markCancelled(analysisId, analysis.progress);
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
        progress: 0,
        lastError: null,
        lastRunAt: new Date(),
        heartbeatAt: new Date(),
        currentStage: "loading_cache",
        currentItemKey: null,
        currentItemLabel: null,
      },
    });

    await this.withAnalysisHeartbeat(analysisId, async () => {
      try {
        const notes = await this.getSourceNotes({
          analysisId,
          documentVersionId: analysis.documentVersionId,
          content: analysis.documentVersion.content,
          provider,
          model,
          temperature,
          sectionMaxTokens: maxTokens,
        });

        await this.ensureNotCancelled(analysisId);
        await this.updateAnalysisProgress(analysisId, {
          stage: "generating_sections",
          progress: getSectionStageProgress(0, 1),
          itemKey: sectionKey,
          itemLabel: formatSectionProgressLabel(1, 1, section.title),
        });

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

        const generated = await this.sectionWriter.generateSection(sectionKey, notes, provider, model, temperature, maxTokens);

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
        const overview =
          sectionKey === "overview"
            ? generated.markdown
            : getEffectiveContent(
                sectionStatuses.find((item) => item.sectionKey === "overview") ?? {
                  aiContent: null,
                  editedContent: null,
                },
              );

        await prisma.bookAnalysis.update({
          where: { id: analysisId },
          data: {
            status: sectionStatuses.some((item) => !item.frozen && item.status === "failed") ? "failed" : "succeeded",
            progress: 1,
            summary: buildAnalysisSummaryFromContent(overview),
            lastError: null,
            heartbeatAt: null,
            currentStage: null,
            currentItemKey: null,
            currentItemLabel: null,
            cancelRequestedAt: null,
          },
        });
      } catch (error) {
        if (error instanceof AnalysisCancelledError) {
          await this.markCancelled(analysisId);
          return;
        }
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
        await this.markFailed(analysisId, error instanceof Error ? error.message : "Section regeneration failed.");
      }
    });
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
    const notes = await this.sourceCacheService.getOrBuildSourceNotes({
      documentVersionId: section.analysis.documentVersionId,
      content: section.analysis.documentVersion.content,
      provider,
      model,
      temperature,
      sectionMaxTokens: maxTokens,
    });
    const baseDraft =
      input.currentDraft.trim() || section.editedContent?.trim() || section.aiContent?.trim() || "";
    const optimized = await this.sectionWriter.generateOptimizedDraft({
      sectionKey: input.sectionKey,
      currentDraft: baseDraft,
      instruction: input.instruction,
      notes: notes.notes,
      provider,
      model,
      temperature,
      maxTokens,
    });
    return optimized.trim() || baseDraft;
  }

  private async getSourceNotes(input: {
    analysisId: string;
    documentVersionId: string;
    content: string;
    provider: LLMProvider;
    model?: string;
    temperature?: number;
    sectionMaxTokens?: number;
  }): Promise<SourceNote[]> {
    const result = await this.sourceCacheService.getOrBuildSourceNotes({
      ...input,
      ensureNotCancelled: () => this.ensureNotCancelled(input.analysisId),
      onProgress: (update) => this.updateAnalysisProgress(input.analysisId, update),
    });
    return result.notes;
  }

  private async updateAnalysisProgress(
    analysisId: string,
    update: BookAnalysisProgressUpdate,
  ): Promise<void> {
    await prisma.bookAnalysis.update({
      where: { id: analysisId },
      data: {
        status: "running",
        progress: update.progress,
        heartbeatAt: new Date(),
        currentStage: update.stage,
        currentItemKey: update.itemKey ?? null,
        currentItemLabel: update.itemLabel ?? null,
      },
    });
  }

  private async withAnalysisHeartbeat<T>(analysisId: string, run: () => Promise<T>): Promise<T> {
    const timer = setInterval(() => {
      void this.touchAnalysisHeartbeat(analysisId).catch(() => {});
    }, BOOK_ANALYSIS_HEARTBEAT_INTERVAL_MS);
    timer.unref?.();

    try {
      return await run();
    } finally {
      clearInterval(timer);
    }
  }

  private async touchAnalysisHeartbeat(analysisId: string): Promise<void> {
    await prisma.bookAnalysis.updateMany({
      where: {
        id: analysisId,
        status: {
          in: ["queued", "running"],
        },
      },
      data: {
        status: "running",
        heartbeatAt: new Date(),
      },
    });
  }

  private async ensureNotCancelled(analysisId: string): Promise<void> {
    const row = await prisma.bookAnalysis.findUnique({
      where: { id: analysisId },
      select: {
        status: true,
        cancelRequestedAt: true,
      },
    });
    if (!row || row.status === "cancelled" || row.cancelRequestedAt) {
      throw new AnalysisCancelledError();
    }
  }

  private async markSucceeded(analysisId: string, summary?: string | null): Promise<void> {
    await prisma.bookAnalysis.update({
      where: { id: analysisId },
      data: {
        status: "succeeded",
        progress: 1,
        summary: summary ?? undefined,
        heartbeatAt: null,
        currentStage: null,
        currentItemKey: null,
        currentItemLabel: null,
        cancelRequestedAt: null,
      },
    });
  }

  private async markFailed(analysisId: string, lastError: string): Promise<void> {
    await prisma.bookAnalysis.update({
      where: { id: analysisId },
      data: {
        status: "failed",
        progress: 1,
        lastError,
        heartbeatAt: null,
        currentStage: null,
        currentItemKey: null,
        currentItemLabel: null,
        cancelRequestedAt: null,
      },
    });
  }

  private async markCancelled(analysisId: string, progress?: number): Promise<void> {
    await prisma.bookAnalysis.update({
      where: { id: analysisId },
      data: {
        status: "cancelled",
        progress: progress ?? undefined,
        lastError: null,
        heartbeatAt: null,
        currentStage: null,
        currentItemKey: null,
        currentItemLabel: null,
        cancelRequestedAt: null,
      },
    });
  }
}
