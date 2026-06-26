import type { BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { BookAnalysisBudgetExceededError, BookAnalysisBudgetGuard } from "./bookAnalysis.budget";
import { BookAnalysisSourceCacheService } from "./bookAnalysis.cache";
import { getBookAnalysisSectionConcurrency } from "./bookAnalysis.config";
import { runWithConcurrency } from "./bookAnalysis.concurrent";
import {
  formatSectionProgressLabel,
  getSectionStageProgress,
} from "./bookAnalysis.progress";
import { BookAnalysisSectionWriter } from "./bookAnalysis.sectionWriter";
import {
  bindEvidenceToDocumentChapters,
  DocumentChapterService,
} from "../knowledge/DocumentChapterService";
import type {
  BookAnalysisOverviewContext,
  SourceNote,
} from "./bookAnalysis.types";
import {
  buildAnalysisSummaryFromContent,
  encodeEvidence,
  encodeNormalizationWarnings,
  encodeStructuredData,
  getEffectiveContent,
  normalizeMaxTokens,
  normalizeTemperature,
} from "./bookAnalysis.utils";
import {
  AnalysisCancelledError,
  ensureNotCancelled,
  markCancelled,
  markFailed,
  markSucceeded,
  updateAnalysisProgress,
  withAnalysisHeartbeat,
} from "./generation/lifecycle";
import { buildBookAnalysisSourceScope } from "./generation/sourceScope";
import {
  buildOverviewContext,
  buildOverviewContextFromSection,
} from "./generation/overviewContext";
import { getDocumentChaptersSafely } from "./generation/documentChapters";
import { optimizeSectionPreview as runOptimizeSectionPreview } from "./generation/optimizeSectionPreview";

const OVERVIEW_SECTION_PROGRESS_SHARE = 0.25;

function getOverviewProgressEnd(totalSections: number): number {
  const sectionStart = getSectionStageProgress(0, totalSections);
  return Number((sectionStart + (1 - sectionStart) * OVERVIEW_SECTION_PROGRESS_SHARE).toFixed(4));
}

function getRemainingSectionProgress(completed: number, total: number, startProgress: number): number {
  if (total <= 0) {
    return startProgress;
  }
  return Number((startProgress + (1 - startProgress) * (completed / total)).toFixed(4));
}


export class BookAnalysisGenerationService {
  constructor(
    private readonly sourceCacheService = new BookAnalysisSourceCacheService(),
    private readonly sectionWriter = new BookAnalysisSectionWriter(),
    private readonly documentChapterService = new DocumentChapterService(),
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
      await markCancelled(analysisId, analysis.progress);
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
      await markSucceeded(analysisId, analysis.summary);
      return;
    }

    const provider = (analysis.provider as LLMProvider | null) ?? "deepseek";
    const model = analysis.model ?? undefined;
    const temperature = normalizeTemperature(analysis.temperature);
    const maxTokens = normalizeMaxTokens(analysis.maxTokens);
    const sourceScope = buildBookAnalysisSourceScope(analysis);
    const budgetGuard = new BookAnalysisBudgetGuard(analysisId);

    await withAnalysisHeartbeat(analysisId, async () => {
      try {
        const notes = await this.getSourceNotes({
          analysisId,
          documentVersionId: analysis.documentVersionId,
          content: sourceScope.content,
          provider,
          model,
          temperature,
          sectionMaxTokens: maxTokens,
          sourceScopeKey: sourceScope.sourceScopeKey,
        });
        const documentChapters = await getDocumentChaptersSafely(
          this.documentChapterService,
          analysis.documentVersionId,
          analysis.documentVersion.content,
        );

        let completedSections = 0;
        const errors: string[] = [];
        let summary = analysis.summary;

        const overviewSection = activeSections.find((section) => section.sectionKey === "overview");
        const remainingSections = overviewSection
          ? activeSections.filter((section) => section.sectionKey !== "overview")
          : activeSections;
        const overviewProgressEnd = overviewSection
          ? getOverviewProgressEnd(activeSections.length)
          : getSectionStageProgress(0, activeSections.length);
        let overviewContext: BookAnalysisOverviewContext | null = null;

        if (overviewSection) {
          await ensureNotCancelled(analysisId);
          await updateAnalysisProgress(analysisId, {
            stage: "generating_overview",
            progress: getSectionStageProgress(0, activeSections.length),
            itemKey: overviewSection.sectionKey,
            itemLabel: formatSectionProgressLabel(1, activeSections.length, overviewSection.title),
          });

          await prisma.bookAnalysisSection.update({
            where: {
              analysisId_sectionKey: {
                analysisId,
                sectionKey: overviewSection.sectionKey,
              },
            },
            data: {
              status: "running",
            },
          });

          try {
            const generated = await this.sectionWriter.generateSection(
              "overview",
              notes,
              provider,
              model,
              temperature,
              maxTokens,
              {
                userFocusInstruction: analysis.userFocusInstruction,
                sectionFocusInstruction: overviewSection.focusInstruction,
              },
            );
            const evidence = bindEvidenceToDocumentChapters(
              generated.evidence,
              documentChapters,
              analysis.documentVersion.content,
            );
            overviewContext = buildOverviewContext(generated);

            await prisma.bookAnalysisSection.update({
              where: {
                analysisId_sectionKey: {
                  analysisId,
                  sectionKey: overviewSection.sectionKey,
                },
              },
              data: {
                status: "succeeded",
                aiContent: generated.markdown,
                structuredDataJson: encodeStructuredData(generated.structuredData),
                normalizationWarningsJson: encodeNormalizationWarnings(generated.normalizationWarnings),
                evidenceJson: encodeEvidence(evidence),
              },
            });

            summary = buildAnalysisSummaryFromContent(generated.markdown);
            await budgetGuard.onSectionFinished(generated.tokenUsage);
          } catch (error) {
            if (error instanceof AnalysisCancelledError || error instanceof BookAnalysisBudgetExceededError) {
              throw error;
            }
            overviewContext = null;
            errors.push(`${overviewSection.title}: ${error instanceof Error ? error.message : "Unknown error"}`);
            await prisma.bookAnalysisSection.update({
              where: {
                analysisId_sectionKey: {
                  analysisId,
                  sectionKey: overviewSection.sectionKey,
                },
              },
              data: {
                status: "failed",
              },
            });
          } finally {
            completedSections += 1;
            await updateAnalysisProgress(analysisId, {
              stage: "generating_overview",
              progress: overviewProgressEnd,
              itemKey: overviewSection.sectionKey,
              itemLabel: formatSectionProgressLabel(1, activeSections.length, overviewSection.title),
            });
          }

          await ensureNotCancelled(analysisId);
        }

        let completedRemainingSections = 0;
        await runWithConcurrency(remainingSections, getBookAnalysisSectionConcurrency(), async (section) => {
          const sectionIndex = activeSections.findIndex((item) => item.sectionKey === section.sectionKey);
          const displayIndex = sectionIndex >= 0 ? sectionIndex + 1 : completedSections + 1;
          await ensureNotCancelled(analysisId);
          await updateAnalysisProgress(analysisId, {
            stage: "generating_sections",
            progress: overviewSection
              ? getRemainingSectionProgress(completedRemainingSections, remainingSections.length, overviewProgressEnd)
              : getSectionStageProgress(completedSections, activeSections.length),
            itemKey: section.sectionKey,
            itemLabel: formatSectionProgressLabel(displayIndex, activeSections.length, section.title),
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
              {
                overviewContext,
                userFocusInstruction: analysis.userFocusInstruction,
                sectionFocusInstruction: section.focusInstruction,
              },
            );
            const evidence = bindEvidenceToDocumentChapters(
              generated.evidence,
              documentChapters,
              analysis.documentVersion.content,
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
                normalizationWarningsJson: encodeNormalizationWarnings(generated.normalizationWarnings),
                evidenceJson: encodeEvidence(evidence),
              },
            });
            await budgetGuard.onSectionFinished(generated.tokenUsage);

          } catch (error) {
            if (error instanceof AnalysisCancelledError || error instanceof BookAnalysisBudgetExceededError) {
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
            completedRemainingSections += 1;
            await updateAnalysisProgress(analysisId, {
              stage: "generating_sections",
              progress: overviewSection
                ? getRemainingSectionProgress(completedRemainingSections, remainingSections.length, overviewProgressEnd)
                : getSectionStageProgress(completedSections, activeSections.length),
              itemKey: section.sectionKey,
              itemLabel: formatSectionProgressLabel(displayIndex, activeSections.length, section.title),
            });
          }
        });

        await ensureNotCancelled(analysisId);
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
          await markCancelled(analysisId);
          return;
        }
        await markFailed(analysisId, error instanceof Error ? error.message : "Book analysis failed.");
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
      await markCancelled(analysisId, analysis.progress);
      return;
    }

    const provider = (analysis.provider as LLMProvider | null) ?? "deepseek";
    const model = analysis.model ?? undefined;
    const temperature = normalizeTemperature(analysis.temperature);
    const maxTokens = normalizeMaxTokens(analysis.maxTokens);
    const sourceScope = buildBookAnalysisSourceScope(analysis);
    const budgetGuard = new BookAnalysisBudgetGuard(analysisId);

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

    await withAnalysisHeartbeat(analysisId, async () => {
      try {
        const notes = await this.getSourceNotes({
          analysisId,
          documentVersionId: analysis.documentVersionId,
          content: sourceScope.content,
          provider,
          model,
          temperature,
          sectionMaxTokens: maxTokens,
          sourceScopeKey: sourceScope.sourceScopeKey,
        });
        const documentChapters = await getDocumentChaptersSafely(
          this.documentChapterService,
          analysis.documentVersionId,
          analysis.documentVersion.content,
        );

        await ensureNotCancelled(analysisId);
        await updateAnalysisProgress(analysisId, {
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

        const overviewContext = sectionKey === "overview"
          ? null
          : buildOverviewContextFromSection(analysis.sections.find((item) => item.sectionKey === "overview"));

        const generated = await this.sectionWriter.generateSection(
          sectionKey,
          notes,
          provider,
          model,
          temperature,
          maxTokens,
          {
            overviewContext,
            userFocusInstruction: analysis.userFocusInstruction,
            sectionFocusInstruction: section.focusInstruction,
          },
        );
        const evidence = bindEvidenceToDocumentChapters(
          generated.evidence,
          documentChapters,
          analysis.documentVersion.content,
        );

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
            normalizationWarningsJson: encodeNormalizationWarnings(generated.normalizationWarnings),
            evidenceJson: encodeEvidence(evidence),
          },
        });
        await budgetGuard.onSectionFinished(generated.tokenUsage);

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
          await markCancelled(analysisId);
          return;
        }
        if (error instanceof BookAnalysisBudgetExceededError) {
          await markFailed(analysisId, error.message);
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
        await markFailed(analysisId, error instanceof Error ? error.message : "Section regeneration failed.");
      }
    });
  }

  async optimizeSectionPreview(input: {
    analysisId: string;
    sectionKey: BookAnalysisSectionKey;
    currentDraft: string;
    instruction: string;
  }): Promise<string> {
    return runOptimizeSectionPreview({
      sourceCacheService: this.sourceCacheService,
      sectionWriter: this.sectionWriter,
    }, input);
  }

  private async getSourceNotes(input: {
    analysisId: string;
    documentVersionId: string;
    content: string;
    provider: LLMProvider;
    model?: string;
    temperature?: number;
    sectionMaxTokens?: number;
    sourceScopeKey?: string;
  }): Promise<SourceNote[]> {
    const result = await this.sourceCacheService.getOrBuildSourceNotes({
      ...input,
      ensureNotCancelled: () => ensureNotCancelled(input.analysisId),
      onProgress: (update) => updateAnalysisProgress(input.analysisId, update),
    });
    return result.notes;
  }
}
