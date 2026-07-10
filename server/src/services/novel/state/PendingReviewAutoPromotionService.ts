import type { StateChangeProposal, StateCommitResult } from "@ai-novel/shared/types/canonicalState";
import { prisma } from "../../../db/prisma";
import { withSqliteRetry } from "../../../db/sqliteRetry";
import { directorAutomationLedgerEventService } from "../director/runtime/DirectorAutomationLedgerEventService";
import { stateCommitService, type CommitExistingProposalsInput, type StateCommitService } from "./StateCommitService";
import {
  PENDING_REVIEW_AUTO_PROMOTION_ELIGIBLE_AFTER_DAYS,
  PENDING_REVIEW_AUTO_PROMOTION_PROPOSAL_TYPES,
  PENDING_REVIEW_AUTO_PROMOTION_RUN_LIMIT,
  PENDING_REVIEW_AUTO_PROMOTION_SCAN_LIMIT,
} from "./pendingReviewAutoPromotionPolicy";
import { buildStateProposalSubjectKey } from "./stateProposalSubjectKey";

const SUPERSEDED_REASON = "已被更新提案覆盖";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type ProposalStatus = StateChangeProposal["status"];

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
  createdAt: Date;
  updatedAt?: Date | null;
}

interface OpenConflictRow {
  id: string;
  chapterId: string | null;
  conflictType: string;
  conflictKey: string;
  title: string;
  summary: string;
  severity: string;
  affectedCharacterIdsJson?: string | null;
  evidenceJson?: string | null;
  resolutionHint?: string | null;
  lastSeenChapterOrder?: number | null;
  updatedAt?: Date | null;
}

interface ProposalStore {
  findMany(args: unknown): Promise<PersistedProposalRow[]>;
  update(args: unknown): Promise<unknown>;
}

interface ConflictStore {
  findMany(args: unknown): Promise<OpenConflictRow[]>;
}

type CommitExistingProposals = Pick<StateCommitService, "commitExistingProposals">;

interface LedgerEventRecorder {
  recordEvent(input: Parameters<typeof directorAutomationLedgerEventService.recordEvent>[0]): Promise<void>;
}

export interface PendingReviewAutoPromotionOptions {
  since: string | Date;
  dryRun?: boolean;
  eligibleAfterDays?: number;
  runLimit?: number;
  scanLimit?: number;
  taskId?: string | null;
  runId?: string | null;
}

export interface PendingReviewAutoPromotionCandidate {
  proposalId: string;
  proposalType: StateChangeProposal["proposalType"];
  subjectKey: string;
  summary: string;
  chapterId: string | null;
  chapterOrder: number | null;
  createdAt: string;
  ageDays: number;
}

export interface PendingReviewAutoPromotionConflictRecord {
  id: string;
  conflictType: string;
  title: string;
  severity: string;
  reason: string;
  chapterId: string | null;
  lastSeenChapterOrder: number | null;
}

export interface PendingReviewAutoPromotionConflictSkipped extends PendingReviewAutoPromotionCandidate {
  conflicts: PendingReviewAutoPromotionConflictRecord[];
}

export interface PendingReviewAutoPromotionResult {
  novelId: string;
  since: string;
  evaluatedAt: string;
  criteria: {
    eligibleAfterDays: number;
    runLimit: number;
    scanLimit: number;
    eligibleCreatedBefore: string;
    proposalTypes: readonly string[];
  };
  scannedCount: number;
  malformedCount: number;
  promotable: PendingReviewAutoPromotionCandidate[];
  superseded: PendingReviewAutoPromotionCandidate[];
  conflictSkipped: PendingReviewAutoPromotionConflictSkipped[];
  deferredByRunLimit: PendingReviewAutoPromotionCandidate[];
  dryRun: boolean;
  commitResult?: StateCommitResult | null;
}

interface PendingReviewAutoPromotionServiceDeps {
  proposalStore?: ProposalStore;
  conflictStore?: ConflictStore;
  stateCommitService?: CommitExistingProposals;
  ledgerEventService?: LedgerEventRecorder;
  now?: () => Date;
  warn?: (message: string, details?: Record<string, unknown>) => void;
}

interface GroupedCandidate {
  proposal: StateChangeProposal;
  row: PersistedProposalRow;
  subjectKey: string;
}

function compactText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseJsonRecord(value: string | null | undefined): Record<string, unknown> {
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

function parseStringArray(value: string | null | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.map((item) => compactText(item)).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function parseDate(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("pending review auto-promotion requires a valid since timestamp.");
  }
  return date;
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(value as number)));
}

