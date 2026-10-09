import type {
  ContentProvenance,
  StateChangeProposal,
  StateCommitResult,
  StateVersionRecord,
} from "@ai-novel/shared/types/canonicalState";
import { characterResourceUpdatePayloadSchema } from "@ai-novel/shared/types/characterResource";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma";
import { ChapterArtifactContentVersionError } from "../runtime/artifactSync/ChapterArtifactSyncResult";
import { buildChapterArtifactContentHash } from "../runtime/artifactSync";
import { characterResourceLedgerService } from "../characterResource/CharacterResourceLedgerService";
import { compactText as compactResourceText, normalizeResourceKey } from "../characterResource/characterResourceShared";
import { characterResourceValidationService } from "../characterResource/CharacterResourceValidationService";
import { canonicalStateService } from "./CanonicalStateService";
import { chapterFactExtractor, type ChapterFactExtractorInput } from "./ChapterFactExtractor";
import { stateVersionLog } from "./StateVersionLog";
import {
  attachProposalSourceQuality,
  isDebtSourceProposal,
  markDebtSourcePendingReview,
  normalizeContentProvenance,
  resolveProposalSourceQuality,
} from "./stateProposalSourceQuality";

const AUTO_COMMIT_TYPES = new Set<StateChangeProposal["proposalType"]>([
  "event_record",
  "character_state_update",
  "payoff_progression",
  "conflict_update",
  "character_resource_update",
]);

const ALWAYS_REVIEW_TYPES = new Set<StateChangeProposal["proposalType"]>([
  "relation_state_update",
  "information_disclosure",
  "world_rule_change",
  "book_contract_change",
]);

