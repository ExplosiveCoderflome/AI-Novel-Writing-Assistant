import type { CharacterResourceLedgerResponse, CharacterResourceProposalSummary } from "@ai-novel/shared/types/characterResource";
import { characterResourceUpdatePayloadSchema } from "@ai-novel/shared/types/characterResource";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { characterResourceExtractionService } from "../CharacterResourceExtractionService";
import { characterResourceLedgerService } from "../CharacterResourceLedgerService";
import { stateCommitService } from "../../state/StateCommitService";

type ResourceLlmOptions = { provider?: LLMProvider; model?: string; temperature?: number };

function parseStringArray(value: string | null | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item ?? "").replace(/\s+/g, " ").trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function parsePayload(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function mapProposal(row: {
  id: string;
  novelId: string;
  chapterId: string | null;
  sourceType: string;
  sourceStage: string | null;
  proposalType: string;
  riskLevel: string;
  status: string;
  summary: string;
  payloadJson: string;
  evidenceJson: string | null;
  validationNotesJson: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CharacterResourceProposalSummary {
  return {
    id: row.id,
    novelId: row.novelId,
    chapterId: row.chapterId,
    sourceType: row.sourceType,
    sourceStage: row.sourceStage,
    proposalType: "character_resource_update",
    riskLevel: row.riskLevel === "high" ? "high" : row.riskLevel === "medium" ? "medium" : "low",
    status: row.status === "committed" || row.status === "rejected" || row.status === "validated"
      ? row.status
      : "pending_review",
    summary: row.summary,
    payload: parsePayload(row.payloadJson),
    evidence: parseStringArray(row.evidenceJson),
    validationNotes: parseStringArray(row.validationNotesJson),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function listPendingResourceProposals(novelId: string): Promise<CharacterResourceProposalSummary[]> {
  const rows = await prisma.stateChangeProposal.findMany({
    where: {
      novelId,
      proposalType: "character_resource_update",
      status: "pending_review",
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 50,
  });
  return rows.map(mapProposal);
}

export class CharacterResourceApplicationService {
  async getLedger(novelId: string): Promise<CharacterResourceLedgerResponse> {
    const [items, pendingProposals] = await Promise.all([
      characterResourceLedgerService.listResources(novelId),
      listPendingResourceProposals(novelId),
    ]);
    return { items, pendingProposals };
  }

  async extractChapter(novelId: string, chapterId: string, options: ResourceLlmOptions = {}) {
    const proposals = await characterResourceExtractionService.extractChapterResourceProposals({
      novelId,
      chapterId,
      provider: options.provider,
      model: options.model,
      temperature: options.temperature,
      sourceType: "manual_resource_extract",
      sourceStage: "chapter_resource_review",
    });
    return stateCommitService.proposeAndCommit({
      novelId,
      chapterId,
      sourceType: "manual_resource_extract",
      sourceStage: "chapter_resource_review",
      proposals,
      skipFactExtraction: true,
    });
  }

  async backfill(novelId: string, options: ResourceLlmOptions & { limit?: number } = {}) {
    const limit = options.limit ?? 3;
    const candidateChapters = await prisma.chapter.findMany({
      where: {
        novelId,
        content: { not: null },
      },
      orderBy: { order: "desc" },
      take: limit * 3,
      select: { id: true, order: true, content: true },
    });
    const chapters = candidateChapters
      .filter((chapter) => String(chapter.content ?? "").replace(/\s+/g, " ").trim().length > 0)
      .slice(0, limit)
      .sort((left, right) => left.order - right.order);

    let committedCount = 0;
    let pendingReviewCount = 0;
    let rejectedCount = 0;
    let proposalCount = 0;
    for (const chapter of chapters) {
      const proposals = await characterResourceExtractionService.extractChapterResourceProposals({
        novelId,
        chapterId: chapter.id,
        chapterOrder: chapter.order,
        provider: options.provider,
        model: options.model,
        temperature: options.temperature,
        sourceType: "manual_resource_backfill",
        sourceStage: "character_resource_backfill",
      });
      proposalCount += proposals.length;
      const result = await stateCommitService.proposeAndCommit({
        novelId,
        chapterId: chapter.id,
        chapterOrder: chapter.order,
        sourceType: "manual_resource_backfill",
        sourceStage: "character_resource_backfill",
        proposals,
        skipFactExtraction: true,
      });
      committedCount += result.committed.length;
      pendingReviewCount += result.pendingReview.length;
      rejectedCount += result.rejected.length;
    }

    return {
      scannedChapterCount: chapters.length,
      proposalCount,
      committedCount,
      pendingReviewCount,
      rejectedCount,
      items: await characterResourceLedgerService.listResources(novelId),
      pendingProposals: await listPendingResourceProposals(novelId),
    };
  }

  async confirmProposal(novelId: string, proposalId: string) {
    const row = await prisma.stateChangeProposal.findFirst({
      where: {
        id: proposalId,
        novelId,
        proposalType: "character_resource_update",
        status: "pending_review",
      },
    });
    if (!row) {
      throw new AppError("没有找到可确认的角色资源变更。", 404);
    }

    const payload = characterResourceUpdatePayloadSchema.parse(parsePayload(row.payloadJson));
    const chapter = row.chapterId
      ? await prisma.chapter.findFirst({
          where: { id: row.chapterId, novelId },
          select: { order: true },
        })
      : null;
    await stateCommitService.commitExistingProposals({
      novelId,
      proposalIds: [proposalId],
      chapterId: row.chapterId,
      chapterOrder: typeof payload.chapterOrder === "number" ? payload.chapterOrder : chapter?.order ?? null,
      sourceType: "manual_resource_confirm",
      sourceStage: "chapter_resource_review",
      reason: "character_resource_manual_confirm",
    });

    return this.getLedger(novelId);
  }

  async rejectProposal(novelId: string, proposalId: string) {
    const updated = await prisma.stateChangeProposal.updateMany({
      where: {
        id: proposalId,
        novelId,
        proposalType: "character_resource_update",
        status: "pending_review",
      },
      data: { status: "rejected" },
    });
    if (updated.count === 0) {
      throw new AppError("没有找到可忽略的角色资源变更。", 404);
    }
    return this.getLedger(novelId);
  }
}

export const characterResourceApplicationService = new CharacterResourceApplicationService();
