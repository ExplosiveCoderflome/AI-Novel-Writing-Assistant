import type {
  BookAnalysisDetail,
  BookAnalysisSectionKey,
  BookAnalysisStatus,
} from "@ai-novel/shared/types/bookAnalysis";
import { BOOK_ANALYSIS_SECTIONS } from "@ai-novel/shared/types/bookAnalysis";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { getBookAnalysisMaxConcurrentTasks } from "./bookAnalysis.config";
import { BookAnalysisGenerationService } from "./bookAnalysis.generation";
import { BookAnalysisTaskQueue } from "./bookAnalysis.queue";
import { buildAnalysisSummaryFromContent, normalizeMaxTokens, normalizeTemperature } from "./bookAnalysis.utils";
import { BookAnalysisWatchdogService } from "./BookAnalysisWatchdogService";
import { BookAnalysisQueryService } from "./BookAnalysisQueryService";

export class BookAnalysisCommandService {
  private readonly generationService = new BookAnalysisGenerationService();
  private readonly taskQueue = new BookAnalysisTaskQueue({
    getMaxConcurrentTasks: getBookAnalysisMaxConcurrentTasks,
    onRunTask: async (task) => {
      await this.queryService.ensureAnalysisSections(task.analysisId);
      if (task.kind === "full") {
        await this.generationService.runFullAnalysis(task.analysisId);
        return;
      }
      await this.generationService.runSingleSection(task.analysisId, task.sectionKey);
    },
  });
  private readonly watchdogService = new BookAnalysisWatchdogService((analysisId) => {
    this.enqueueTask({ analysisId, kind: "full" });
  });

  constructor(private readonly queryService: BookAnalysisQueryService) {}

  startWatchdog(): void {
    this.watchdogService.startWatchdog();
  }

  async markPendingAnalysesForManualRecovery(): Promise<void> {
    await this.watchdogService.markPendingAnalysesForManualRecovery();
  }

  async recoverTimedOutAnalyses(): Promise<void> {
    await this.watchdogService.recoverTimedOutAnalyses();
  }

  async resumePendingAnalysis(analysisId: string): Promise<BookAnalysisDetail> {
    const analysis = await prisma.bookAnalysis.findUnique({
      where: { id: analysisId },
      select: {
        status: true,
      },
    });
    if (!analysis) {
      throw new AppError("Book analysis not found.", 404);
    }
    if (analysis.status !== "queued" && analysis.status !== "running") {
      throw new AppError("Only queued or running analyses can be resumed.", 400);
    }

    await prisma.bookAnalysis.update({
      where: { id: analysisId },
      data: {
        status: "queued",
        pendingManualRecovery: false,
        heartbeatAt: null,
        cancelRequestedAt: null,
      },
    });
    this.enqueueTask({ analysisId, kind: "full" });

    const detail = await this.queryService.getAnalysisById(analysisId);
    if (!detail) {
      throw new AppError("Book analysis not found after resume.", 500);
    }
    return detail;
  }

  async createAnalysis(input: {
    documentId: string;
    versionId?: string;
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    includeTimeline?: boolean;
  }): Promise<BookAnalysisDetail> {
    const temperature = normalizeTemperature(input.temperature);
    const maxTokens = normalizeMaxTokens(input.maxTokens);
    const analysisId = await prisma.$transaction(async (tx) => {
      const document = await tx.knowledgeDocument.findUnique({
        where: { id: input.documentId },
        include: {
          versions: {
            select: {
              id: true,
              versionNumber: true,
            },
            orderBy: [{ versionNumber: "desc" }],
          },
        },
      });
      if (!document) {
        throw new AppError("Knowledge document not found.", 404);
      }
      if (document.status === "archived") {
        throw new AppError("Archived knowledge documents cannot be analyzed.", 400);
      }
      const version = input.versionId
        ? document.versions.find((item) => item.id === input.versionId)
        : document.versions.find((item) => item.id === document.activeVersionId) ?? document.versions[0];
      if (!version) {
        throw new AppError("Knowledge document version not found.", 400);
      }
      const analysis = await tx.bookAnalysis.create({
        data: {
          documentId: document.id,
          documentVersionId: version.id,
          title: `${document.title} v${version.versionNumber}`,
          status: "queued",
          provider: input.provider ?? "deepseek",
          model: input.model?.trim() || null,
          temperature,
          maxTokens: maxTokens ?? null,
          progress: 0,
          lastError: null,
          attemptCount: 0,
          maxAttempts: 1,
        },
      });
      await tx.bookAnalysisSection.createMany({
        data: BOOK_ANALYSIS_SECTIONS.map((section, index) => ({
          analysisId: analysis.id,
          sectionKey: section.key,
          title: section.title,
          sortOrder: index,
          status: "idle",
          frozen: section.key === "timeline" ? !input.includeTimeline : false,
        })),
      });
      return analysis.id;
    });
    this.enqueueTask({ analysisId, kind: "full" });
    const detail = await this.queryService.getAnalysisById(analysisId);
    if (!detail) {
      throw new AppError("Book analysis not found after creation.", 500);
    }
    return detail;
  }

