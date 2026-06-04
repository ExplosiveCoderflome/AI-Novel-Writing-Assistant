import type {
  DirectorLlmUsageRecordSummary,
  DirectorLlmUsageSummary,
  DirectorPromptUsageSummary,
  DirectorStepRun,
  DirectorStepUsageSummary,
} from "@ai-novel/shared/types/directorRuntime";
import { prisma } from "../../../../db/prisma";

interface DirectorUsageRow {
  id: string;
  novelId: string | null;
  taskId: string | null;
  runId: string | null;
  stepIdempotencyKey: string | null;
  nodeKey: string | null;
  promptAssetKey: string | null;
  promptVersion: string | null;
  modelRoute: string | null;
  provider: string | null;
  model: string | null;
  status: string;
  attributionStatus: string;
  durationMs: number | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  metadataJson: string | null;
  recordedAt: Date | string;
}

export interface DirectorUsageTelemetryProjection {
  summary: DirectorLlmUsageSummary | null;
  recentUsage: DirectorLlmUsageRecordSummary[];
  stepUsage: DirectorStepUsageSummary[];
  promptUsage: DirectorPromptUsageSummary[];
}

export interface DirectorChapterUsageBudgetSummary extends DirectorLlmUsageSummary {
  chapterId: string;
  latestUsageRecordId: string;
  nodeKey?: string | null;
}

interface DirectorUsageMetadata {
  chapterId?: string | null;
  volumeId?: string | null;
  stage?: string | null;
  itemKey?: string | null;
  scope?: string | null;
  entrypoint?: string | null;
}

