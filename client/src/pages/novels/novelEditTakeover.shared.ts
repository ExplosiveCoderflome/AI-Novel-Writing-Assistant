import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import type { DirectorLockScope } from "@ai-novel/shared/types/novelDirector";
import type { NovelEditTakeoverState } from "./components/NovelEditView.types";

export function resolveAutoExecutionScopeLabel(task: UnifiedTaskDetail | null): string {
  const seedPayload = (task?.meta.seedPayload ?? null) as {
    autoExecution?: {
      scopeLabel?: string | null;
      totalChapterCount?: number | null;
    } | null;
  } | null;
  const scopeLabel = seedPayload?.autoExecution?.scopeLabel?.trim();
  if (scopeLabel) {
    return scopeLabel;
  }
  const fallbackCount = Math.max(1, Math.round(seedPayload?.autoExecution?.totalChapterCount ?? 10));
  return `第 1-${fallbackCount} 章`;
}

export function formatTakeoverCheckpoint(
  checkpoint: string | null | undefined,
  task: UnifiedTaskDetail | null,
): string {
  if (checkpoint === "candidate_selection_required") {
    return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  }
  if (checkpoint === "book_contract_ready") {
    return "Book Contract (To be confirmed)";
  }
  if (checkpoint === "character_setup_required") {
    return "Role preparation pending review";
  }
  if (checkpoint === "volume_strategy_ready") {
    return "Volume Strategy/Volume Skeleton Pending Review";
  }
  if (checkpoint === "chapter_batch_ready") {
    return `${resolveAutoExecutionScopeLabel(task)}自动执行已暂停`;
  }
  if (checkpoint === "replan_required") {
    return "Awaiting processing of re-planning suggestions";
  }
  if (checkpoint === "workflow_completed") {
    return "The main process has been completed";
  }
  return "Director process in progress";
}

export function buildTakeoverTitle(input: {
  mode: NovelEditTakeoverState["mode"];
  novelTitle: string;
  checkpointType: string | null | undefined;
  scopeLabel: string;
}): string {
  if (
    input.mode === "running"
    && input.checkpointType === "chapter_batch_ready"
  ) {
    return `《${input.novelTitle}》正在自动执行${input.scopeLabel}`;
  }
  if (input.mode === "waiting" || input.mode === "action_required") {
    if (input.checkpointType === "candidate_selection_required") {
      return `《${input.novelTitle}》等待确认书级方向`;
    }
    if (input.checkpointType === "character_setup_required") {
      return `《${input.novelTitle}》等待审核角色准备`;
    }
    if (input.checkpointType === "volume_strategy_ready") {
      return `《${input.novelTitle}》等待审核卷战略 / 卷骨架`;
    }
    if (input.checkpointType === "workflow_completed") {
      return `《${input.novelTitle}》本轮自动导演已完成`;
    }
    if (input.checkpointType === "replan_required") {
      return `《${input.novelTitle}》需要处理重规划`;
    }
  }
  if (input.mode === "failed") {
    if (input.checkpointType === "chapter_batch_ready") {
      return `《${input.novelTitle}》${input.scopeLabel}自动执行已暂停`;
    }
    return `《${input.novelTitle}》自动导演已中断`;
  }
  if (input.mode === "loading") {
    return `《${input.novelTitle}》自动导演状态同步中`;
  }
  return `《${input.novelTitle}》正在自动导演`;
}

export function buildTakeoverDescription(input: {
  mode: NovelEditTakeoverState["mode"];
  checkpointType: string | null | undefined;
  reviewScope: DirectorLockScope | null | undefined;
  scopeLabel: string;
}): string {
  if (
    input.mode === "running"
    && input.checkpointType === "chapter_batch_ready"
  ) {
    return `AI 正在后台自动执行${input.scopeLabel}，并会继续完成审核与修复。你仍可继续手动查看和编辑；如果同时修改当前章节，后续自动结果可能覆盖这部分内容。`;
  }
  if (input.mode === "waiting" || input.mode === "action_required") {
    if (input.checkpointType === "candidate_selection_required") {
      return "Book-level direction candidates have been generated. Please return to the book-level direction confirmation page to select or modify the plan before the automatic director can continue to advance the subsequent main chain.";
    }
    if (input.checkpointType === "character_setup_required") {
      return "Character preparation has been generated. You can check the core characters, relationships, and current goals first and confirm before continuing with autodirecting.";
    }
    if (input.checkpointType === "volume_strategy_ready") {
      return "Volume strategy/volume skeleton can currently be reviewed and fine-tuned. After confirmation, continue to automatically generate detailed resources for rhythm boards, split chapters, and selected chapter batches.";
    }
    if (input.checkpointType === "workflow_completed") {
      return `自动导演已经完成${input.scopeLabel}的章节执行、审核与修复。你可以直接进入章节执行继续写作，也可以完成并退出导演模式。`;
    }
    if (input.checkpointType === "replan_required") {
      return "After the selected chapters are executed in batches, the AI ​​determines that subsequent chapters need to be replanned. You can either go to the quality repair area to handle the suggestions first, or leave the issue for later quality recap and continue automatically executing the subsequent chapters.";
    }
    if (input.reviewScope) {
      return "AutoDirector has reached the review point. Please check the current stage of the product first before deciding whether to proceed.";
    }
  }
  if (input.mode === "failed") {
    if (input.checkpointType === "chapter_batch_ready") {
      return `${input.scopeLabel}自动执行已暂停。可以先查看执行详情或质量修复区，再决定是否继续自动执行。`;
    }
    return "The backend director process has been interrupted. You can check the execution details before deciding whether to resume from the latest progress point.";
  }
  if (input.mode === "loading") {
    return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  }
  return "AI is taking over the book's creation process in the background. You can continue to manually work on the current project; if you are making changes to the same content as the automated director at the same time, the latest result will prevail.";
}

export function buildContinueAutoExecutionActionLabel(scopeLabel: string, isPending: boolean): string {
  return isPending ? "Continue to execute..." : `继续自动执行${scopeLabel}`;
}

export function buildSkipQualityRepairActionLabel(scopeLabel: string, isPending: boolean): string {
  return isPending ? "Continue to execute..." : `跳过本次建议，继续${scopeLabel}`;
}

export function buildContinueAutoExecutionToast(scopeLabel: string): string {
  return `自动导演已继续执行${scopeLabel}，并会在后台自动审核与修复。`;
}
