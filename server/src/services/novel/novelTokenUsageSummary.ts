import type { TaskTokenUsageSummary } from "@ai-novel/shared/types/task";
import { prisma } from "../../db/prisma";
import { toTaskTokenUsageSummary } from "../task/taskTokenUsageSummary";

type UsageAccumulator = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  llmCallCount: number;
  lastTokenRecordedAt: Date | null;
};

function createEmptyAccumulator(): UsageAccumulator {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    llmCallCount: 0,
    lastTokenRecordedAt: null,
  };
}

function toSafeNumber(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

function mergeUsage(accumulator: UsageAccumulator, input: {
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  llmCallCount?: number | null;
  lastTokenRecordedAt?: Date | null;
}): void {
  accumulator.promptTokens += toSafeNumber(input.promptTokens);
  accumulator.completionTokens += toSafeNumber(input.completionTokens);
  accumulator.totalTokens += toSafeNumber(input.totalTokens);
  accumulator.llmCallCount += toSafeNumber(input.llmCallCount);
  if (
    input.lastTokenRecordedAt
    && (!accumulator.lastTokenRecordedAt || input.lastTokenRecordedAt.getTime() > accumulator.lastTokenRecordedAt.getTime())
  ) {
    accumulator.lastTokenRecordedAt = input.lastTokenRecordedAt;
  }
}

export function extractWorkflowTaskIdFromGenerationJobPayload(payload: string | null | undefined): string | null {
  if (typeof payload !== "string" || payload.trim().length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(payload) as { workflowTaskId?: unknown } | null;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return typeof parsed.workflowTaskId === "string" && parsed.workflowTaskId.trim().length > 0
      ? parsed.workflowTaskId.trim()
      : null;
  } catch {
    return null;
  }
}

export async function listNovelTokenUsageByNovelIds(novelIds: string[]): Promise<Map<string, TaskTokenUsageSummary | null>> {
  const uniqueNovelIds = Array.from(new Set(novelIds.filter((id) => id.trim().length > 0)));
  if (uniqueNovelIds.length === 0) {
    return new Map();
  }

  const [workflowUsageRows, generationJobRows] = await Promise.all([
    prisma.novelWorkflowTask.groupBy({
      by: ["novelId"],
      where: {
        novelId: {
          in: uniqueNovelIds,
        },
      },
      _sum: {
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
        llmCallCount: true,
      },
      _max: {
        lastTokenRecordedAt: true,
      },
    }),
    prisma.generationJob.findMany({
      where: {
        novelId: {
          in: uniqueNovelIds,
        },
        OR: [
          { promptTokens: { gt: 0 } },
          { completionTokens: { gt: 0 } },
          { totalTokens: { gt: 0 } },
          { llmCallCount: { gt: 0 } },
        ],
      },
      select: {
        novelId: true,
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
        llmCallCount: true,
        lastTokenRecordedAt: true,
        payload: true,
      },
    }),
  ]);

  const usageByNovelId = new Map<string, UsageAccumulator>(
    uniqueNovelIds.map((novelId) => [novelId, createEmptyAccumulator()]),
  );

  for (const row of workflowUsageRows) {
    if (!row.novelId) {
      continue;
    }
    const accumulator = usageByNovelId.get(row.novelId);
    if (!accumulator) {
      continue;
    }
    mergeUsage(accumulator, {
      promptTokens: row._sum.promptTokens,
      completionTokens: row._sum.completionTokens,
      totalTokens: row._sum.totalTokens,
      llmCallCount: row._sum.llmCallCount,
      lastTokenRecordedAt: row._max.lastTokenRecordedAt,
    });
  }

  for (const row of generationJobRows) {
    if (extractWorkflowTaskIdFromGenerationJobPayload(row.payload)) {
      continue;
    }
    const accumulator = usageByNovelId.get(row.novelId);
    if (!accumulator) {
      continue;
    }
    mergeUsage(accumulator, row);
  }

  return new Map(
    uniqueNovelIds.map((novelId) => {
      const accumulator = usageByNovelId.get(novelId) ?? createEmptyAccumulator();
      return [
        novelId,
        toTaskTokenUsageSummary({
          promptTokens: accumulator.promptTokens,
          completionTokens: accumulator.completionTokens,
          totalTokens: accumulator.totalTokens,
          llmCallCount: accumulator.llmCallCount,
          lastTokenRecordedAt: accumulator.lastTokenRecordedAt,
        }),
      ];
    }),
  );
}
