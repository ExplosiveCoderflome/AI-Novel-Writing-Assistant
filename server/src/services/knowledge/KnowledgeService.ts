import type {
  KnowledgeBindingTargetType,
  KnowledgeDocumentStatus,
  KnowledgeRecallTestResult,
} from "@ai-novel/shared/types/knowledge";
import { prisma } from "../../db/prisma";
import { ragServices } from "../rag";
import {
  buildKnowledgeContentHash,
  normalizeKnowledgeContent,
  normalizeKnowledgeDocumentTitle,
} from "./common";

export class KnowledgeService {
  private queueKnowledgeRebuild(documentId: string): void {
    void ragServices.ragIndexService.enqueueOwnerJob("rebuild", "knowledge_document", documentId).catch(() => {
      // Keep knowledge document CRUD resilient even if reindex queueing fails.
    });
  }

  private queueKnowledgeDelete(documentId: string): void {
    void ragServices.ragIndexService.enqueueOwnerJob("delete", "knowledge_document", documentId).catch(() => {
      // Keep knowledge document CRUD resilient even if delete queueing fails.
    });
  }

  private async assertTargetExists(targetType: KnowledgeBindingTargetType, targetId: string): Promise<void> {
    if (targetType === "novel") {
      const exists = await prisma.novel.count({ where: { id: targetId } });
      if (!exists) {
        throw new Error("Novel not found.");
      }
      return;
    }
    const exists = await prisma.world.count({ where: { id: targetId } });
    if (!exists) {
      throw new Error("World not found.");
    }
  }

