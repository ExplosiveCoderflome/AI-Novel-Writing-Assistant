import type {
  DirectorAutoExecutionPlan,
  DirectorAutoExecutionState,
  DirectorTakeoverEntryStep,
} from "@ai-novel/shared/types/novelDirector";
import {
  type VolumePlanDocument,
} from "@ai-novel/shared/types/novel";
import {
  DIRECTOR_TAKEOVER_ENTRY_STEPS,
} from "@ai-novel/shared/types/novelDirector";
import { prisma } from "../../../db/prisma";
import {
  normalizeDirectorAutoExecutionPlan,
  resolveDirectorAutoExecutionRangeFromState,
} from "./novelDirectorAutoExecution";
import type { DirectorTakeoverResolvedPlan } from "./novelDirectorTakeover";
import { parseSeedPayload, mergeSeedPayload } from "../workflow/novelWorkflow.shared";
import type { DirectorWorkflowSeedPayload } from "./novelDirectorHelpers";

export const CONTINUE_EXISTING_REPLACEMENT_REASON = "由本任务替代";

interface ChapterOrderRange {
  startOrder: number;
  endOrder: number;
}

type ContinueExistingReplacementScope =
  | { type: "book" }
  | { type: "chapter_range"; startOrder: number; endOrder: number }
  | { type: "volume"; volumeOrder: number; range?: ChapterOrderRange | null }
  | { type: "unknown" };

export interface ContinueExistingDownstreamReset {
  preserveAssets: true;
  resetStatus: "not_started";
  fromStep: DirectorTakeoverEntryStep;
  resetSteps: DirectorTakeoverEntryStep[];
}

export interface ContinueExistingReplacementResult {
  workflowTaskIds: string[];
  pipelineJobIds: string[];
}

export function buildContinueExistingDownstreamReset(
  plan: Pick<DirectorTakeoverResolvedPlan, "entryStep">,
): ContinueExistingDownstreamReset {
  const startIndex = DIRECTOR_TAKEOVER_ENTRY_STEPS.indexOf(plan.entryStep);
  return {
    preserveAssets: true,
    resetStatus: "not_started",
    fromStep: plan.entryStep,
    resetSteps: startIndex >= 0 ? DIRECTOR_TAKEOVER_ENTRY_STEPS.slice(startIndex + 1) : [],
  };
}

function normalizeRange(range: ChapterOrderRange | null | undefined): ChapterOrderRange | null {
  if (!range || !Number.isFinite(range.startOrder) || !Number.isFinite(range.endOrder)) {
    return null;
  }
  const startOrder = Math.max(1, Math.round(range.startOrder));
  const endOrder = Math.max(startOrder, Math.round(range.endOrder));
  return { startOrder, endOrder };
}

function rangeOverlaps(left: ChapterOrderRange, right: ChapterOrderRange): boolean {
  return left.startOrder <= right.endOrder && right.startOrder <= left.endOrder;
}

function resolveScopeFromPlan(
  plan: DirectorAutoExecutionPlan | null | undefined,
  resolvedRange?: ChapterOrderRange | null,
  volumeRange?: ChapterOrderRange | null,
): ContinueExistingReplacementScope {
  if (!plan?.mode) {
    const range = normalizeRange(resolvedRange);
    return range ? { type: "chapter_range", ...range } : { type: "book" };
  }
  const normalized = normalizeDirectorAutoExecutionPlan(plan);
  if (normalized.mode === "book") {
    return { type: "book" };
  }
  if (normalized.mode === "volume") {
    return {
      type: "volume",
      volumeOrder: Math.max(1, Math.round(normalized.volumeOrder ?? 1)),
      range: normalizeRange(volumeRange ?? resolvedRange),
    };
  }
  return {
    type: "chapter_range",
    startOrder: Math.max(1, Math.round(normalized.startOrder ?? 1)),
    endOrder: Math.max(
      Math.max(1, Math.round(normalized.startOrder ?? 1)),
      Math.round(normalized.endOrder ?? normalized.startOrder ?? 1),
    ),
  };
}

function resolveScopeFromState(state: DirectorAutoExecutionState | null | undefined): ContinueExistingReplacementScope {
  if (!state?.enabled) {
    return { type: "unknown" };
  }
  const range = resolveDirectorAutoExecutionRangeFromState(state);
  if (state.mode === "book") {
    return { type: "book" };
  }
  if (state.mode === "volume" && typeof state.volumeOrder === "number") {
    return {
      type: "volume",
      volumeOrder: Math.max(1, Math.round(state.volumeOrder)),
      range: normalizeRange(range),
    };
  }
  if (range) {
    return {
      type: "chapter_range",
      startOrder: range.startOrder,
      endOrder: range.endOrder,
    };
  }
  return { type: "unknown" };
}

function resolveTaskScope(seedPayloadJson: string | null | undefined): ContinueExistingReplacementScope {
  const seedPayload = parseSeedPayload<DirectorWorkflowSeedPayload>(seedPayloadJson);
  const autoExecutionScope = resolveScopeFromState(seedPayload?.autoExecution);
  if (autoExecutionScope.type !== "unknown") {
    return autoExecutionScope;
  }
  return resolveScopeFromPlan(seedPayload?.autoExecutionPlan ?? seedPayload?.directorInput?.autoExecutionPlan);
}

