import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { StateChangeProposal } from "@ai-novel/shared/types/canonicalState";
import type {
  DirectorStateProposalResolution,
  DirectorStateProposalResolutionDecision,
} from "@ai-novel/shared/types/stateProposalResolution";
import { prisma } from "../../../../db/prisma";
import { withSqliteRetry } from "../../../../db/sqliteRetry";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import { directorStateProposalResolutionPrompt } from "../../../../prompting/prompts/novel/directorStateProposalResolution.prompts";
import { canonicalStateService } from "../../state/CanonicalStateService";
import { stateCommitService } from "../../state/StateCommitService";
import { directorAutomationLedgerEventService } from "./DirectorAutomationLedgerEventService";

const AUTO_RESOLUTION_TYPES = [
  "information_disclosure",
  "relation_state_update",
  "character_resource_update",
] as const satisfies StateChangeProposal["proposalType"][];

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

export interface DirectorStateProposalResolutionRunInput {
  novelId: string;
  taskId?: string | null;
  chapterId?: string | null;
  chapterOrder?: number | null;
  runMode: string;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

export interface DirectorStateProposalResolutionRunResult {
  processed: boolean;
  decision: DirectorStateProposalResolutionDecision | "none";
  reason?: string | null;
  proposalIds: string[];
  affectedChapterWindow?: DirectorStateProposalResolution["affectedChapterWindow"] | null;
  blockingLedgerKeys: string[];
}

type PromptRunner = typeof runStructuredPrompt;

export function normalizeDirectorStateProposalResolutionForSafety(
  resolution: DirectorStateProposalResolution,
  proposals: StateChangeProposal[],
  input: Pick<DirectorStateProposalResolutionRunInput, "chapterOrder">,
): DirectorStateProposalResolution {
  const knownIds = new Set(proposals.map((proposal) => proposal.id).filter((id): id is string => Boolean(id)));
  const proposalIds = resolution.proposalIds.filter((id) => knownIds.has(id));
  const decision = resolution.confidence < 0.65
    ? "manual_required"
    : resolution.riskLevel === "high" && resolution.decision !== "auto_replan_window"
      ? "manual_required"
      : resolution.decision;
  return {
    ...resolution,
    decision,
    proposalIds: proposalIds.length > 0 ? proposalIds : Array.from(knownIds),
    affectedChapterWindow: {
      startOrder: resolution.affectedChapterWindow.startOrder ?? input.chapterOrder ?? null,
      endOrder: resolution.affectedChapterWindow.endOrder ?? resolution.affectedChapterWindow.startOrder ?? input.chapterOrder ?? null,
      chapterOrders: resolution.affectedChapterWindow.chapterOrders.length > 0
        ? resolution.affectedChapterWindow.chapterOrders
        : (typeof input.chapterOrder === "number" ? [input.chapterOrder] : []),
    },
    blockingLedgerKeys: resolution.blockingLedgerKeys.length > 0
      ? resolution.blockingLedgerKeys
      : proposals.map((proposal) => proposal.id).filter((id): id is string => Boolean(id)),
  };
}

export class DirectorStateProposalResolutionService {
  constructor(private readonly promptRunner: PromptRunner = runStructuredPrompt) {}