  async listDocuments(filters: {
    keyword?: string;
    status?: KnowledgeDocumentStatus;
  } = {}) {
    const keyword = filters.keyword?.trim();
    const rows = await prisma.knowledgeDocument.findMany({
      where: {
        ...(filters.status ? { status: filters.status } : { status: { not: "archived" } }),
        ...(keyword
          ? {
            OR: [
              { title: { contains: keyword } },
              { fileName: { contains: keyword } },
            ],
          }
          : {}),
      },
      include: {
        _count: {
          select: {
            versions: true,
            bookAnalyses: true,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
    return rows.map((item) => ({
      id: item.id,
      title: item.title,
      fileName: item.fileName,
      status: item.status,
      activeVersionId: item.activeVersionId,
      activeVersionNumber: item.activeVersionNumber,
      latestIndexStatus: item.latestIndexStatus,
      lastIndexedAt: item.lastIndexedAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      versionCount: item._count.versions,
      bookAnalysisCount: item._count.bookAnalyses,
    }));
  }

  async getDocumentById(documentId: string) {
    const document = await prisma.knowledgeDocument.findUnique({
      where: { id: documentId },
      include: {
      versions: {
          orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
        },
        _count: {
          select: {
            bookAnalyses: true,
          },
        },
      },
    });
    if (!document) {
      return null;
    }
    return {
      id: document.id,
      title: document.title,
      fileName: document.fileName,
      status: document.status,
      activeVersionId: document.activeVersionId,
      activeVersionNumber: document.activeVersionNumber,
      latestIndexStatus: document.latestIndexStatus,
      lastIndexedAt: document.lastIndexedAt,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      bookAnalysisCount: document._count.bookAnalyses,
      versions: document.versions.map((version) => ({
        id: version.id,
        documentId: version.documentId,
        versionNumber: version.versionNumber,
        content: version.content,
        contentHash: version.contentHash,
        charCount: version.charCount,
        createdAt: version.createdAt,
        isActive: version.id === document.activeVersionId,
      })),
    };
  }

  async createDocument(input: {
    title?: string;
    fileName: string;
    content: string;
  }) {
    const normalizedContent = normalizeKnowledgeContent(input.content);
    const title = normalizeKnowledgeDocumentTitle(input.title, input.fileName);
    const contentHash = buildKnowledgeContentHash(normalizedContent);

    const document = await prisma.$transaction(async (tx) => {
      const existing = await tx.knowledgeDocument.findFirst({
        where: {
          title,
          status: { not: "archived" },
        },
        orderBy: { updatedAt: "desc" },
      });

      if (existing) {
        const nextVersionNumber = existing.activeVersionNumber + 1;
        const version = await tx.knowledgeDocumentVersion.create({
          data: {
            documentId: existing.id,
            versionNumber: nextVersionNumber,
            content: normalizedContent,
            contentHash,
            charCount: normalizedContent.length,
          },
        });
        return tx.knowledgeDocument.update({
          where: { id: existing.id },
          data: {
            fileName: input.fileName.trim(),
            activeVersionId: version.id,
            activeVersionNumber: nextVersionNumber,
            latestIndexStatus: "queued",
          },
          include: {
            versions: {
              orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
            },
          },
        });
      }

      const created = await tx.knowledgeDocument.create({
        data: {
          title,
          fileName: input.fileName.trim(),
          status: "enabled",
          latestIndexStatus: "queued",
        },
      });
      const version = await tx.knowledgeDocumentVersion.create({
        data: {
          documentId: created.id,
          versionNumber: 1,
          content: normalizedContent,
          contentHash,
          charCount: normalizedContent.length,
        },
      });
      return tx.knowledgeDocument.update({
        where: { id: created.id },
        data: {
          activeVersionId: version.id,
          activeVersionNumber: 1,
        },
        include: {
          versions: {
            orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
          },
        },
      });
    });

    this.queueKnowledgeRebuild(document.id);
    const detail = await this.getDocumentById(document.id);
    if (!detail) {
      throw new Error("Knowledge document not found after creation.");
    }
    return detail;
  }

  async createDocumentVersion(documentId: string, input: {
    fileName?: string;
    content: string;
  }) {
    const normalizedContent = normalizeKnowledgeContent(input.content);
    const contentHash = buildKnowledgeContentHash(normalizedContent);

    const document = await prisma.$transaction(async (tx) => {
      const existing = await tx.knowledgeDocument.findUnique({
        where: { id: documentId },
      });
      if (!existing) {
        throw new Error("Knowledge document not found.");
      }
      if (existing.status === "archived") {
        throw new Error("Archived knowledge documents cannot accept new versions.");
      }
      const nextVersionNumber = existing.activeVersionNumber + 1;
      const version = await tx.knowledgeDocumentVersion.create({
        data: {
          documentId,
          versionNumber: nextVersionNumber,
          content: normalizedContent,
          contentHash,
          charCount: normalizedContent.length,
        },
      });
      return tx.knowledgeDocument.update({
        where: { id: documentId },
        data: {
          fileName: input.fileName?.trim() || existing.fileName,
          activeVersionId: version.id,
          activeVersionNumber: nextVersionNumber,
          latestIndexStatus: "queued",
        },
        include: {
          versions: {
            orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
          },
        },
      });
    });

    this.queueKnowledgeRebuild(document.id);
    const detail = await this.getDocumentById(document.id);
    if (!detail) {
      throw new Error("Knowledge document not found after version creation.");
    }
    return detail;
  }

  async activateVersion(documentId: string, versionId: string) {
    const document = await prisma.$transaction(async (tx) => {
      const version = await tx.knowledgeDocumentVersion.findFirst({
        where: {
          id: versionId,
          documentId,
        },
      });
      if (!version) {
        throw new Error("Knowledge document version not found.");
      }
      return tx.knowledgeDocument.update({
        where: { id: documentId },
        data: {
          activeVersionId: version.id,
          activeVersionNumber: version.versionNumber,
          latestIndexStatus: "queued",
        },
        include: {
          versions: {
            orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
          },
        },
      });
    });

    this.queueKnowledgeRebuild(document.id);
    const detail = await this.getDocumentById(document.id);
    if (!detail) {
      throw new Error("Knowledge document not found after version activation.");
    }
    return detail;
  }

  async reindexDocument(documentId: string) {
    const document = await prisma.knowledgeDocument.findUnique({
      where: { id: documentId },
    });
    if (!document) {
      throw new Error("Knowledge document not found.");
    }
    if (!document.activeVersionId) {
      throw new Error("Knowledge document has no active version.");
    }
    const updated = await prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: {
        latestIndexStatus: "queued",
      },
    });
    this.queueKnowledgeRebuild(documentId);
    return updated;
  }

  async updateDocumentStatus(documentId: string, status: KnowledgeDocumentStatus) {
    const document = await prisma.knowledgeDocument.findUnique({
      where: { id: documentId },
    });
    if (!document) {
      throw new Error("Knowledge document not found.");
    }
    const updated = await prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: {
        status,
        ...(status === "archived" ? { latestIndexStatus: "idle" } : {}),
      },
    });
    if (status === "archived") {
      this.queueKnowledgeDelete(documentId);
    }
    return updated;
  }

  async testDocumentRecall(documentId: string, query: string, limit = 6): Promise<KnowledgeRecallTestResult> {
    const document = await prisma.knowledgeDocument.findUnique({
      where: { id: documentId },
    });
    if (!document) {
      throw new Error("Knowledge document not found.");
    }
    if (document.status === "archived") {
      throw new Error("Archived knowledge documents cannot be recall tested.");
    }
    if (document.latestIndexStatus !== "succeeded") {
      throw new Error("Knowledge document recall test is only available after indexing succeeds.");
    }

    const hits = await ragServices.hybridRetrievalService.retrieve(query, {
      ownerTypes: ["knowledge_document"],
      knowledgeDocumentIds: [documentId],
      finalTopK: limit,
      vectorCandidates: Math.max(limit * 2, 10),
      keywordCandidates: Math.max(limit * 2, 10),
    });

    return {
      documentId,
      query,
      hits: hits.map((item) => ({
        id: item.id,
        ownerId: item.ownerId,
        score: item.score,
        source: item.source,
        title: item.title,
        chunkText: item.chunkText,
        chunkOrder: item.chunkOrder,
      })),
    };
  }

  async listBindings(targetType: KnowledgeBindingTargetType, targetId: string) {
    await this.assertTargetExists(targetType, targetId);
    const bindings = await prisma.knowledgeBinding.findMany({
      where: {
        targetType,
        targetId,
      },
      include: {
        document: {
          include: {
            _count: {
              select: { versions: true },
            },
          },
        },
      },
      orderBy: [{ createdAt: "asc" }],
    });
    return bindings.map((item) => ({
      ...item.document,
      versionCount: item.document._count.versions,
    }));
  }

  async replaceBindings(
    targetType: KnowledgeBindingTargetType,
    targetId: string,
    documentIds: string[],
  ) {
    await this.assertTargetExists(targetType, targetId);
    const uniqueDocumentIds = Array.from(new Set(documentIds.map((item) => item.trim()).filter(Boolean)));
    if (uniqueDocumentIds.length > 0) {
      const documents = await prisma.knowledgeDocument.findMany({
        where: {
          id: { in: uniqueDocumentIds },
          status: { not: "archived" },
        },
        select: { id: true },
      });
      if (documents.length !== uniqueDocumentIds.length) {
        throw new Error("Some knowledge documents are missing or archived.");
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.knowledgeBinding.deleteMany({
        where: {
          targetType,
          targetId,
        },
      });
      if (uniqueDocumentIds.length > 0) {
        await tx.knowledgeBinding.createMany({
          data: uniqueDocumentIds.map((documentId) => ({
            targetType,
            targetId,
            documentId,
          })),
        });
      }
    });

    return this.listBindings(targetType, targetId);
  }
}
