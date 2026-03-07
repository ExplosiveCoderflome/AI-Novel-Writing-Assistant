import type { BookAnalysisDetail, BookAnalysisPublishResult } from "@ai-novel/shared/types/bookAnalysis";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import type { KnowledgeService } from "../knowledge/KnowledgeService";
import { buildPublishDocumentTitle, buildPublishFileName, buildPublishMarkdown } from "./bookAnalysis.export";

export async function publishAnalysisToNovel(input: {
  analysisId: string;
  novelId: string;
  knowledgeService: Pick<KnowledgeService, "createDocument">;
  getAnalysisById: (analysisId: string) => Promise<BookAnalysisDetail | null>;
}): Promise<BookAnalysisPublishResult> {
  const [detail, novel] = await Promise.all([
    input.getAnalysisById(input.analysisId),
    prisma.novel.findUnique({ where: { id: input.novelId }, select: { id: true } }),
  ]);

  if (!detail) {
    throw new AppError("Book analysis not found.", 404);
  }
  if (detail.status === "archived") {
    throw new AppError("Archived book analysis cannot be published.", 400);
  }
  if (!novel) {
    throw new AppError("Novel not found.", 404);
  }

  const publishedAtISO = new Date().toISOString();
  const publishPayload = buildPublishMarkdown(detail, publishedAtISO);
  if (!publishPayload.hasPublishableContent) {
    throw new AppError("Book analysis has no publishable content.", 400);
  }

  const publishedDocument = await input.knowledgeService.createDocument({
    title: buildPublishDocumentTitle(detail),
    fileName: buildPublishFileName(detail),
    content: publishPayload.content,
  });

  const existingBindings = await prisma.knowledgeBinding.findMany({
    where: {
      targetType: "novel",
      targetId: input.novelId,
    },
    select: {
      documentId: true,
    },
  });
  const mergedDocumentIds = new Set(existingBindings.map((item) => item.documentId));

  if (!mergedDocumentIds.has(publishedDocument.id)) {
    await prisma.knowledgeBinding.upsert({
      where: {
        targetType_targetId_documentId: {
          targetType: "novel",
          targetId: input.novelId,
          documentId: publishedDocument.id,
        },
      },
      update: {},
      create: {
        targetType: "novel",
        targetId: input.novelId,
        documentId: publishedDocument.id,
      },
    });
    mergedDocumentIds.add(publishedDocument.id);
  }

  const bindingCount = await prisma.knowledgeBinding.count({
    where: {
      targetType: "novel",
      targetId: input.novelId,
    },
  });

  await prisma.bookAnalysis.update({
    where: { id: input.analysisId },
    data: { publishedDocumentId: publishedDocument.id },
  });

  return {
    analysisId: input.analysisId,
    novelId: input.novelId,
    knowledgeDocumentId: publishedDocument.id,
    knowledgeDocumentVersionNumber: publishedDocument.activeVersionNumber,
    bindingCount,
    publishedAt: publishedAtISO,
  };
}