  async copyAnalysis(analysisId: string): Promise<BookAnalysisDetail> {
    const source = await prisma.bookAnalysis.findUnique({
      where: { id: analysisId },
      include: {
        sections: {
          orderBy: [{ sortOrder: "asc" }],
        },
      },
    });
    if (!source) {
      throw new AppError("Book analysis not found.", 404);
    }
    if (source.status === "archived") {
      throw new AppError("Archived book analysis cannot be copied.", 400);
    }
    const newAnalysisId = await prisma.$transaction(async (tx) => {
      const copied = await tx.bookAnalysis.create({
        data: {
          documentId: source.documentId,
          documentVersionId: source.documentVersionId,
          title: `${source.title} - copy`,
          status: "draft",
          summary: source.summary,
          provider: source.provider,
          model: source.model,
          temperature: source.temperature,
          maxTokens: source.maxTokens,
          progress: 1,
          heartbeatAt: null,
          currentStage: null,
          currentItemKey: null,
          currentItemLabel: null,
          cancelRequestedAt: null,
          attemptCount: 0,
          maxAttempts: source.maxAttempts,
          lastError: null,
          lastRunAt: source.lastRunAt,
        },
      });
      await tx.bookAnalysisSection.createMany({
        data: source.sections.map((section) => ({
          analysisId: copied.id,
          sectionKey: section.sectionKey,
          title: section.title,
          status: section.status,
          aiContent: section.aiContent,
          editedContent: section.editedContent,
          notes: section.notes,
          structuredDataJson: section.structuredDataJson,
          evidenceJson: section.evidenceJson,
          frozen: section.frozen,
          sortOrder: section.sortOrder,
        })),
      });
      return copied.id;
    });
    const detail = await this.queryService.getAnalysisById(newAnalysisId);
    if (!detail) {
      throw new AppError("Book analysis not found after copy.", 500);
    }
    return detail;
  }

  async rebuildAnalysis(analysisId: string): Promise<BookAnalysisDetail> {
    const analysis = await prisma.bookAnalysis.findUnique({
      where: { id: analysisId },
      include: {
        sections: true,
      },
    });
    if (!analysis) {
      throw new AppError("Book analysis not found.", 404);
    }
    if (analysis.status === "archived") {
      throw new AppError("Archived book analysis cannot be rebuilt.", 400);
    }
    await prisma.$transaction(async (tx) => {
      await tx.bookAnalysis.update({
        where: { id: analysisId },
        data: {
          status: "queued",
          pendingManualRecovery: false,
          progress: 0,
          lastError: null,
          heartbeatAt: null,
          currentStage: null,
          currentItemKey: null,
          currentItemLabel: null,
          cancelRequestedAt: null,
          attemptCount: 0,
        },
      });
      await tx.bookAnalysisSection.updateMany({
        where: {
          analysisId,
          frozen: false,
        },
        data: {
          status: "idle",
        },
      });
    });
    this.enqueueTask({ analysisId, kind: "full" });
    const detail = await this.queryService.getAnalysisById(analysisId);
    if (!detail) {
      throw new AppError("Book analysis not found after rebuild.", 500);
    }
    return detail;
  }

  async retryAnalysis(analysisId: string): Promise<BookAnalysisDetail> {
    const analysis = await prisma.bookAnalysis.findUnique({
      where: { id: analysisId },
      select: { status: true },
    });
    if (!analysis) {
      throw new AppError("Book analysis not found.", 404);
    }
    if (analysis.status !== "failed" && analysis.status !== "cancelled") {
      throw new AppError("Only failed or cancelled analyses can be retried.", 400);
    }
    return this.rebuildAnalysis(analysisId);
  }

  async cancelAnalysis(analysisId: string): Promise<BookAnalysisDetail> {
    const analysis = await prisma.bookAnalysis.findUnique({
      where: { id: analysisId },
      select: {
        id: true,
        status: true,
      },
    });
    if (!analysis) {
      throw new AppError("Book analysis not found.", 404);
    }
    if (analysis.status === "archived") {
      throw new AppError("Archived book analysis cannot be cancelled.", 400);
    }
    if (analysis.status === "succeeded" || analysis.status === "failed" || analysis.status === "cancelled") {
      throw new AppError("Only queued or running analyses can be cancelled.", 400);
    }

    if (analysis.status === "queued") {
      this.taskQueue.removeAnalysisTasks(analysisId);
      await prisma.bookAnalysis.update({
        where: { id: analysisId },
        data: {
          status: "cancelled",
          lastError: null,
          heartbeatAt: null,
          currentStage: null,
          currentItemKey: null,
          currentItemLabel: null,
          cancelRequestedAt: null,
        },
      });
    } else {
      await prisma.bookAnalysis.update({
        where: { id: analysisId },
        data: {
          cancelRequestedAt: new Date(),
          heartbeatAt: new Date(),
        },
      });
    }

    const detail = await this.queryService.getAnalysisById(analysisId);
    if (!detail) {
      throw new AppError("Book analysis not found after cancel.", 500);
    }
    return detail;
  }

