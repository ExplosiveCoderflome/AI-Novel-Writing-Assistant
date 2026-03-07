import type {
  BookAnalysis,
  BookAnalysisDetail,
  BookAnalysisPublishResult,
  BookAnalysisSectionKey,
  BookAnalysisStatus,
} from "@ai-novel/shared/types/bookAnalysis";
import { BOOK_ANALYSIS_SECTIONS } from "@ai-novel/shared/types/bookAnalysis";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { KnowledgeService } from "../knowledge/KnowledgeService";
import { buildAnalysisExportContent } from "./bookAnalysis.export";
import { BookAnalysisGenerationService } from "./bookAnalysis.generation";
import { publishAnalysisToNovel } from "./bookAnalysis.publish";
import { serializeAnalysisRow, serializeSectionRow } from "./bookAnalysis.serialization";
import type { AnalysisTask } from "./bookAnalysis.types";
import { buildAnalysisSummaryFromContent, isMissingTableError, normalizeMaxTokens, normalizeTemperature } from "./bookAnalysis.utils";
export class BookAnalysisService {
  private readonly taskQueue: AnalysisTask[] = [];
  private isProcessing = false;
  private readonly knowledgeService = new KnowledgeService();
  private readonly generationService = new BookAnalysisGenerationService();
  async resumePendingAnalyses(): Promise<void> {
    try {
      const rows = await prisma.bookAnalysis.findMany({
        where: {
          status: {
            in: ["queued", "running"],
          },
        },
        select: { id: true },
      });
      if (rows.length === 0) {
        return;
      }
      await prisma.bookAnalysis.updateMany({
        where: {
          id: { in: rows.map((item) => item.id) },
        },
        data: {
          status: "queued",
          lastError: null,
        },
      });
      for (const row of rows) {
        this.enqueueTask({ analysisId: row.id, kind: "full" });
      }
    } catch (error) {
      if (isMissingTableError(error)) {
        return;
      }
      throw error;
    }
  }
  async listAnalyses(filters: {
    keyword?: string;
    status?: BookAnalysisStatus;
    documentId?: string;
  } = {}): Promise<BookAnalysis[]> {
    const keyword = filters.keyword?.trim();
    const rows = await prisma.bookAnalysis.findMany({
      where: {
        ...(filters.status ? { status: filters.status } : { status: { not: "archived" } }),
        ...(filters.documentId ? { documentId: filters.documentId } : {}),
        ...(keyword
          ? {
            OR: [
              { title: { contains: keyword } },
              { document: { title: { contains: keyword } } },
              { document: { fileName: { contains: keyword } } },
            ],
          }
          : {}),
      },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            fileName: true,
            activeVersionId: true,
            activeVersionNumber: true,
          },
        },
        documentVersion: {
          select: {
            id: true,
            versionNumber: true,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
    return rows.map((row) => serializeAnalysisRow(row));
  }
  async getAnalysisById(analysisId: string): Promise<BookAnalysisDetail | null> {
    const row = await prisma.bookAnalysis.findUnique({
      where: { id: analysisId },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            fileName: true,
            activeVersionId: true,
            activeVersionNumber: true,
          },
        },
        documentVersion: {
          select: {
            id: true,
            versionNumber: true,
          },
        },
        sections: {
          orderBy: [{ sortOrder: "asc" }, { updatedAt: "asc" }],
        },
      },
    });
    if (!row) {
      return null;
    }
    return {
      ...serializeAnalysisRow(row),
      sections: row.sections.map((section) => serializeSectionRow(section)),
    };
  }
  async createAnalysis(input: {
    documentId: string;
    versionId?: string;
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
    maxTokens?: number;
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
          maxTokens,
          progress: 0,
          lastError: null,
        },
      });
      await tx.bookAnalysisSection.createMany({
        data: BOOK_ANALYSIS_SECTIONS.map((section, index) => ({
          analysisId: analysis.id,
          sectionKey: section.key,
          title: section.title,
          sortOrder: index,
          status: "idle",
        })),
      });
      return analysis.id;
    });
    this.enqueueTask({ analysisId, kind: "full" });
    const detail = await this.getAnalysisById(analysisId);
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
          title: `${source.title} - 鍓湰`,
          status: "draft",
          summary: source.summary,
          provider: source.provider,
          model: source.model,
          temperature: source.temperature,
          maxTokens: source.maxTokens,
          progress: 1,
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
    const detail = await this.getAnalysisById(newAnalysisId);
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
          progress: 0,
          lastError: null,
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
    const detail = await this.getAnalysisById(analysisId);
    if (!detail) {
      throw new AppError("Book analysis not found after rebuild.", 500);
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
          lastError: null,
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
    const detail = await this.getAnalysisById(analysisId);
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
    const finalEditedContent = normalizedForCompare && normalizedForCompare === normalizedAiContent
      ? null
      : normalizedEditedContent;
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
    const detail = await this.getAnalysisById(analysisId);
    if (!detail) {
      throw new AppError("Book analysis not found after section update.", 500);
    }
    return detail;
  }
  async updateAnalysisStatus(analysisId: string, status: Extract<BookAnalysisStatus, "archived">): Promise<BookAnalysisDetail> {
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
    const detail = await this.getAnalysisById(analysisId);
    if (!detail) {
      throw new AppError("Book analysis not found after status update.", 500);
    }
    return detail;
  }
  async publishToNovelKnowledge(analysisId: string, novelId: string): Promise<BookAnalysisPublishResult> {
    return publishAnalysisToNovel({
      analysisId,
      novelId,
      knowledgeService: this.knowledgeService,
      getAnalysisById: (id) => this.getAnalysisById(id),
    });
  }
  async buildExportContent(analysisId: string, format: "markdown" | "json"): Promise<{
    fileName: string;
    contentType: string;
    content: string;
  }> {
    const detail = await this.getAnalysisById(analysisId);
    if (!detail) {
      throw new AppError("Book analysis not found.", 404);
    }
    return buildAnalysisExportContent(detail, format);
  }
  private enqueueTask(task: AnalysisTask): void {
    this.taskQueue.push(task);
    void this.processQueue();
  }
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;
    try {
      while (this.taskQueue.length > 0) {
        const task = this.taskQueue.shift();
        if (!task) {
          continue;
        }
        if (task.kind === "full") {
          await this.generationService.runFullAnalysis(task.analysisId);
        } else {
          await this.generationService.runSingleSection(task.analysisId, task.sectionKey);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
}
export const bookAnalysisService = new BookAnalysisService();