  async resolvePendingProposals(
    input: DirectorStateProposalResolutionRunInput,
  ): Promise<DirectorStateProposalResolutionRunResult> {
    const rows = await this.listPendingRows(input);
    if (rows.length === 0) {
      return {
        processed: false,
        decision: "none",
        proposalIds: [],
        blockingLedgerKeys: [],
      };
    }
    const proposals = rows.map((row) => this.toProposal(row));
    const snapshot = await canonicalStateService.getSnapshot(input.novelId, {
      chapterId: input.chapterId ?? undefined,
      chapterOrder: input.chapterOrder ?? undefined,
      includeCurrentChapterState: true,
    });
    const aiResult = await this.promptRunner({
      asset: directorStateProposalResolutionPrompt,
      promptInput: {
        runMode: input.runMode,
        novelId: input.novelId,
        taskId: input.taskId ?? null,
        chapterId: input.chapterId ?? null,
        chapterOrder: input.chapterOrder ?? null,
        proposalsJson: JSON.stringify(proposals, null, 2),
        canonicalStateJson: JSON.stringify(snapshot, null, 2),
        protectedContentJson: JSON.stringify({
          rule: "不要自动覆盖用户明确手写或保护的正文；无法确认时进入人工恢复。",
        }),
      },
      options: {
        provider: input.provider,
        model: input.model,
        temperature: input.temperature ?? 0.2,
        novelId: input.novelId,
        chapterId: input.chapterId ?? undefined,
        taskId: input.taskId ?? undefined,
        stage: "state_resolution",
        itemKey: "state_proposal_resolution",
        triggerReason: "full_book_autopilot_pending_state_proposals",
      },
    });
    const resolution = this.normalizeResolution(aiResult.output, proposals, input);
    const targetIds = this.resolveTargetProposalIds(resolution, proposals);
    if (resolution.decision === "apply") {
      await this.commitProposals({
        proposalIds: targetIds,
        novelId: input.novelId,
        chapterId: input.chapterId ?? null,
        chapterOrder: input.chapterOrder ?? null,
        reason: resolution.reason,
      });
    } else if (resolution.decision === "defer" || resolution.decision === "auto_replan_window") {
      await this.archiveProposals({
        proposalIds: targetIds,
        reason: resolution.reason,
        marker: resolution.decision,
      });
    }
    await directorAutomationLedgerEventService.recordEvent({
      type: "policy_changed",
      idempotencyKey: [
        input.taskId ?? "book",
        input.novelId,
        "state_proposal_resolution",
        targetIds.join(","),
        resolution.decision,
      ].join(":"),
      taskId: input.taskId ?? null,
      novelId: input.novelId,
      nodeKey: "state_proposal_resolution",
      summary: `状态提案处理：${resolution.reason}`,
      affectedScope: targetIds.length > 0 ? `state_proposals:${targetIds.join(",")}` : null,
      severity: resolution.decision === "manual_required"
        ? "high"
        : resolution.decision === "auto_replan_window"
          ? "medium"
          : "low",
      metadata: {
        resolution,
        proposalIds: targetIds,
      },
    }).catch(() => null);
    return {
      processed: resolution.decision !== "manual_required",
      decision: resolution.decision,
      reason: resolution.reason,
      proposalIds: targetIds,
      affectedChapterWindow: resolution.affectedChapterWindow,
      blockingLedgerKeys: resolution.blockingLedgerKeys,
    };
  }

  private async listPendingRows(input: DirectorStateProposalResolutionRunInput): Promise<PersistedProposalRow[]> {
    return prisma.stateChangeProposal.findMany({
      where: {
        novelId: input.novelId,
        status: "pending_review",
        proposalType: { in: AUTO_RESOLUTION_TYPES as unknown as string[] },
        ...(input.chapterId ? { OR: [{ chapterId: input.chapterId }, { chapterId: null }] } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: 20,
    });
  }

  private normalizeResolution(
    resolution: DirectorStateProposalResolution,
    proposals: StateChangeProposal[],
    input: DirectorStateProposalResolutionRunInput,
  ): DirectorStateProposalResolution {
    return normalizeDirectorStateProposalResolutionForSafety(resolution, proposals, input);
  }

  private resolveTargetProposalIds(
    resolution: DirectorStateProposalResolution,
    proposals: StateChangeProposal[],
  ): string[] {
    const knownIds = new Set(proposals.map((proposal) => proposal.id).filter((id): id is string => Boolean(id)));
    const selected = resolution.proposalIds.filter((id) => knownIds.has(id));
    return selected.length > 0 ? selected : Array.from(knownIds);
  }

  private async commitProposals(input: {
    proposalIds: string[];
    novelId: string;
    chapterId?: string | null;
    chapterOrder?: number | null;
    reason: string;
  }): Promise<void> {
    if (input.proposalIds.length === 0) {
      return;
    }
    await stateCommitService.commitExistingProposals({
      novelId: input.novelId,
      chapterId: input.chapterId ?? null,
      chapterOrder: input.chapterOrder ?? null,
      sourceType: "auto_director",
      sourceStage: "state_resolution",
      proposalIds: input.proposalIds,
      reason: `auto_director_state_resolution:${input.reason}`,
    });
  }

  private async archiveProposals(input: {
    proposalIds: string[];
    reason: string;
    marker: "defer" | "auto_replan_window";
  }): Promise<void> {
    if (input.proposalIds.length === 0) {
      return;
    }
    await withSqliteRetry(
      () => prisma.stateChangeProposal.updateMany({
        where: { id: { in: input.proposalIds } },
        data: {
          status: "rejected",
          validationNotesJson: JSON.stringify([
            `auto_director_state_resolution:${input.marker}`,
            input.reason,
          ]),
        },
      }),
      { label: "directorStateProposalResolution.archiveProposals" },
    );
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
      payload: this.parseJsonRecord(row.payloadJson),
      evidence: this.parseStringArray(row.evidenceJson),
      validationNotes: this.parseStringArray(row.validationNotesJson),
    };
  }

  private parseJsonRecord(value: string | null | undefined): Record<string, unknown> {
    if (!value?.trim()) {
      return {};
    }
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  }

  private parseStringArray(value: string | null | undefined): string[] {
    if (!value?.trim()) {
      return [];
    }
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.map((item) => String(item ?? "").trim()).filter(Boolean)
        : [];
    } catch {
      return [];
    }
  }
}

export const directorStateProposalResolutionService = new DirectorStateProposalResolutionService();
