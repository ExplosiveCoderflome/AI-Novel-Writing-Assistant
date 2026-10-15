import type { CharacterResourceProposalSummary } from "@ai-novel/shared/types/characterResource";
import { prisma } from "../../../../db/prisma";

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


export const characterResourceReviewStore = {
  listPending: listPendingResourceProposals,

  async selectBackfillChapters(novelId: string, limit: number) {
    const candidateChapters = await prisma.chapter.findMany({
      where: {
        novelId,
        content: { not: null },
      },
      orderBy: { order: "desc" },
      take: limit * 3,
      select: { id: true, order: true, content: true },
    });
    return candidateChapters
      .filter((chapter) => String(chapter.content ?? "").replace(/\s+/g, " ").trim().length > 0)
      .slice(0, limit)
      .sort((left, right) => left.order - right.order);

  },

  async findPending(novelId: string, proposalId: string) {
    const row = await prisma.stateChangeProposal.findFirst({
      where: {
        id: proposalId,
        novelId,
        proposalType: "character_resource_update",
        status: "pending_review",
      },
    });
    return row ? { ...row, payload: parsePayload(row.payloadJson) } : null;
  },

  async findChapterOrder(novelId: string, chapterId: string) {
    const chapter = await prisma.chapter.findFirst({ where: { id: chapterId, novelId }, select: { order: true } });
    return chapter?.order ?? null;
  },

  async rejectPending(novelId: string, proposalId: string) {
    return prisma.stateChangeProposal.updateMany({
      where: {
        id: proposalId,
        novelId,
        proposalType: "character_resource_update",
        status: "pending_review",
      },
      data: { status: "rejected" },
    });
  },
};