function compactText(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function buildVersionSummary(
  chapterOrder: number | undefined,
  committed: StateChangeProposal[],
): string {
  const label = typeof chapterOrder === "number" ? `chapter ${chapterOrder}` : "novel";
  const typeSummary = Array.from(
    committed.reduce((accumulator, proposal) => {
      accumulator.set(
        proposal.proposalType,
        (accumulator.get(proposal.proposalType) ?? 0) + 1,
      );
      return accumulator;
    }, new Map<string, number>()),
  )
    .map(([proposalType, count]) => `${proposalType} x${count}`)
    .join(", ");
  return typeSummary ? `${label} committed ${typeSummary}` : `${label} canonical state refreshed`;
}

export interface StateCommitServiceInput extends ChapterFactExtractorInput {
  proposals?: StateChangeProposal[];
  skipFactExtraction?: boolean;
  contentProvenance?: ContentProvenance;
  expectedChapterContent?: string;
  artifactResourceReview?: { approvedResourceKeys: readonly string[]; pendingResourceKeys: readonly string[] };
}

export interface CommitExistingProposalsInput {
  novelId: string;
  proposalIds: string[];
  chapterId?: string | null;
  chapterOrder?: number | null;
  sourceType?: string;
  sourceStage?: string | null;
  reason: string;
  automaticResourceReview?: AutomaticResourceReview;
}

/** Internal authority issued after an AI review of this exact saved chapter. */
export interface AutomaticResourceReview {
  expectedChapterContent: string;
  assertExecutionOwnership: (db?: Prisma.TransactionClient) => Promise<void>;
}

interface PersistedProposalRow {
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

export class StateCommitService {
  async proposeAndCommit(input: StateCommitServiceInput): Promise<StateCommitResult> {
    const extractedProposals = input.skipFactExtraction ? [] : await chapterFactExtractor.extract(input);
    const rawProposals = input.proposals
      ? extractedProposals.concat(input.proposals)
      : extractedProposals;
    const inputSourceQuality = normalizeContentProvenance(input.contentProvenance);
    const proposals = rawProposals.map((proposal) => attachProposalSourceQuality(
      proposal,
      inputSourceQuality === "debt" ? "debt" : resolveProposalSourceQuality(proposal),
    ));
    const validation = await this.applyCharacterResourceConflictChecks(
      input.novelId,
      this.validate(proposals, input.artifactResourceReview ? {
        review: input.artifactResourceReview, novelId: input.novelId, chapterId: input.chapterId,
        content: input.expectedChapterContent,
      } : undefined),
    );
    const persisted = await this.persistValidated(validation, {
      novelId: input.novelId,
      chapterId: input.chapterId,
      expectedChapterContent: input.expectedChapterContent,
      artifactResourceReview: Boolean(input.artifactResourceReview),
    });

    let versionRecord: StateVersionRecord | null = null;
    if (persisted.committed.length > 0) {
      const snapshot = await canonicalStateService.getSnapshot(input.novelId, {
        chapterId: input.chapterId,
        chapterOrder: input.chapterOrder,
        includeCurrentChapterState: true,
      });
      versionRecord = await stateVersionLog.createVersion({
        novelId: input.novelId,
        chapterId: input.chapterId ?? null,
        sourceType: input.sourceType ?? "chapter_runtime",
        sourceStage: input.sourceStage ?? "chapter_execution",
        summary: buildVersionSummary(input.chapterOrder, persisted.committed),
        acceptedProposalIds: persisted.committed.map((proposal) => proposal.id).filter((id): id is string => Boolean(id)),
        snapshot,
      });
      await prisma.stateChangeProposal.updateMany({
        where: {
          id: {
            in: persisted.committed.map((proposal) => proposal.id).filter((id): id is string => Boolean(id)),
          },
        },
        data: {
          committedVersionId: versionRecord.id,
        },
      });
    }

    return {
      versionRecord,
      committed: persisted.committed,
      pendingReview: persisted.pendingReview,
      rejected: persisted.rejected,
    };
  }

  async commitExistingProposals(input: CommitExistingProposalsInput): Promise<StateCommitResult> {
    if (input.automaticResourceReview) return this.commitReviewedResourceProposals(input);
    const proposalIds = Array.from(new Set(input.proposalIds.map((id) => compactText(id)).filter(Boolean)));
    if (proposalIds.length === 0) {
      return {
        versionRecord: null,
        committed: [],
        pendingReview: [],
        rejected: [],
      };
    }

    const rows = await prisma.stateChangeProposal.findMany({
      where: {
        novelId: input.novelId,
        id: { in: proposalIds },
        status: "pending_review",
      },
    });
    if (rows.length === 0) {
      return {
        versionRecord: null,
        committed: [],
        pendingReview: [],
        rejected: [],
      };
    }

    const committed = rows.map((row) => {
      const proposal = this.toProposal(row);
      return {
        ...proposal,
        status: "committed" as const,
        validationNotes: proposal.validationNotes.concat(`proposal_commit:${input.reason}`),
      };
    });

    await prisma.$transaction(async (tx) => {
      for (const proposal of committed) {
        await this.applyCommittedProposal(tx, proposal);
        if (!proposal.id) {
          continue;
        }
        await tx.stateChangeProposal.update({
          where: { id: proposal.id },
          data: {
            status: "committed",
            validationNotesJson: JSON.stringify(proposal.validationNotes),
          },
        });
      }
    });

    return this.recordExistingProposalVersion(input, committed);
  }

  private async commitReviewedResourceProposals(input: CommitExistingProposalsInput): Promise<StateCommitResult> {
    const review = input.automaticResourceReview!;
    if (!input.chapterId) throw new Error("自动资源确认必须绑定已保存章节。");
    const committed: StateChangeProposal[] = [];
    const pendingReview: StateChangeProposal[] = [];
    const rejected: StateChangeProposal[] = [];
    await prisma.$transaction(async tx => {
      await review.assertExecutionOwnership(tx);
      const chapter = await tx.chapter.findFirst({ where: {
        id: input.chapterId!, novelId: input.novelId, content: review.expectedChapterContent,
      }, select: { id: true, order: true } });
      if (!chapter) throw new ChapterArtifactContentVersionError("章节正文版本已变化，已拒绝自动资源确认。");
      const rows = await tx.stateChangeProposal.findMany({ where: {
        novelId: input.novelId, chapterId: chapter.id, id: { in: input.proposalIds },
        proposalType: "character_resource_update", sourceType: "chapter_background_sync", status: "pending_review",
      } });
      for (const row of rows) {
        const proposal = this.toProposal(row);
        if (proposal.payload.syncContentHash !== buildChapterArtifactContentHash(review.expectedChapterContent)
          || proposal.payload.chapterOrder !== chapter.order) {
          pendingReview.push(proposal);
          continue;
        }
        const validated = characterResourceValidationService.validateProposal(proposal, { automaticReviewApproved: true });
        if (validated.status === "rejected") { rejected.push(validated); continue; }
        if (validated.status !== "committed") { pendingReview.push(validated); continue; }
        const conflicts = await this.findCharacterResourceConflictNotes(input.novelId, validated, tx);
        if (conflicts.length) {
          const blocked = { ...validated, status: "pending_review" as const, riskLevel: "high" as const,
            validationNotes: validated.validationNotes.concat(conflicts) };
          await tx.stateChangeProposal.update({ where: { id: row.id }, data: {
            riskLevel: "high", validationNotesJson: JSON.stringify(blocked.validationNotes),
          } });
          pendingReview.push(blocked);
          continue;
        }
        const notes = validated.validationNotes.concat(`proposal_commit:${input.reason}`);
        const claimed = await tx.stateChangeProposal.updateMany({ where: { id: row.id, status: "pending_review" },
          data: { status: "committed", validationNotesJson: JSON.stringify(notes) } });
        if (claimed.count !== 1) continue;
        await this.applyCommittedProposal(tx, validated);
        committed.push({ ...validated, validationNotes: notes });
      }
    });
    if (!committed.length) return { versionRecord: null, committed, pendingReview, rejected };
    return { ...await this.recordExistingProposalVersion(input, committed), pendingReview, rejected };
  }

  private async recordExistingProposalVersion(input: CommitExistingProposalsInput, committed: StateChangeProposal[]): Promise<StateCommitResult> {
    const snapshot = await canonicalStateService.getSnapshot(input.novelId, {
      chapterId: input.chapterId ?? committed[0]?.chapterId ?? undefined,
      chapterOrder: input.chapterOrder ?? undefined,
      includeCurrentChapterState: true,
    });
    const versionRecord = await stateVersionLog.createVersion({
      novelId: input.novelId,
      chapterId: input.chapterId ?? committed[0]?.chapterId ?? null,
      sourceType: input.sourceType ?? "manual_state_commit",
      sourceStage: input.sourceStage ?? "proposal_confirmation",
      summary: buildVersionSummary(input.chapterOrder ?? undefined, committed),
      acceptedProposalIds: committed.map((proposal) => proposal.id).filter((id): id is string => Boolean(id)),
      snapshot,
    });
    await prisma.stateChangeProposal.updateMany({
      where: {
        id: {
          in: committed.map((proposal) => proposal.id).filter((id): id is string => Boolean(id)),
        },
      },
      data: {
        committedVersionId: versionRecord.id,
      },
    });

    return {
      versionRecord,
      committed,
      pendingReview: [],
      rejected: [],
    };
  }

  validate(proposals: StateChangeProposal[], artifactReview?: {
    review: NonNullable<StateCommitServiceInput["artifactResourceReview"]>;
    novelId: string; chapterId?: string | null; content?: string;
  }): {
    accepted: StateChangeProposal[];
    pendingReview: StateChangeProposal[];
    rejected: StateChangeProposal[];
  } {
    const accepted: StateChangeProposal[] = [];
    const pendingReview: StateChangeProposal[] = [];
    const rejected: StateChangeProposal[] = [];

    for (const proposal of proposals) {
      const normalized = {
        ...proposal,
        summary: compactText(proposal.summary),
        evidence: proposal.evidence.map((item) => compactText(item)).filter(Boolean),
        validationNotes: proposal.validationNotes.map((item) => compactText(item)).filter(Boolean),
      } satisfies StateChangeProposal;
      const sourceNormalized = attachProposalSourceQuality(
        normalized,
        resolveProposalSourceQuality(normalized),
      );

      if (!sourceNormalized.summary) {
        rejected.push({
          ...sourceNormalized,
          status: "rejected",
          validationNotes: sourceNormalized.validationNotes.concat("missing summary"),
        });
        continue;
      }

      if (sourceNormalized.proposalType === "character_resource_update") {
        const key = String(sourceNormalized.payload.resourceKey ?? "");
        const currentVersion = artifactReview && artifactReview.content !== undefined
          && sourceNormalized.novelId === artifactReview.novelId && sourceNormalized.chapterId === artifactReview.chapterId
          && sourceNormalized.payload.syncContentHash === buildChapterArtifactContentHash(artifactReview.content);
        if (artifactReview && !currentVersion) {
          rejected.push({...sourceNormalized, status: "rejected", validationNotes: sourceNormalized.validationNotes.concat("artifact_resource_review:stale_or_foreign_source")});
          continue;
        }
        const evidenceSupported = artifactReview?.content !== undefined && sourceNormalized.evidence.some(
          evidence => compactText(artifactReview.content).includes(evidence),
        );
        const approved = Boolean(currentVersion && evidenceSupported && artifactReview?.review.approvedResourceKeys.includes(key));
        let resourceValidation = characterResourceValidationService.validateProposal(sourceNormalized, {automaticReviewApproved: approved});
        if (artifactReview && resourceValidation.status !== "rejected"
          && (artifactReview.review.pendingResourceKeys.includes(key) || !approved)) {
          resourceValidation = {...resourceValidation, status: "pending_review", validationNotes: resourceValidation.validationNotes.concat("artifact_resource_review:hold")};
        }
        if (resourceValidation.status === "committed") {
          accepted.push(resourceValidation);
        } else if (resourceValidation.status === "pending_review") {
          pendingReview.push(resourceValidation);
        } else {
          rejected.push(resourceValidation);
        }
        continue;
      }

      if (sourceNormalized.proposalType === "character_state_update") {
        const payload = parseJsonRecord(sourceNormalized.payload);
        if (typeof payload.characterId !== "string" || !compactText(payload.characterId)) {
          rejected.push({
            ...sourceNormalized,
            status: "rejected",
            validationNotes: sourceNormalized.validationNotes.concat("missing characterId"),
          });
          continue;
        }
      }

      const supportedProposalType = AUTO_COMMIT_TYPES.has(sourceNormalized.proposalType)
        || ALWAYS_REVIEW_TYPES.has(sourceNormalized.proposalType);
      if (!supportedProposalType) {
        rejected.push({
          ...sourceNormalized,
          status: "rejected",
          validationNotes: sourceNormalized.validationNotes.concat("unsupported proposal type"),
        });
        continue;
      }

      if (isDebtSourceProposal(sourceNormalized)) {
        pendingReview.push(markDebtSourcePendingReview(sourceNormalized));
        continue;
      }

      if (ALWAYS_REVIEW_TYPES.has(sourceNormalized.proposalType) || sourceNormalized.riskLevel === "high") {
        pendingReview.push({
          ...sourceNormalized,
          status: "pending_review",
          validationNotes: sourceNormalized.validationNotes.concat("requires manual review"),
        });
        continue;
      }

      accepted.push({
        ...sourceNormalized,
        status: "committed",
      });
    }

    return { accepted, pendingReview, rejected };
  }

  private async persistValidated(
    validation: {
      accepted: StateChangeProposal[];
      pendingReview: StateChangeProposal[];
      rejected: StateChangeProposal[];
    },
    integrity: {
      novelId: string;
      chapterId?: string | null;
      expectedChapterContent?: string;
      artifactResourceReview?: boolean;
    },
  ): Promise<{
    committed: StateChangeProposal[];
    pendingReview: StateChangeProposal[];
    rejected: StateChangeProposal[];
  }> {
    const committedRows: PersistedProposalRow[] = [];
    const pendingRows: PersistedProposalRow[] = [];
    const rejectedRows: PersistedProposalRow[] = [];

    await prisma.$transaction(async (tx) => {
      if (integrity.artifactResourceReview) {
        const novel = await tx.novel.findUnique({where: {id: integrity.novelId}, select: {directorVersion: true}});
        if (novel?.directorVersion !== "v2" || !integrity.chapterId || integrity.expectedChapterContent === undefined) {
          throw new Error("统一抽取资源确认必须绑定 V2 小说与已保存正文。");
        }
      }
      if (integrity.expectedChapterContent !== undefined && integrity.chapterId) {
        const chapter = await tx.chapter.findFirst({
          where: {
            id: integrity.chapterId,
            novelId: integrity.novelId,
            content: integrity.expectedChapterContent,
          },
          select: { id: true },
        });
        if (!chapter) {
          throw new ChapterArtifactContentVersionError("章节正文版本已变化，已拒绝写入过期角色资源状态。");
        }
      }
      for (const proposal of validation.accepted) {
        if (integrity.artifactResourceReview && proposal.proposalType === "character_resource_update") {
          const conflicts = await this.findCharacterResourceConflictNotes(integrity.novelId, proposal, tx);
          if (conflicts.length) {
            validation.pendingReview.push({...proposal, status: "pending_review", riskLevel: "high", validationNotes: proposal.validationNotes.concat(conflicts)});
            continue;
          }
        }
        const created = await tx.stateChangeProposal.create({
          data: {
            novelId: proposal.novelId,
            chapterId: proposal.chapterId ?? null,
            sourceSnapshotId: proposal.sourceSnapshotId ?? null,
            sourceType: proposal.sourceType,
            sourceStage: proposal.sourceStage ?? null,
            proposalType: proposal.proposalType,
            riskLevel: proposal.riskLevel,
            status: "committed",
            summary: proposal.summary,
            payloadJson: JSON.stringify(proposal.payload),
            evidenceJson: JSON.stringify(proposal.evidence),
            validationNotesJson: JSON.stringify(proposal.validationNotes),
          },
        });
        committedRows.push(created);
        await this.applyCommittedProposal(tx, proposal);
      }

      for (const proposal of validation.pendingReview) {
        const created = await tx.stateChangeProposal.create({
          data: {
            novelId: proposal.novelId,
            chapterId: proposal.chapterId ?? null,
            sourceSnapshotId: proposal.sourceSnapshotId ?? null,
            sourceType: proposal.sourceType,
            sourceStage: proposal.sourceStage ?? null,
            proposalType: proposal.proposalType,
            riskLevel: proposal.riskLevel,
            status: "pending_review",
            summary: proposal.summary,
            payloadJson: JSON.stringify(proposal.payload),
            evidenceJson: JSON.stringify(proposal.evidence),
            validationNotesJson: JSON.stringify(proposal.validationNotes),
          },
        });
        pendingRows.push(created);
      }

      for (const proposal of validation.rejected) {
        const created = await tx.stateChangeProposal.create({
          data: {
            novelId: proposal.novelId,
            chapterId: proposal.chapterId ?? null,
            sourceSnapshotId: proposal.sourceSnapshotId ?? null,
            sourceType: proposal.sourceType,
            sourceStage: proposal.sourceStage ?? null,
            proposalType: proposal.proposalType,
            riskLevel: proposal.riskLevel,
            status: "rejected",
            summary: proposal.summary,
            payloadJson: JSON.stringify(proposal.payload),
            evidenceJson: JSON.stringify(proposal.evidence),
            validationNotesJson: JSON.stringify(proposal.validationNotes),
          },
        });
        rejectedRows.push(created);
      }
    });

    return {
      committed: committedRows.map((row) => this.toProposal(row)),
      pendingReview: pendingRows.map((row) => this.toProposal(row)),
      rejected: rejectedRows.map((row) => this.toProposal(row)),
    };
  }

  private async applyCharacterResourceConflictChecks(
    novelId: string,
    validation: {
      accepted: StateChangeProposal[];
      pendingReview: StateChangeProposal[];
      rejected: StateChangeProposal[];
    },
  ): Promise<{
    accepted: StateChangeProposal[];
    pendingReview: StateChangeProposal[];
    rejected: StateChangeProposal[];
  }> {
    const accepted: StateChangeProposal[] = [];
    const pendingReview = [...validation.pendingReview];

    for (const proposal of validation.accepted) {
      if (proposal.proposalType !== "character_resource_update") {
        accepted.push(proposal);
        continue;
      }
      const conflictNotes = await this.findCharacterResourceConflictNotes(novelId, proposal);
      if (conflictNotes.length === 0) {
        accepted.push(proposal);
        continue;
      }
      pendingReview.push({
        ...proposal,
        status: "pending_review",
        riskLevel: "high",
        validationNotes: proposal.validationNotes.concat(conflictNotes),
      });
    }

    return {
      accepted,
      pendingReview,
      rejected: validation.rejected,
    };
  }

  private async findCharacterResourceConflictNotes(
    novelId: string,
    proposal: StateChangeProposal,
    db: Pick<Prisma.TransactionClient, "characterResourceLedgerItem"> = prisma,
  ): Promise<string[]> {
    const parsed = characterResourceUpdatePayloadSchema.safeParse(proposal.payload);
    if (!parsed.success) {
      return [];
    }
    const payload = parsed.data;
    const resourceKey = compactResourceText(payload.resourceKey)
      || normalizeResourceKey({
        name: payload.resourceName,
        holderCharacterId: payload.holderCharacterId,
        ownerName: payload.ownerName,
      });
    const existing = await db.characterResourceLedgerItem.findUnique({
      where: {
        novelId_resourceKey: {
          novelId,
          resourceKey,
        },
      },
    });
    if (!existing) {
      return [];
    }

    const notes: string[] = [];
    const existingOrder = existing.lastTouchedChapterOrder ?? 0;
    if (typeof payload.chapterOrder === "number" && existingOrder > payload.chapterOrder) {
      notes.push("resource_conflict: a newer chapter has already updated this resource");
    }
    if (
      payload.previousHolderCharacterId
      && existing.holderCharacterId
      && payload.previousHolderCharacterId !== existing.holderCharacterId
    ) {
      notes.push(`resource_conflict: expected previous holder ${payload.previousHolderCharacterId}, ledger holder is ${existing.holderCharacterId}`);
    }
    if (
      payload.updateType === "transferred"
      && payload.holderCharacterId
      && existing.holderCharacterId
      && payload.holderCharacterId === existing.holderCharacterId
    ) {
      notes.push("resource_conflict: transfer proposal keeps the same holder as the current ledger");
    }
    if (
      payload.ownerType === "character"
      && payload.ownerId
      && existing.ownerCharacterId
      && payload.ownerId !== existing.ownerCharacterId
    ) {
      notes.push(`resource_conflict: proposal owner ${payload.ownerId} does not match ledger owner ${existing.ownerCharacterId}`);
    }
    if (
      (existing.status === "destroyed" || existing.status === "consumed" || existing.status === "lost")
      && (payload.statusAfter === "available" || payload.statusAfter === "borrowed" || payload.statusAfter === "transferred")
      && payload.updateType !== "recovered"
    ) {
      notes.push(`resource_conflict: ledger status is ${existing.status}, direct reuse requires recovery evidence`);
    }
    if (existing.readerKnows && !payload.visibilityAfter.readerKnows) {
      notes.push("resource_conflict: reader visibility cannot regress from known to unknown");
    }
    if (existing.holderKnows && !payload.visibilityAfter.holderKnows) {
      notes.push("resource_conflict: holder visibility cannot regress from known to unknown");
    }
    return notes;
  }

  private async applyCommittedProposal(
    tx: Prisma.TransactionClient,
    proposal: StateChangeProposal,
  ): Promise<void> {
    if (proposal.proposalType === "character_resource_update") {
      const payload = characterResourceUpdatePayloadSchema.safeParse(proposal.payload);
      if (!payload.success) {
        return;
      }
      await characterResourceLedgerService.applyCommittedUpdate(tx, {
        novelId: proposal.novelId,
        chapterId: proposal.chapterId ?? null,
        chapterOrder: typeof payload.data.chapterOrder === "number" ? payload.data.chapterOrder : null,
        payload: payload.data,
        evidence: proposal.evidence,
        validationNotes: proposal.validationNotes,
        riskLevel: proposal.riskLevel,
      });
      return;
    }

    if (proposal.proposalType !== "character_state_update") {
      return;
    }

    const payload = parseJsonRecord(proposal.payload);
    const characterId = typeof payload.characterId === "string" ? payload.characterId : "";
    if (!characterId) {
      return;
    }

    await tx.character.update({
      where: { id: characterId },
      data: {
        currentState: typeof payload.currentState === "string" ? compactText(payload.currentState) || null : null,
        currentGoal: typeof payload.currentGoal === "string" ? compactText(payload.currentGoal) || null : null,
        lastEvolvedAt: new Date(),
      },
    }).catch(() => null);
  }

  private toProposal(row: PersistedProposalRow): StateChangeProposal {
    const validationNotes = this.parseStringArray(row.validationNotesJson);
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
      evidence: this.parseStringArray(row.evidenceJson),
      validationNotes,
    };
    return attachProposalSourceQuality(proposal, resolveProposalSourceQuality(proposal));
  }

  private parseStringArray(value: string | null | undefined): string[] {
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
}

export const stateCommitService = new StateCommitService();
