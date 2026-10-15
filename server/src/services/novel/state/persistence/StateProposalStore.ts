import type { StateChangeProposal } from "@ai-novel/shared/types/canonicalState";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../../db/prisma";
import { ChapterArtifactContentVersionError } from "../../runtime/artifactSync/contracts";
import { attachProposalSourceQuality, resolveProposalSourceQuality } from "../stateProposalSourceQuality";
import { compactText } from "../domain/StateProposalPolicy";

export interface PersistedProposalRow {
  id: string;
  novelId: string;
  chapterId: string | null;
  sourceSnapshotId: string | null;
  sourceType: string;
  sourceStage: string | null;
  proposalType: string;
  riskLevel: string;
  status: string;
  summary: string;
  payloadJson: string;
  evidenceJson: string | null;
  validationNotesJson: string | null;
}

export function toStateProposal(row: PersistedProposalRow): StateChangeProposal {
  const validationNotes = parseStringArray(row.validationNotesJson);
  const proposal: StateChangeProposal = {
    id: row.id,
    novelId: row.novelId,
    chapterId: row.chapterId ?? null,
    sourceSnapshotId: row.sourceSnapshotId ?? null,
    sourceType: row.sourceType,
    sourceStage: row.sourceStage ?? null,
    proposalType: row.proposalType as StateChangeProposal["proposalType"],
    riskLevel: row.riskLevel as StateChangeProposal["riskLevel"],
    status: row.status as StateChangeProposal["status"],
    summary: row.summary,
    payload: JSON.parse(row.payloadJson) as Record<string, unknown>,
    evidence: parseStringArray(row.evidenceJson),
    validationNotes,
  };
  return attachProposalSourceQuality(proposal, resolveProposalSourceQuality(proposal));
}

function parseStringArray(value: string | null | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.map((item) => compactText(String(item ?? ""))).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

// Operations are specific to proposal review, rather than a generic CRUD repository.
export const stateProposalStore = {
  transaction: <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(work),

  findPending(novelId: string, proposalIds: string[], tx: Prisma.TransactionClient) {
    return tx.stateChangeProposal.findMany({ where: { novelId, id: { in: proposalIds }, status: "pending_review" } });
  },

  findReviewedResources(novelId: string, chapterId: string, proposalIds: string[], tx: Prisma.TransactionClient) {
    return tx.stateChangeProposal.findMany({ where: {
      novelId, chapterId, id: { in: proposalIds }, proposalType: "character_resource_update",
      sourceType: "chapter_background_sync", status: "pending_review",
    } });
  },

  async claimPending(proposal: StateChangeProposal, tx: Prisma.TransactionClient): Promise<boolean> {
    const result = await tx.stateChangeProposal.updateMany({
      where: { id: proposal.id!, novelId: proposal.novelId, status: "pending_review" },
      data: { status: "committed", validationNotesJson: JSON.stringify(proposal.validationNotes) },
    });
    return result.count === 1;
  },

  saveConflict(proposal: StateChangeProposal, tx: Prisma.TransactionClient) {
    return tx.stateChangeProposal.updateMany({
      where: { id: proposal.id!, novelId: proposal.novelId, status: "pending_review" },
      data: { riskLevel: "high", validationNotesJson: JSON.stringify(proposal.validationNotes) },
    });
  },

  create(proposal: StateChangeProposal, status: StateChangeProposal["status"], tx: Prisma.TransactionClient) {
    return tx.stateChangeProposal.create({ data: {
      novelId: proposal.novelId, chapterId: proposal.chapterId ?? null,
      sourceSnapshotId: proposal.sourceSnapshotId ?? null, sourceType: proposal.sourceType,
      sourceStage: proposal.sourceStage ?? null, proposalType: proposal.proposalType,
      riskLevel: proposal.riskLevel, status, summary: proposal.summary,
      payloadJson: JSON.stringify(proposal.payload), evidenceJson: JSON.stringify(proposal.evidence),
      validationNotesJson: JSON.stringify(proposal.validationNotes),
    } });
  },

  attachVersion(proposals: StateChangeProposal[], versionId: string, db: Prisma.TransactionClient) {
    return db.stateChangeProposal.updateMany({
      where: { id: { in: proposals.map(proposal => proposal.id).filter((id): id is string => Boolean(id)) } },
      data: { committedVersionId: versionId },
    });
  },

  findResource(novelId: string, resourceKey: string, db: Pick<Prisma.TransactionClient, "characterResourceLedgerItem"> = prisma) {
    return db.characterResourceLedgerItem.findUnique({ where: { novelId_resourceKey: { novelId, resourceKey } } });
  },

  updateCharacterState(characterId: string, state: { currentState: string | null; currentGoal: string | null }, tx: Prisma.TransactionClient) {
    return tx.character.update({ where: { id: characterId }, data: { ...state, lastEvolvedAt: new Date() } });
  },

  findSavedChapter(novelId: string, chapterId: string, content: string, tx: Prisma.TransactionClient) {
    return tx.chapter.findFirst({ where: { id: chapterId, novelId, content }, select: { id: true, order: true } });
  },

  async assertArtifactIntegrity(integrity: {
    novelId: string; chapterId?: string | null; expectedChapterContent?: string; artifactResourceReview?: boolean;
  }, tx: Prisma.TransactionClient) {
    if (integrity.artifactResourceReview) {
      const novel = await tx.novel.findUnique({ where: { id: integrity.novelId }, select: { directorVersion: true } });
      if (novel?.directorVersion !== "v2" || !integrity.chapterId || integrity.expectedChapterContent === undefined) {
        throw new Error("统一抽取资源确认必须绑定 V2 小说与已保存正文。");
      }
    }
    if (integrity.expectedChapterContent !== undefined && integrity.chapterId
      && !await this.findSavedChapter(integrity.novelId, integrity.chapterId, integrity.expectedChapterContent, tx)) {
      throw new ChapterArtifactContentVersionError("章节正文版本已变化，已拒绝写入过期角色资源状态。");
    }
  },
};
