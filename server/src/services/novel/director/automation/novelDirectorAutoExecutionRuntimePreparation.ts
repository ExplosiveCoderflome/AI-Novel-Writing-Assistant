import type { PipelineJobStatus, VolumePlanDocument } from "@ai-novel/shared/types/novel";
import type {
  DirectorAutoExecutionState,
  DirectorConfirmRequest,
} from "@ai-novel/shared/types/novelDirector";
import { isFullBookAutopilotRunMode } from "@ai-novel/shared/types/novelDirector";
import {
  applyReviewSkipOverride,
  buildRequestedAutoExecutionState,
  resolveAutoExecutionRangeAndState,
} from "./novelDirectorAutoExecutionScopeRuntime";
import { isSkippableAutoExecutionReviewFailure } from "./novelDirectorAutoExecutionFailure";
import type { DirectorAutoExecutionRange } from "./novelDirectorAutoExecution";
import type { NovelDirectorAutoExecutionRuntimeDeps } from "./novelDirectorAutoExecutionRuntimePorts";

export async function resolveAutoExecutionRuntimeRangeAndState(
  deps: NovelDirectorAutoExecutionRuntimeDeps,
  input: {
    novelId: string;
    existingState?: DirectorAutoExecutionState | null;
    pipelineJobId?: string | null;
    pipelineStatus?: PipelineJobStatus | null;
    allowLazyChapterPlanning?: boolean;
  },
): Promise<{
  range: DirectorAutoExecutionRange;
  autoExecution: DirectorAutoExecutionState;
}> {
  return resolveAutoExecutionRangeAndState({
    novelId: input.novelId,
    deps: {
      listChapters: (novelId) => deps.novelContextService.listChapters(novelId),
      getVolumes: deps.volumeWorkspaceService
        ? (novelId) => deps.volumeWorkspaceService?.getVolumes(novelId) as Promise<VolumePlanDocument>
        : undefined,
    },
    existingState: input.existingState,
    pipelineJobId: input.pipelineJobId,
    pipelineStatus: input.pipelineStatus,
    allowLazyChapterPlanning: input.allowLazyChapterPlanning,
  });
}

export async function prepareRequestedAutoExecution(
  deps: NovelDirectorAutoExecutionRuntimeDeps,
  input: {
    novelId: string;
    request: DirectorConfirmRequest;
    existingState?: DirectorAutoExecutionState | null;
    existingPipelineJobId?: string | null;
    previousFailureMessage?: string | null;
    allowSkipReviewBlockedChapter?: boolean;
  },
): Promise<{
  range: DirectorAutoExecutionRange;
  autoExecution: DirectorAutoExecutionState;
  pipelineJobId: string;
}> {
  const shouldSkipReviewBlockedChapter = Boolean(
    input.allowSkipReviewBlockedChapter
    && isSkippableAutoExecutionReviewFailure(input.previousFailureMessage),
  );
  const pipelineJobId = shouldSkipReviewBlockedChapter
    ? ""
    : (input.existingPipelineJobId?.trim() || "");
  const existingState = applyReviewSkipOverride({
    existingState: input.existingState,
    previousFailureMessage: input.previousFailureMessage,
    allowSkipReviewBlockedChapter: input.allowSkipReviewBlockedChapter,
  });
  const requestedExecutionState = buildRequestedAutoExecutionState({
    request: input.request,
    existingState,
    existingPipelineJobId: pipelineJobId || null,
  });
  const { range, autoExecution } = await resolveAutoExecutionRuntimeRangeAndState(deps, {
    novelId: input.novelId,
    existingState: requestedExecutionState,
    pipelineJobId: pipelineJobId || null,
    pipelineStatus: pipelineJobId ? "running" : "queued",
    allowLazyChapterPlanning: isFullBookAutopilotRunMode(input.request.runMode),
  });
  return {
    range,
    autoExecution,
    pipelineJobId,
  };
}

export async function shouldStopAutoExecution(
  deps: NovelDirectorAutoExecutionRuntimeDeps,
  taskId: string,
  pipelineJobId?: string | null,
): Promise<boolean> {
  const row = await deps.workflowService.getTaskById(taskId);
  if (!row || row.status !== "cancelled") {
    return false;
  }
  if (pipelineJobId) {
    await deps.novelService.cancelPipelineJob(pipelineJobId).catch(() => null);
  }
  return true;
}