  async regenerateSection(analysisId: string, sectionKey: BookAnalysisSectionKey): Promise<BookAnalysisDetail> {
    const section = await prisma.bookAnalysisSection.findFirst({
      where: {
        analysisId,
        sectionKey,
      },
      include: {
        analysis: true,
      },
    });
    if (!section) {
      throw new AppError("Book analysis section not found.", 404);
    }
    if (section.analysis.status === "archived") {
      throw new AppError("Archived book analysis cannot be regenerated.", 400);
    }
    if (section.frozen) {
      throw new AppError("Frozen sections cannot be regenerated until unfrozen.", 400);
    }
    await prisma.$transaction(async (tx) => {
      await tx.bookAnalysis.update({
        where: { id: analysisId },
        data: {
          status: "queued",
          pendingManualRecovery: false,
          lastError: null,
          heartbeatAt: null,
          currentStage: null,
          currentItemKey: null,
          currentItemLabel: null,
          cancelRequestedAt: null,
        },
      });
      await tx.bookAnalysisSection.update({
        where: {
          analysisId_sectionKey: {
            analysisId,
            sectionKey,
          },
        },
        data: {
          status: "idle",
        },
      });
    });
    this.enqueueTask({ analysisId, kind: "section", sectionKey });
    const detail = await this.queryService.getAnalysisById(analysisId);
    if (!detail) {
      throw new AppError("Book analysis not found after section regeneration.", 500);
    }
    return detail;
  }

  async optimizeSectionPreview(
    analysisId: string,
    sectionKey: BookAnalysisSectionKey,
    input: { currentDraft: string; instruction: string },
  ): Promise<{ optimizedDraft: string }> {
    const optimizedDraft = await this.generationService.optimizeSectionPreview({
      analysisId,
      sectionKey,
      currentDraft: input.currentDraft,
      instruction: input.instruction,
    });
    return { optimizedDraft };
  }

  async updateSection(
    analysisId: string,
    sectionKey: BookAnalysisSectionKey,
    input: {
      editedContent?: string | null;
      notes?: string | null;
      frozen?: boolean;
    },
  ): Promise<BookAnalysisDetail> {
    const section = await prisma.bookAnalysisSection.findFirst({
      where: {
        analysisId,
        sectionKey,
      },
    });
    if (!section) {
      throw new AppError("Book analysis section not found.", 404);
    }
    const normalizedEditedContent = input.editedContent?.trim() || null;
    const normalizedAiContent = section.aiContent?.replace(/\r\n?/g, "\n").trim() || null;
    const normalizedForCompare = normalizedEditedContent?.replace(/\r\n?/g, "\n").trim() || null;
    const finalEditedContent =
      normalizedForCompare && normalizedForCompare === normalizedAiContent ? null : normalizedEditedContent;
    await prisma.bookAnalysisSection.update({
      where: {
        analysisId_sectionKey: {
          analysisId,
          sectionKey,
        },
      },
      data: {
        ...(input.editedContent !== undefined ? { editedContent: finalEditedContent } : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
        ...(input.frozen !== undefined ? { frozen: input.frozen } : {}),
      },
    });
    if (sectionKey === "overview" && input.editedContent !== undefined) {
      await prisma.bookAnalysis.update({
        where: { id: analysisId },
        data: {
          summary: buildAnalysisSummaryFromContent(finalEditedContent ?? section.aiContent ?? ""),
        },
      });
    }
    const detail = await this.queryService.getAnalysisById(analysisId);
    if (!detail) {
      throw new AppError("Book analysis not found after section update.", 500);
    }
    return detail;
  }

  async updateAnalysisStatus(
    analysisId: string,
    status: Extract<BookAnalysisStatus, "archived">,
  ): Promise<BookAnalysisDetail> {
    const analysis = await prisma.bookAnalysis.findUnique({
      where: { id: analysisId },
    });
    if (!analysis) {
      throw new AppError("Book analysis not found.", 404);
    }
    await prisma.bookAnalysis.update({
      where: { id: analysisId },
      data: { status },
    });
    const detail = await this.queryService.getAnalysisById(analysisId);
    if (!detail) {
      throw new AppError("Book analysis not found after status update.", 500);
    }
    return detail;
  }

  private enqueueTask(task: { analysisId: string; kind: "full" } | { analysisId: string; kind: "section"; sectionKey: BookAnalysisSectionKey }): void {
    this.taskQueue.enqueue(task);
  }
}
