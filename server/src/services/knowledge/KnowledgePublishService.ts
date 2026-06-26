import { prisma } from "../../db/prisma";
import { KnowledgeService } from "./KnowledgeService";

export class KnowledgePublishService {
  constructor(private readonly knowledgeService = new KnowledgeService()) {}

  async publishAnalysisDocument(input: {
    sourceAnalysisId: string;
    buildTitle: (versionNumber: number) => string;
    fileName: string;
    content: string;
    indexPayload?: Record<string, unknown>;
  }) {
    const sourceAnalysisId = input.sourceAnalysisId.trim();
    if (!sourceAnalysisId) {
      throw new Error("sourceAnalysisId is required.");
    }

    const existing = await prisma.knowledgeDocument.findUnique({
      where: { sourceAnalysisId },
      select: {
        id: true,
        activeVersionNumber: true,
      },
    });

    if (existing) {
      return this.knowledgeService.createDocumentVersion(existing.id, {
        title: input.buildTitle(existing.activeVersionNumber + 1),
        fileName: input.fileName,
        content: input.content,
        indexPayload: input.indexPayload,
      });
    }

    return this.knowledgeService.createDocument({
      title: input.buildTitle(1),
      fileName: input.fileName,
      content: input.content,
      kind: "analysis_published",
      sourceAnalysisId,
      indexPayload: input.indexPayload,
    });
  }
}