function parseUsageMetadata(row: DirectorUsageRow): DirectorUsageMetadata {
  if (!row.metadataJson) {
    return {};
  }
  try {
    const parsed = JSON.parse(row.metadataJson) as Record<string, unknown>;
    return {
      chapterId: typeof parsed.chapterId === "string" ? parsed.chapterId : null,
      volumeId: typeof parsed.volumeId === "string" ? parsed.volumeId : null,
      stage: typeof parsed.stage === "string" ? parsed.stage : null,
      itemKey: typeof parsed.itemKey === "string" ? parsed.itemKey : null,
      scope: typeof parsed.scope === "string" ? parsed.scope : null,
      entrypoint: typeof parsed.entrypoint === "string" ? parsed.entrypoint : null,
    };
  } catch {
    return {};
  }
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toTimestamp(value: Date | string | null | undefined): number {
  const iso = toIso(value);
  if (!iso) {
    return 0;
  }
  const timestamp = Date.parse(iso);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function emptySummary(): DirectorLlmUsageSummary {
  return {
    llmCallCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    durationMs: 0,
    lastRecordedAt: null,
  };
}

function hasUsage(summary: DirectorLlmUsageSummary): boolean {
  return summary.llmCallCount > 0
    || summary.promptTokens > 0
    || summary.completionTokens > 0
    || summary.totalTokens > 0;
}

function summarizeRows(rows: DirectorUsageRow[]): DirectorLlmUsageSummary | null {
  const summary = rows.reduce<DirectorLlmUsageSummary>((acc, row) => {
    const recordedAt = toIso(row.recordedAt);
    return {
      llmCallCount: acc.llmCallCount + 1,
      promptTokens: acc.promptTokens + row.promptTokens,
      completionTokens: acc.completionTokens + row.completionTokens,
      totalTokens: acc.totalTokens + row.totalTokens,
      durationMs: (acc.durationMs ?? 0) + Math.max(0, row.durationMs ?? 0),
      lastRecordedAt: toTimestamp(recordedAt) > toTimestamp(acc.lastRecordedAt)
        ? recordedAt
        : acc.lastRecordedAt,
    };
  }, emptySummary());
  return hasUsage(summary) ? summary : null;
}

function mapUsageRecord(row: DirectorUsageRow): DirectorLlmUsageRecordSummary {
  const metadata = parseUsageMetadata(row);
  return {
    id: row.id,
    novelId: row.novelId,
    taskId: row.taskId,
    runId: row.runId,
    chapterId: metadata.chapterId ?? null,
    volumeId: metadata.volumeId ?? null,
    stage: metadata.stage ?? null,
    itemKey: metadata.itemKey ?? null,
    scope: metadata.scope ?? null,
    entrypoint: metadata.entrypoint ?? null,
    stepIdempotencyKey: row.stepIdempotencyKey,
    nodeKey: row.nodeKey,
    promptAssetKey: row.promptAssetKey,
    promptVersion: row.promptVersion,
    modelRoute: row.modelRoute,
    provider: row.provider,
    model: row.model,
    status: row.status,
    attributionStatus: row.attributionStatus,
    llmCallCount: 1,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    totalTokens: row.totalTokens,
    durationMs: row.durationMs,
    lastRecordedAt: toIso(row.recordedAt),
    recordedAt: toIso(row.recordedAt) ?? new Date(0).toISOString(),
  };
}

function buildChapterUsage(rows: DirectorUsageRow[]): DirectorChapterUsageBudgetSummary[] {
  const grouped = new Map<string, DirectorUsageRow[]>();
  for (const row of rows) {
    const chapterId = parseUsageMetadata(row).chapterId?.trim();
    if (!chapterId) {
      continue;
    }
    grouped.set(chapterId, [
      ...(grouped.get(chapterId) ?? []),
      row,
    ]);
  }
  return [...grouped.entries()]
    .map(([chapterId, chapterRows]) => {
      const sortedRows = chapterRows
        .slice()
        .sort((left, right) => toTimestamp(right.recordedAt) - toTimestamp(left.recordedAt));
      const summary = summarizeRows(sortedRows) ?? emptySummary();
      return {
        ...summary,
        chapterId,
        latestUsageRecordId: sortedRows[0]?.id ?? chapterId,
        nodeKey: sortedRows[0]?.nodeKey ?? null,
      };
    })
    .sort((left, right) => right.totalTokens - left.totalTokens);
}

function buildStepUsage(
  rows: DirectorUsageRow[],
  steps: DirectorStepRun[] = [],
): DirectorStepUsageSummary[] {
  const stepByKey = new Map(steps.map((step) => [step.idempotencyKey, step]));
  const grouped = new Map<string, DirectorUsageRow[]>();
  for (const row of rows) {
    if (!row.stepIdempotencyKey) {
      continue;
    }
    grouped.set(row.stepIdempotencyKey, [
      ...(grouped.get(row.stepIdempotencyKey) ?? []),
      row,
    ]);
  }

  return [...grouped.entries()]
    .map(([stepIdempotencyKey, stepRows]) => {
      const first = stepRows[0];
      const step = stepByKey.get(stepIdempotencyKey);
      const summary = summarizeRows(stepRows) ?? emptySummary();
      return {
        ...summary,
        stepIdempotencyKey,
        nodeKey: step?.nodeKey ?? first?.nodeKey ?? "unknown",
        label: step?.label ?? null,
        status: step?.status ?? null,
        startedAt: step?.startedAt ?? null,
        finishedAt: step?.finishedAt ?? null,
        attributionStatus: "step_attributed",
      };
    })
    .sort((left, right) => toTimestamp(right.lastRecordedAt) - toTimestamp(left.lastRecordedAt))
    .slice(0, 12);
}

function buildPromptUsage(rows: DirectorUsageRow[]): DirectorPromptUsageSummary[] {
  const grouped = new Map<string, DirectorUsageRow[]>();
  for (const row of rows) {
    const promptAssetKey = row.promptAssetKey?.trim();
    if (!promptAssetKey) {
      continue;
    }
    const groupKey = [
      promptAssetKey,
      row.promptVersion?.trim() ?? "",
      row.nodeKey?.trim() ?? "",
    ].join("|");
    grouped.set(groupKey, [
      ...(grouped.get(groupKey) ?? []),
      row,
    ]);
  }

  return [...grouped.values()]
    .map((promptRows) => {
      const first = promptRows[0]!;
      const summary = summarizeRows(promptRows) ?? emptySummary();
      return {
        ...summary,
        promptAssetKey: first.promptAssetKey ?? "unknown",
        promptVersion: first.promptVersion,
        nodeKey: first.nodeKey,
        stepIdempotencyKey: first.stepIdempotencyKey,
        label: first.promptAssetKey,
        attributionStatus: first.attributionStatus,
      };
    })
    .sort((left, right) => toTimestamp(right.lastRecordedAt) - toTimestamp(left.lastRecordedAt))
    .slice(0, 16);
}

function normalizeWhereByNovelOrTask(novelId: string, taskIds: string[]) {
  const uniqueTaskIds = Array.from(new Set(taskIds.filter((id) => id.trim().length > 0)));
  if (uniqueTaskIds.length === 0) {
    return { novelId };
  }
  return {
    OR: [
      { novelId },
      { taskId: { in: uniqueTaskIds } },
    ],
  };
}

export class DirectorUsageTelemetryQueryService {
  async getTaskUsage(
    taskId: string,
    steps: DirectorStepRun[] = [],
  ): Promise<DirectorUsageTelemetryProjection> {
    const rows = await prisma.directorLlmUsageRecord.findMany({
      where: { taskId },
      orderBy: { recordedAt: "desc" },
      take: 300,
      select: this.selectUsageRow(),
    });
    return this.buildProjection(rows, steps);
  }

  async getBookUsage(input: {
    novelId: string;
    taskIds?: string[];
    steps?: DirectorStepRun[];
  }): Promise<DirectorUsageTelemetryProjection> {
    const rows = await prisma.directorLlmUsageRecord.findMany({
      where: normalizeWhereByNovelOrTask(input.novelId, input.taskIds ?? []),
      orderBy: { recordedAt: "desc" },
      take: 500,
      select: this.selectUsageRow(),
    });
    return this.buildProjection(rows, input.steps ?? []);
  }

  async getLargestChapterUsage(input: {
    novelId: string;
    taskIds?: string[];
    since?: Date;
  }): Promise<DirectorChapterUsageBudgetSummary | null> {
    const rows = await prisma.directorLlmUsageRecord.findMany({
      where: {
        ...normalizeWhereByNovelOrTask(input.novelId, input.taskIds ?? []),
        ...(input.since ? { recordedAt: { gte: input.since } } : {}),
      },
      orderBy: { recordedAt: "desc" },
      take: 1000,
      select: this.selectUsageRow(),
    });
    return buildChapterUsage(rows)[0] ?? null;
  }

  private buildProjection(
    rows: DirectorUsageRow[],
    steps: DirectorStepRun[],
  ): DirectorUsageTelemetryProjection {
    const sortedRows = rows
      .slice()
      .sort((left, right) => toTimestamp(right.recordedAt) - toTimestamp(left.recordedAt));
    return {
      summary: summarizeRows(sortedRows),
      recentUsage: sortedRows.slice(0, 12).map(mapUsageRecord),
      stepUsage: buildStepUsage(sortedRows, steps),
      promptUsage: buildPromptUsage(sortedRows),
    };
  }

  private selectUsageRow() {
    return {
      id: true,
      novelId: true,
      taskId: true,
      runId: true,
      stepIdempotencyKey: true,
      nodeKey: true,
      promptAssetKey: true,
      promptVersion: true,
      modelRoute: true,
      provider: true,
      model: true,
      status: true,
      attributionStatus: true,
      durationMs: true,
      promptTokens: true,
      completionTokens: true,
      totalTokens: true,
      metadataJson: true,
      recordedAt: true,
    } satisfies Record<keyof DirectorUsageRow, true>;
  }
}

export const directorUsageTelemetryQueryService = new DirectorUsageTelemetryQueryService();