function getPayloadNumber(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function candidateToSummary(
  candidate: GroupedCandidate,
  evaluatedAt: Date,
): PendingReviewAutoPromotionCandidate {
  return {
    proposalId: candidate.proposal.id ?? candidate.row.id,
    proposalType: candidate.proposal.proposalType,
    subjectKey: candidate.subjectKey,
    summary: candidate.proposal.summary,
    chapterId: candidate.proposal.chapterId ?? null,
    chapterOrder: getPayloadNumber(candidate.proposal.payload, "chapterOrder"),
    createdAt: candidate.row.createdAt.toISOString(),
    ageDays: Math.max(0, Math.round(((evaluatedAt.getTime() - candidate.row.createdAt.getTime()) / MS_PER_DAY) * 100) / 100),
  };
}

function appendUnique(notes: string[], addition: string): string[] {
  const normalized = compactText(addition);
  if (!normalized || notes.includes(normalized)) {
    return notes;
  }
  return notes.concat(normalized);
}

function getCandidateCharacterIds(proposal: StateChangeProposal): string[] {
  if (proposal.proposalType === "relation_state_update") {
    return [
      compactText(proposal.payload.sourceCharacterId),
      compactText(proposal.payload.targetCharacterId),
    ].filter(Boolean);
  }
  if (proposal.proposalType === "information_disclosure" && proposal.payload.holderType === "character") {
    return [compactText(proposal.payload.holderRefId)].filter(Boolean);
  }
  return [];
}

function normalizeSearchText(value: unknown): string {
  return compactText(value).toLowerCase();
}

function buildConflictSearchText(conflict: OpenConflictRow): string {
  return [
    conflict.conflictKey,
    conflict.title,
    conflict.summary,
    conflict.resolutionHint,
    ...parseStringArray(conflict.evidenceJson),
  ].map(normalizeSearchText).filter(Boolean).join(" ");
}

function findConflictHits(
  candidate: GroupedCandidate,
  conflicts: OpenConflictRow[],
): PendingReviewAutoPromotionConflictRecord[] {
  const proposal = candidate.proposal;
  const characterIds = new Set(getCandidateCharacterIds(proposal));
  const fact = proposal.proposalType === "information_disclosure"
    ? normalizeSearchText(proposal.payload.fact)
    : "";

  return conflicts.flatMap((conflict) => {
    if (proposal.chapterId && conflict.chapterId === proposal.chapterId) {
      return [{
        id: conflict.id,
        conflictType: conflict.conflictType,
        title: conflict.title,
        severity: conflict.severity,
        reason: "same_chapter",
        chapterId: conflict.chapterId,
        lastSeenChapterOrder: conflict.lastSeenChapterOrder ?? null,
      }];
    }

    const affectedCharacterIds = parseStringArray(conflict.affectedCharacterIdsJson);
    if (affectedCharacterIds.some((id) => characterIds.has(id))) {
      return [{
        id: conflict.id,
        conflictType: conflict.conflictType,
        title: conflict.title,
        severity: conflict.severity,
        reason: "affected_character",
        chapterId: conflict.chapterId,
        lastSeenChapterOrder: conflict.lastSeenChapterOrder ?? null,
      }];
    }

    if (fact && buildConflictSearchText(conflict).includes(fact)) {
      return [{
        id: conflict.id,
        conflictType: conflict.conflictType,
        title: conflict.title,
        severity: conflict.severity,
        reason: "matched_fact",
        chapterId: conflict.chapterId,
        lastSeenChapterOrder: conflict.lastSeenChapterOrder ?? null,
      }];
    }

    return [];
  });
}

export class PendingReviewAutoPromotionService {
  constructor(private readonly deps: PendingReviewAutoPromotionServiceDeps = {}) {}

  async preview(
    novelId: string,
    options: Omit<PendingReviewAutoPromotionOptions, "dryRun">,
  ): Promise<PendingReviewAutoPromotionResult> {
    return this.buildPreview(novelId, {
      ...options,
      dryRun: true,
    });
  }

  async apply(
    novelId: string,
    options: PendingReviewAutoPromotionOptions,
  ): Promise<PendingReviewAutoPromotionResult> {
    const preview = await this.buildPreview(novelId, options);
    if (options.dryRun) {
      return preview;
    }

    const supersededIds = preview.superseded.map((item) => item.proposalId);
    const promotedIds = preview.promotable.map((item) => item.proposalId);

    for (const proposalId of supersededIds) {
      await withSqliteRetry(
        () => this.rejectSupersededProposal(proposalId),
        { label: "pendingReviewAutoPromotion.rejectSupersededProposal" },
      );
    }

    const commitResult = promotedIds.length > 0
      ? await this.getCommitService().commitExistingProposals({
          novelId,
          proposalIds: promotedIds,
          sourceType: "auto_director",
          sourceStage: "pending_review_auto_promotion",
          reason: "pending_review_auto_promotion:no_open_conflict_after_age_gate",
        } satisfies CommitExistingProposalsInput)
      : null;

    await this.recordLedgerEvent({
      novelId,
      options,
      preview,
      promotedIds,
      supersededIds,
    });
    this.warnApply({
      novelId,
      promotedIds,
      supersededIds,
      conflictSkippedCount: preview.conflictSkipped.length,
      deferredByRunLimitCount: preview.deferredByRunLimit.length,
    });

    return {
      ...preview,
      commitResult,
    };
  }

  private async buildPreview(
    novelId: string,
    options: PendingReviewAutoPromotionOptions,
  ): Promise<PendingReviewAutoPromotionResult> {
    const evaluatedAt = this.getNow();
    const since = parseDate(options.since);
    const eligibleAfterDays = clampInt(
      options.eligibleAfterDays,
      PENDING_REVIEW_AUTO_PROMOTION_ELIGIBLE_AFTER_DAYS,
      1,
      365,
    );
    const runLimit = clampInt(options.runLimit, PENDING_REVIEW_AUTO_PROMOTION_RUN_LIMIT, 1, 500);
    const scanLimit = clampInt(options.scanLimit, PENDING_REVIEW_AUTO_PROMOTION_SCAN_LIMIT, runLimit, 5000);
    const eligibleCreatedBefore = new Date(evaluatedAt.getTime() - eligibleAfterDays * MS_PER_DAY);
    const rows = await this.getProposalStore().findMany({
      where: {
        novelId,
        status: "pending_review" satisfies ProposalStatus,
        proposalType: { in: [...PENDING_REVIEW_AUTO_PROMOTION_PROPOSAL_TYPES] },
        createdAt: {
          gt: since,
          lte: eligibleCreatedBefore,
        },
      },
      orderBy: [
        { createdAt: "asc" },
        { id: "asc" },
      ],
      take: scanLimit,
    });
    const conflicts = await this.getConflictStore().findMany({
      where: {
        novelId,
        status: "open",
      },
      orderBy: [
        { updatedAt: "desc" },
        { id: "asc" },
      ],
      take: 500,
    });

    let malformedCount = 0;
    const grouped = new Map<string, GroupedCandidate[]>();
    for (const row of rows) {
      const proposal = this.toProposal(row);
      const subjectKey = buildStateProposalSubjectKey(proposal);
      if (!subjectKey || !proposal.id) {
        malformedCount += 1;
        continue;
      }
      const candidates = grouped.get(subjectKey) ?? [];
      candidates.push({ proposal, row, subjectKey });
      grouped.set(subjectKey, candidates);
    }

    const promotable: PendingReviewAutoPromotionCandidate[] = [];
    const superseded: PendingReviewAutoPromotionCandidate[] = [];
    const conflictSkipped: PendingReviewAutoPromotionConflictSkipped[] = [];
    const deferredByRunLimit: PendingReviewAutoPromotionCandidate[] = [];
    let writeBudget = 0;

    for (const group of grouped.values()) {
      const sorted = group.slice().sort((left, right) => {
        const byCreatedAt = right.row.createdAt.getTime() - left.row.createdAt.getTime();
        if (byCreatedAt !== 0) {
          return byCreatedAt;
        }
        return (right.proposal.id ?? "").localeCompare(left.proposal.id ?? "");
      });
      const latest = sorted[0];
      if (!latest) {
        continue;
      }
      const conflictsForLatest = findConflictHits(latest, conflicts);
      const latestSummary = candidateToSummary(latest, evaluatedAt);
      if (conflictsForLatest.length > 0) {
        conflictSkipped.push({
          ...latestSummary,
          conflicts: conflictsForLatest,
        });
        continue;
      }

      const older = sorted.slice(1).map((candidate) => candidateToSummary(candidate, evaluatedAt));
      const groupWriteCount = 1 + older.length;
      if (writeBudget + groupWriteCount > runLimit) {
        deferredByRunLimit.push(latestSummary, ...older);
        continue;
      }

      writeBudget += groupWriteCount;
      promotable.push(latestSummary);
      superseded.push(...older);
    }

    return {
      novelId,
      since: since.toISOString(),
      evaluatedAt: evaluatedAt.toISOString(),
      criteria: {
        eligibleAfterDays,
        runLimit,
        scanLimit,
        eligibleCreatedBefore: eligibleCreatedBefore.toISOString(),
        proposalTypes: PENDING_REVIEW_AUTO_PROMOTION_PROPOSAL_TYPES,
      },
      scannedCount: rows.length,
      malformedCount,
      promotable,
      superseded,
      conflictSkipped,
      deferredByRunLimit,
      dryRun: Boolean(options.dryRun),
      commitResult: null,
    };
  }

  private async rejectSupersededProposal(proposalId: string): Promise<void> {
    const rows = await this.getProposalStore().findMany({
      where: {
        id: proposalId,
        status: "pending_review" satisfies ProposalStatus,
      },
      take: 1,
    });
    const row = rows[0];
    if (!row) {
      return;
    }
    const notes = appendUnique(
      parseStringArray(row.validationNotesJson),
      `pending_review_auto_promotion:superseded:${SUPERSEDED_REASON}`,
    );
    await this.getProposalStore().update({
      where: { id: proposalId },
      data: {
        status: "rejected" satisfies ProposalStatus,
        validationNotesJson: JSON.stringify(notes),
      },
    });
  }

  private async recordLedgerEvent(input: {
    novelId: string;
    options: PendingReviewAutoPromotionOptions;
    preview: PendingReviewAutoPromotionResult;
    promotedIds: string[];
    supersededIds: string[];
  }): Promise<void> {
    await this.getLedgerEventService().recordEvent({
      type: "pending_review_auto_promotion",
      idempotencyKey: [
        input.options.taskId ?? "book",
        input.novelId,
        input.preview.evaluatedAt,
        input.promotedIds.join(",") || "none",
        input.supersededIds.join(",") || "none",
      ].join(":"),
      taskId: input.options.taskId ?? null,
      runId: input.options.runId ?? null,
      novelId: input.novelId,
      nodeKey: "state.pending_review_auto_promotion",
      summary: `待确认状态自动放行：提交 ${input.promotedIds.length} 条，覆盖 ${input.supersededIds.length} 条，跳过 ${input.preview.conflictSkipped.length} 条。`,
      affectedScope: input.promotedIds.length > 0
        ? `state_proposals:${input.promotedIds.join(",")}`
        : null,
      severity: input.promotedIds.length > 0 || input.supersededIds.length > 0 ? "medium" : "low",
      metadata: {
        criteria: input.preview.criteria,
        promotedIds: input.promotedIds,
        supersededIds: input.supersededIds,
        conflictSkipped: input.preview.conflictSkipped,
        deferredByRunLimit: input.preview.deferredByRunLimit,
        executedAt: input.preview.evaluatedAt,
      },
      occurredAt: input.preview.evaluatedAt,
    }).catch(() => undefined);
  }

  private warnApply(input: {
    novelId: string;
    promotedIds: string[];
    supersededIds: string[];
    conflictSkippedCount: number;
    deferredByRunLimitCount: number;
  }): void {
    const warn = this.deps.warn ?? console.warn;
    warn("[pending-review-auto-promotion] applied.", {
      novelId: input.novelId,
      promotedCount: input.promotedIds.length,
      supersededCount: input.supersededIds.length,
      conflictSkippedCount: input.conflictSkippedCount,
      deferredByRunLimitCount: input.deferredByRunLimitCount,
    });
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
      payload: parseJsonRecord(row.payloadJson),
      evidence: parseStringArray(row.evidenceJson),
      validationNotes: parseStringArray(row.validationNotesJson),
    };
  }

  private getNow(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private getProposalStore(): ProposalStore {
    return this.deps.proposalStore ?? prisma.stateChangeProposal;
  }

  private getConflictStore(): ConflictStore {
    return this.deps.conflictStore ?? prisma.openConflict;
  }

  private getCommitService(): CommitExistingProposals {
    return this.deps.stateCommitService ?? stateCommitService;
  }

  private getLedgerEventService(): LedgerEventRecorder {
    return this.deps.ledgerEventService ?? directorAutomationLedgerEventService;
  }
}

export const pendingReviewAutoPromotionService = new PendingReviewAutoPromotionService();

