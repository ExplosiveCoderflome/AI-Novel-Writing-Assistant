import { randomUUID } from "crypto";
import type {
  DirectorArtifactType,
  DirectorEvent,
  DirectorEventType,
} from "@ai-novel/shared/types/directorRuntime";
import type { ChapterQualityLoopAssessment } from "@ai-novel/shared/types/chapterQualityLoop";
import type { DirectorCircuitBreakerState } from "@ai-novel/shared/types/novelDirector";
import { prisma } from "../../../../db/prisma";
import { withSqliteRetry } from "../../../../db/sqliteRetry";

export interface DirectorLedgerEventInput {
  eventId?: string;
  idempotencyKey?: string;
  type: DirectorEventType;
  taskId?: string | null;
  runId?: string | null;
  novelId?: string | null;
  nodeKey?: string | null;
  artifactId?: string | null;
  artifactType?: DirectorArtifactType | string | null;
  summary: string;
  affectedScope?: string | null;
  severity?: DirectorEvent["severity"] | null;
  metadata?: Record<string, unknown> | null;
  occurredAt?: string | Date | null;
}

function normalizeDate(value?: string | Date | null): Date {
  if (!value) {
    return new Date();
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function buildEventId(input: DirectorLedgerEventInput): string {
  if (input.eventId?.trim()) {
    return input.eventId.trim();
  }
  if (input.idempotencyKey?.trim()) {
    return `director-ledger:${input.type}:${input.idempotencyKey.trim()}`;
  }
  return `director-ledger:${input.type}:${randomUUID()}`;
}

function stringifyMetadata(metadata?: Record<string, unknown> | null): string | null {
  return metadata && Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null;
}

function buildQualityLoopScope(assessment: ChapterQualityLoopAssessment): string {
  return `chapter:${assessment.chapterId}`;
}

export class DirectorAutomationLedgerEventService {
  async recordEvent(input: DirectorLedgerEventInput): Promise<void> {
    const eventId = buildEventId(input);
    const occurredAt = normalizeDate(input.occurredAt);
    const row = {
      id: eventId,
      runId: input.runId ?? null,
      taskId: input.taskId ?? null,
      novelId: input.novelId ?? null,
      type: input.type,
      nodeKey: input.nodeKey ?? null,
      artifactId: input.artifactId ?? null,
      artifactType: input.artifactType ?? null,
      summary: input.summary,
      affectedScope: input.affectedScope ?? null,
      severity: input.severity ?? null,
      metadataJson: stringifyMetadata(input.metadata),
      occurredAt,
    };
    await withSqliteRetry(
      () => prisma.directorEvent.upsert({
        where: { id: eventId },
        create: row,
        update: {
          runId: row.runId,
          taskId: row.taskId,
          novelId: row.novelId,
          type: row.type,
          nodeKey: row.nodeKey,
          artifactId: row.artifactId,
          artifactType: row.artifactType,
          summary: row.summary,
          affectedScope: row.affectedScope,
          severity: row.severity,
          metadataJson: row.metadataJson,
          occurredAt: row.occurredAt,
        },
      }),
      { label: "directorAutomationLedger.eventUpsert" },
    );
  }

  async recordQualityLoopAssessment(input: {
    taskId?: string | null;
    runId?: string | null;
    novelId: string;
    nodeKey?: string | null;
    assessment: ChapterQualityLoopAssessment;
  }): Promise<void> {
    const { assessment } = input;
    await this.recordEvent({
      type: "quality_loop_assessed",
      idempotencyKey: [
        input.taskId ?? "book",
        input.novelId,
        assessment.chapterId,
        assessment.evaluatedAt,
      ].join(":"),
      taskId: input.taskId,
      runId: input.runId,
      novelId: input.novelId,
      nodeKey: input.nodeKey ?? "chapter_quality_review_node",
      summary: `章节质量闭环建议：${assessment.recommendedAction}`,
      affectedScope: buildQualityLoopScope(assessment),
      severity: assessment.overallStatus === "invalid"
        ? "high"
        : assessment.overallStatus === "risk"
          ? "medium"
          : "low",
      metadata: { assessment },
      occurredAt: assessment.evaluatedAt,
    });
  }

  async recordReplanRunCreated(input: {
    taskId?: string | null;
    runId?: string | null;
    novelId: string;
    replanRunId: string;
    affectedChapterIds: string[];
    affectedChapterOrders: number[];
    generatedPlanIds: string[];
    blockingLedgerKeys: string[];
    triggerReason: string;
  }): Promise<void> {
    await this.recordEvent({
      type: "replan_run_created",
      idempotencyKey: `${input.novelId}:${input.replanRunId}`,
      taskId: input.taskId,
      runId: input.runId,
      novelId: input.novelId,
      nodeKey: "planner.replan",
      summary: `已重规划 ${input.affectedChapterOrders.length} 个章节。`,
      affectedScope: input.affectedChapterOrders.length > 0
        ? `chapters:${input.affectedChapterOrders.join(",")}`
        : null,
      severity: input.blockingLedgerKeys.length > 0 ? "medium" : "low",
      metadata: {
        replanRunId: input.replanRunId,
        affectedChapterIds: input.affectedChapterIds,
        affectedChapterOrders: input.affectedChapterOrders,
        generatedPlanIds: input.generatedPlanIds,
        blockingLedgerKeys: input.blockingLedgerKeys,
        triggerReason: input.triggerReason,
      },
    });
  }

  async recordCircuitBreakerOpened(input: {
    taskId?: string | null;
    runId?: string | null;
    novelId: string;
    state: DirectorCircuitBreakerState;
  }): Promise<void> {
    await this.recordEvent({
      type: "circuit_breaker_opened",
      idempotencyKey: [
        input.taskId ?? "book",
        input.novelId,
        input.state.reason ?? "unknown",
        input.state.openedAt ?? "open",
      ].join(":"),
      taskId: input.taskId,
      runId: input.runId,
      novelId: input.novelId,
      nodeKey: input.state.nodeKey ?? null,
      summary: input.state.message ?? "自动导演已暂停，等待恢复处理。",
      affectedScope: input.state.chapterId ? `chapter:${input.state.chapterId}` : null,
      severity: "high",
      metadata: { circuitBreaker: input.state },
      occurredAt: input.state.openedAt,
    });
  }

  async recordCircuitBreakerReset(input: {
    taskId?: string | null;
    runId?: string | null;
    novelId: string;
    state: DirectorCircuitBreakerState;
  }): Promise<void> {
    await this.recordEvent({
      type: "circuit_breaker_reset",
      idempotencyKey: [
        input.taskId ?? "book",
        input.novelId,
        input.state.resetAt ?? new Date().toISOString(),
      ].join(":"),
      taskId: input.taskId,
      runId: input.runId,
      novelId: input.novelId,
      nodeKey: input.state.nodeKey ?? null,
      summary: "自动导演熔断状态已恢复。",
      affectedScope: input.state.chapterId ? `chapter:${input.state.chapterId}` : null,
      severity: "low",
      metadata: { circuitBreaker: input.state },
      occurredAt: input.state.resetAt,
    });
  }
}

export const directorAutomationLedgerEventService = new DirectorAutomationLedgerEventService();
