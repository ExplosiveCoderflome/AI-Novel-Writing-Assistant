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
  return `前 ${fallbackCount} 章`;
}

export function formatTakeoverCheckpoint(
  checkpoint: string | null | undefined,
  task: UnifiedTaskDetail | null,
): string {
  if (checkpoint === "candidate_selection_required") {
    return "等待确认书级方向";
  }
  if (checkpoint === "book_contract_ready") {
    return "Book Contract 已就绪";
  }
  if (checkpoint === "character_setup_required") {
    return "角色准备待审核";
  }
  if (checkpoint === "volume_strategy_ready") {
    return "卷战略 / 卷骨架待审核";
  }
  if (checkpoint === "front10_ready") {
    return `${resolveAutoExecutionScopeLabel(task)}可开写`;
  }
  if (checkpoint === "chapter_batch_ready") {
    return `${resolveAutoExecutionScopeLabel(task)}自动执行已暂停`;
  }
  if (checkpoint === "workflow_completed") {
    return "主流程完成";
  }
  return "导演流程进行中";
}

export function buildTakeoverTitle(input: {
  mode: NovelEditTakeoverState["mode"];
  novelTitle: string;
  checkpointType: string | null | undefined;
  scopeLabel: string;
}): string {
  if (
    input.mode === "running"
    && (input.checkpointType === "front10_ready" || input.checkpointType === "chapter_batch_ready")
  ) {
    return `《${input.novelTitle}》正在自动执行${input.scopeLabel}`;
  }
  if (input.mode === "waiting") {
    if (input.checkpointType === "candidate_selection_required") {
      return `《${input.novelTitle}》等待确认书级方向`;
    }
    if (input.checkpointType === "character_setup_required") {
      return `《${input.novelTitle}》等待审核角色准备`;
    }
    if (input.checkpointType === "volume_strategy_ready") {
      return `《${input.novelTitle}》等待审核卷战略 / 卷骨架`;
    }
    if (input.checkpointType === "front10_ready") {
      return `《${input.novelTitle}》已完成自动导演交接`;
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
    && (input.checkpointType === "front10_ready" || input.checkpointType === "chapter_batch_ready")
  ) {
    return `AI 正在后台自动执行${input.scopeLabel}，并会继续完成审校与修复。你仍可继续手动查看和编辑；如果同时修改当前章节，后续自动结果可能覆盖这部分内容。`;
  }
  if (input.mode === "waiting") {
    if (input.checkpointType === "candidate_selection_required") {
      return "书级方向候选已经生成。请先回到书级方向确认页选定或修正方案，自动导演才能继续推进后续主链。";
    }
    if (input.checkpointType === "character_setup_required") {
      return "角色准备已经生成。你可以先检查核心角色、关系和当前目标，确认后再继续自动导演。";
    }
    if (input.checkpointType === "volume_strategy_ready") {
      return "当前可以审核并微调卷战略 / 卷骨架。确认后再继续自动生成节奏板、拆章和已选章节批次的细化资源。";
    }
    if (input.checkpointType === "front10_ready") {
      return `自动导演已经完成${input.scopeLabel}的开写准备。你可以直接进入章节执行，也可以继续让 AI 自动执行这批章节。`;
    }
    if (input.reviewScope) {
      return "自动导演已到达审核点。请先检查当前阶段产物，再决定是否继续推进。";
    }
  }
  if (input.mode === "failed") {
    if (input.checkpointType === "chapter_batch_ready") {
      return `${input.scopeLabel}自动执行已暂停。建议先查看任务中心或质量修复区，再决定是否继续自动执行。`;
    }
    return "后台导演流程已中断。建议先去任务中心查看失败原因，再决定是否从最近检查点恢复。";
  }
  if (input.mode === "loading") {
    return "正在同步当前自动导演状态。";
  }
  return "AI 正在后台接管这本书的开书流程。你可以继续手动操作当前项目；如果与自动导演同时改同一块内容，以最新写入结果为准。";
}

export function buildContinueAutoExecutionActionLabel(scopeLabel: string, isPending: boolean): string {
  return isPending ? "继续执行中..." : `继续自动执行${scopeLabel}`;
}

export function buildContinueAutoExecutionToast(scopeLabel: string): string {
  return `自动导演已继续执行${scopeLabel}，并会在后台自动审校与修复。`;
}
