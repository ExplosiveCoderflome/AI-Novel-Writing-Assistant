import type {
  ContentProvenance,
  StateChangeProposal,
  StateCommitResult,
} from "@ai-novel/shared/types/canonicalState";
import { characterResourceUpdatePayloadSchema } from "@ai-novel/shared/types/characterResource";
import type { Prisma } from "@prisma/client";
import { stateProposalStore, toStateProposal, type PersistedProposalRow } from "./persistence/StateProposalStore";
import { compactText, buildVersionSummary, validateStateProposals } from "./domain/StateProposalPolicy";
import { ChapterArtifactContentVersionError, buildChapterArtifactContentHash } from "../runtime/artifactSync/contracts";
import { applyCommittedProposal } from "./application/CommittedProposalApplication";
import { compactText as compactResourceText, normalizeResourceKey } from "../characterResource/characterResourceShared";
import { characterResourceValidationService } from "../characterResource/CharacterResourceValidationService";
import { canonicalStateService } from "./CanonicalStateService";
import { chapterFactExtractor, type ChapterFactExtractorInput } from "./ChapterFactExtractor";
import { stateVersionLog } from "./StateVersionLog";
import {
  attachProposalSourceQuality,
  normalizeContentProvenance,
  resolveProposalSourceQuality,
} from "./stateProposalSourceQuality";

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
    return this.persistValidated(validation, input);
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

    const committed: StateChangeProposal[] = [];
    return stateProposalStore.transaction(async (tx) => {
      const rows = await stateProposalStore.findPending(input.novelId, proposalIds, tx);
      for (const row of rows) {
        const proposal = toStateProposal(row);
        const confirmed = {
          ...proposal,
          status: "committed" as const,
          validationNotes: proposal.validationNotes.concat(`proposal_commit:${input.reason}`),
        };
        if (!await stateProposalStore.claimPending(confirmed, tx)) continue;
        await applyCommittedProposal(tx, confirmed);
        committed.push(confirmed);
      }
      if (!committed.length) return { versionRecord: null, committed, pendingReview: [], rejected: [] };
      return this.recordExistingProposalVersion(input, committed, tx);
    });
  }

  private async commitReviewedResourceProposals(input: CommitExistingProposalsInput): Promise<StateCommitResult> {
    const review = input.automaticResourceReview!;
    if (!input.chapterId) throw new Error("自动资源确认必须绑定已保存章节。");
    const committed: StateChangeProposal[] = [];
    const pendingReview: StateChangeProposal[] = [];
    const rejected: StateChangeProposal[] = [];
    return stateProposalStore.transaction(async tx => {
      await review.assertExecutionOwnership(tx);
      const chapter = await stateProposalStore.findSavedChapter(input.novelId, input.chapterId!, review.expectedChapterContent, tx);
      if (!chapter) throw new ChapterArtifactContentVersionError("章节正文版本已变化，已拒绝自动资源确认。");
      const rows = await stateProposalStore.findReviewedResources(input.novelId, chapter.id, input.proposalIds, tx);
      for (const row of rows) {
        const proposal = toStateProposal(row);
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
          await stateProposalStore.saveConflict(blocked, tx);
          pendingReview.push(blocked);
          continue;
        }
        const notes = validated.validationNotes.concat(`proposal_commit:${input.reason}`);
        if (!await stateProposalStore.claimPending({ ...validated, validationNotes: notes }, tx)) continue;
        await applyCommittedProposal(tx, validated);
        committed.push({ ...validated, validationNotes: notes });
      }
      if (!committed.length) return { versionRecord: null, committed, pendingReview, rejected };
      return { ...await this.recordExistingProposalVersion(input, committed, tx), pendingReview, rejected };
    });
  }

  private async recordExistingProposalVersion(input: CommitExistingProposalsInput, committed: StateChangeProposal[], tx: Prisma.TransactionClient): Promise<StateCommitResult> {
    const snapshot = await canonicalStateService.getSnapshot(input.novelId, {
      chapterId: input.chapterId ?? committed[0]?.chapterId ?? undefined,
      chapterOrder: input.chapterOrder ?? undefined,
      includeCurrentChapterState: true,
    }, tx);
    const versionRecord = await stateVersionLog.createVersion({
      novelId: input.novelId,
      chapterId: input.chapterId ?? committed[0]?.chapterId ?? null,
      sourceType: input.sourceType ?? "manual_state_commit",
      sourceStage: input.sourceStage ?? "proposal_confirmation",
      summary: buildVersionSummary(input.chapterOrder ?? undefined, committed),
      acceptedProposalIds: committed.map((proposal) => proposal.id).filter((id): id is string => Boolean(id)),
      snapshot,
    }, tx);
    await stateProposalStore.attachVersion(committed, versionRecord.id, tx);

    return {
      versionRecord,
      committed,
      pendingReview: [],
      rejected: [],
    };
  }

  validate(...args: Parameters<typeof validateStateProposals>) {
    return validateStateProposals(...args);
  }

  private async persistValidated(
    validation: {
      accepted: StateChangeProposal[];
      pendingReview: StateChangeProposal[];
      rejected: StateChangeProposal[];
    },
    input: StateCommitServiceInput,
  ): Promise<StateCommitResult> {
    const committedRows: PersistedProposalRow[] = [];
    const pendingRows: PersistedProposalRow[] = [];
    const rejectedRows: PersistedProposalRow[] = [];

    return stateProposalStore.transaction(async (tx) => {
      await stateProposalStore.assertArtifactIntegrity({ ...input, artifactResourceReview: Boolean(input.artifactResourceReview) }, tx);
      for (const proposal of validation.accepted) {
        if (input.artifactResourceReview && proposal.proposalType === "character_resource_update") {
          const conflicts = await this.findCharacterResourceConflictNotes(input.novelId, proposal, tx);
          if (conflicts.length) {
            validation.pendingReview.push({...proposal, status: "pending_review", riskLevel: "high", validationNotes: proposal.validationNotes.concat(conflicts)});
            continue;
          }
        }
        const created = await stateProposalStore.create(proposal, "committed", tx);
        committedRows.push(created);
        await applyCommittedProposal(tx, proposal);
      }

      for (const proposal of validation.pendingReview) {
        const created = await stateProposalStore.create(proposal, "pending_review", tx);
        pendingRows.push(created);
      }

      for (const proposal of validation.rejected) {
        const created = await stateProposalStore.create(proposal, "rejected", tx);
        rejectedRows.push(created);
      }
      const committed = committedRows.map(toStateProposal);
      const result = committed.length ? await this.recordExistingProposalVersion({
        novelId: input.novelId,
        chapterId: input.chapterId,
        chapterOrder: input.chapterOrder,
        sourceType: input.sourceType ?? "chapter_runtime",
        sourceStage: input.sourceStage ?? "chapter_execution",
        reason: "validated_proposals",
        proposalIds: committed.map(proposal => proposal.id!),
      }, committed, tx) : { versionRecord: null, committed };
      return {
        ...result,
        pendingReview: pendingRows.map(toStateProposal),
        rejected: rejectedRows.map(toStateProposal),
      };
    });
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
    db?: Pick<Prisma.TransactionClient, "characterResourceLedgerItem">,
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
    const existing = await stateProposalStore.findResource(novelId, resourceKey, db);
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
}

export const stateCommitService = new StateCommitService();
