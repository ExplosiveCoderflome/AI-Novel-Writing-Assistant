import type {
  StateChangeProposal,
  StateCommitResult,
  StateVersionRecord,
} from "@ai-novel/shared/types/canonicalState";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma";
import { canonicalStateService } from "./CanonicalStateService";
import { chapterFactExtractor, type ChapterFactExtractorInput } from "./ChapterFactExtractor";
import { stateVersionLog } from "./StateVersionLog";

const AUTO_COMMIT_TYPES = new Set<StateChangeProposal["proposalType"]>([
  "event_record",
  "character_state_update",
  "payoff_progression",
  "conflict_update",
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
    const rawProposals = input.proposals ?? await chapterFactExtractor.extract(input);
    const validation = this.validate(rawProposals);
    const persisted = await this.persistValidated(validation);

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

  validate(proposals: StateChangeProposal[]): {
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

      if (!normalized.summary) {
        rejected.push({
          ...normalized,
          status: "rejected",
          validationNotes: normalized.validationNotes.concat("missing summary"),
        });
        continue;
      }

      if (ALWAYS_REVIEW_TYPES.has(normalized.proposalType) || normalized.riskLevel === "high") {
        pendingReview.push({
          ...normalized,
          status: "pending_review",
          validationNotes: normalized.validationNotes.concat("requires manual review"),
        });
        continue;
      }

      if (!AUTO_COMMIT_TYPES.has(normalized.proposalType)) {
        rejected.push({
          ...normalized,
          status: "rejected",
          validationNotes: normalized.validationNotes.concat("unsupported proposal type"),
        });
        continue;
      }

      if (normalized.proposalType === "character_state_update") {
        const payload = parseJsonRecord(normalized.payload);
        if (typeof payload.characterId !== "string" || !compactText(payload.characterId)) {
          rejected.push({
            ...normalized,
            status: "rejected",
            validationNotes: normalized.validationNotes.concat("missing characterId"),
          });
          continue;
        }
      }

      accepted.push({
        ...normalized,
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
  ): Promise<{
    committed: StateChangeProposal[];
    pendingReview: StateChangeProposal[];
    rejected: StateChangeProposal[];
  }> {
    const committedRows: PersistedProposalRow[] = [];
    const pendingRows: PersistedProposalRow[] = [];
    const rejectedRows: PersistedProposalRow[] = [];

    await prisma.$transaction(async (tx) => {
      for (const proposal of validation.accepted) {
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

  private async applyCommittedProposal(
    tx: Prisma.TransactionClient,
    proposal: StateChangeProposal,
  ): Promise<void> {
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
    return {
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
      validationNotes: this.parseStringArray(row.validationNotesJson),
    };
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
