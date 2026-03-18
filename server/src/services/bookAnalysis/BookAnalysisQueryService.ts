import type {
  BookAnalysis,
  BookAnalysisDetail,
  BookAnalysisPublishResult,
  BookAnalysisStatus,
} from "@ai-novel/shared/types/bookAnalysis";
import { BOOK_ANALYSIS_SECTIONS } from "@ai-novel/shared/types/bookAnalysis";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { KnowledgeService } from "../knowledge/KnowledgeService";
import { buildAnalysisExportContent } from "./bookAnalysis.export";
import { publishAnalysisToNovel } from "./bookAnalysis.publish";
import { serializeAnalysisRow, serializeSectionRow } from "./bookAnalysis.serialization";

export class BookAnalysisQueryService {
  private readonly knowledgeService = new KnowledgeService();

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
    await this.ensureAnalysisSections(analysisId);
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

  async publishToNovelKnowledge(analysisId: string, novelId: string): Promise<BookAnalysisPublishResult> {
    return publishAnalysisToNovel({
      analysisId,
      novelId,
      knowledgeService: this.knowledgeService,
      getAnalysisById: (id) => this.getAnalysisById(id),
    });
  }

  async buildExportContent(
    analysisId: string,
    format: "markdown" | "json",
  ): Promise<{
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

  async ensureAnalysisSections(analysisId: string): Promise<void> {
    const analysis = await prisma.bookAnalysis.findUnique({
      where: { id: analysisId },
      select: {
        id: true,
        sections: {
          select: { sectionKey: true },
        },
      },
    });
    if (!analysis) {
      return;
    }
    const existingKeys = new Set(analysis.sections.map((item) => item.sectionKey));
    const missing = BOOK_ANALYSIS_SECTIONS.filter((section) => !existingKeys.has(section.key));
    if (missing.length === 0) {
      return;
    }
    try {
      await prisma.bookAnalysisSection.createMany({
        data: missing.map((section) => ({
          analysisId,
          sectionKey: section.key,
          title: section.title,
          sortOrder: BOOK_ANALYSIS_SECTIONS.findIndex((item) => item.key === section.key),
          status: "idle",
        })),
      });
    } catch {
      // Section may have been inserted concurrently.
    }
  }
}