function scopesOverlap(
  requested: ContinueExistingReplacementScope,
  existing: ContinueExistingReplacementScope,
): boolean {
  if (requested.type === "book" || existing.type === "book") {
    return true;
  }
  if (requested.type === "unknown" || existing.type === "unknown") {
    return true;
  }
  if (requested.type === "chapter_range" && existing.type === "chapter_range") {
    return rangeOverlaps(requested, existing);
  }
  if (requested.type === "volume" && existing.type === "volume") {
    return requested.volumeOrder === existing.volumeOrder;
  }
  if (requested.type === "volume" && requested.range && existing.type === "chapter_range") {
    return rangeOverlaps(requested.range, existing);
  }
  if (existing.type === "volume" && existing.range && requested.type === "chapter_range") {
    return rangeOverlaps(requested, existing.range);
  }
  return false;
}

function buildReplacementSummary(replacementTaskId: string): string {
  return `${CONTINUE_EXISTING_REPLACEMENT_REASON}：${replacementTaskId}`;
}

function resolveVolumeRangeFromWorkspace(
  workspace: VolumePlanDocument | null | undefined,
  volumeOrder: number | null,
): ChapterOrderRange | null {
  if (!workspace || !volumeOrder) {
    return null;
  }
  const volume = workspace.volumes.find((item) => item.sortOrder === volumeOrder);
  const orders = (volume?.chapters ?? [])
    .map((chapter) => chapter.chapterOrder)
    .filter((order) => Number.isFinite(order))
    .map((order) => Math.max(1, Math.round(order)))
    .sort((left, right) => left - right);
  if (orders.length === 0) {
    return null;
  }
  return {
    startOrder: orders[0],
    endOrder: orders[orders.length - 1],
  };
}

export async function cancelContinueExistingReplacedRuns(input: {
  novelId: string;
  replacementTaskId: string;
  autoExecutionPlan?: DirectorAutoExecutionPlan | null;
  resolvedRange?: ChapterOrderRange | null;
  getVolumeWorkspace?: (novelId: string) => Promise<VolumePlanDocument | null>;
  cancelPipelineJob?: (jobId: string) => Promise<unknown>;
}): Promise<ContinueExistingReplacementResult> {
  const replacementTaskId = input.replacementTaskId.trim();
  if (!replacementTaskId) {
    return { workflowTaskIds: [], pipelineJobIds: [] };
  }

  const normalizedPlan = normalizeDirectorAutoExecutionPlan(input.autoExecutionPlan);
  const volumeRange = normalizedPlan.mode === "volume" && input.getVolumeWorkspace
    ? resolveVolumeRangeFromWorkspace(
        await input.getVolumeWorkspace(input.novelId).catch(() => null),
        normalizedPlan.volumeOrder ?? null,
      )
    : null;
  const requestedScope = resolveScopeFromPlan(input.autoExecutionPlan, input.resolvedRange, volumeRange);
  const activeTasks = await prisma.novelWorkflowTask.findMany({
    where: {
      novelId: input.novelId,
      lane: "auto_director",
      id: { not: replacementTaskId },
      status: { in: ["queued", "running", "waiting_approval"] },
    },
    select: {
      id: true,
      seedPayloadJson: true,
    },
  });
  const replacedTasks = activeTasks.filter((task) => scopesOverlap(
    requestedScope,
    resolveTaskScope(task.seedPayloadJson),
  ));

  const now = new Date();
  const replacementSummary = buildReplacementSummary(replacementTaskId);
  await Promise.all(replacedTasks.map((task) => prisma.novelWorkflowTask.update({
    where: { id: task.id },
    data: {
      status: "cancelled",
      cancelRequestedAt: now,
      finishedAt: now,
      heartbeatAt: now,
      lastError: replacementSummary,
      currentItemLabel: "已由新的自动导演任务接管",
      seedPayloadJson: mergeSeedPayload(task.seedPayloadJson, {
        replacementTaskId,
        replacementReason: CONTINUE_EXISTING_REPLACEMENT_REASON,
        replacementSummary,
        replacedAt: now.toISOString(),
      }),
    },
  })));

  const pipelineJobs = await prisma.generationJob.findMany({
    where: {
      novelId: input.novelId,
      status: { in: ["queued", "running"] },
    },
    select: {
      id: true,
      startOrder: true,
      endOrder: true,
    },
  });
  const requestedRange = requestedScope.type === "chapter_range"
    ? requestedScope
    : requestedScope.type === "volume"
      ? requestedScope.range ?? null
      : null;
  const replacedPipelineJobs = pipelineJobs.filter((job) => {
    if (requestedScope.type === "book") {
      return true;
    }
    if (!requestedRange) {
      return false;
    }
    return rangeOverlaps(requestedRange, {
      startOrder: job.startOrder,
      endOrder: job.endOrder,
    });
  });
  if (input.cancelPipelineJob) {
    await Promise.all(replacedPipelineJobs.map(async (job) => {
      try {
        await input.cancelPipelineJob?.(job.id);
        await prisma.generationJob.updateMany({
          where: { id: job.id },
          data: { error: replacementSummary },
        });
      } catch {
        await prisma.generationJob.updateMany({
          where: {
            id: job.id,
            status: { in: ["queued", "running"] },
          },
          data: {
            status: "cancelled",
            error: replacementSummary,
            cancelRequestedAt: now,
            heartbeatAt: now,
            finishedAt: now,
          },
        });
      }
    }));
  }

  return {
    workflowTaskIds: replacedTasks.map((task) => task.id),
    pipelineJobIds: replacedPipelineJobs.map((job) => job.id),
  };
}
