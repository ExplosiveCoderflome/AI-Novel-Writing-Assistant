import i18next from "i18next";
﻿import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";
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
    return i18next.t("dict.gen_dbc67929");
  }
  if (checkpoint === "book_contract_ready") {
    return i18next.t("novels.novelEditTakeover.shared.zgtczo");
  }
  if (checkpoint === "character_setup_required") {
    return i18next.t("dict.gen_67358797");
  }
  if (checkpoint === "volume_strategy_ready") {
    return i18next.t("dict.gen_2282ccfa");
  }
  if (checkpoint === "chapter_batch_ready") {
    return `${resolveAutoExecutionScopeLabel(task)}自动执行已暂停`;
  }
  if (checkpoint === "replan_required") {
    return i18next.t("novels.novelEditTakeover.shared.cvz4wf");
  }
  if (checkpoint === "workflow_completed") {
    return i18next.t("novels.novelEditTakeover.shared.j3k1sf");
  }
  return i18next.t("novels.novelEditTakeover.shared.ld8j7q");
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
      return i18next.t("novels.novelEditTakeover.shared.7l4cai");
    }
    if (input.checkpointType === "character_setup_required") {
      return i18next.t("novels.novelEditTakeover.shared.6hxkwg");
    }
    if (input.checkpointType === "volume_strategy_ready") {
      return i18next.t("novels.novelEditTakeover.shared.y8xosu");
    }
    if (input.checkpointType === "workflow_completed") {
      return `自动导演已经完成${input.scopeLabel}的章节执行、审核与修复。你可以直接进入章节执行继续写作，也可以完成并退出导演模式。`;
    }
    if (input.checkpointType === "replan_required") {
      return i18next.t("novels.novelEditTakeover.shared.5eupdy");
    }
    if (input.reviewScope) {
      return i18next.t("novels.novelEditTakeover.shared.i1ffgv");
    }
  }
  if (input.mode === "failed") {
    if (input.checkpointType === "chapter_batch_ready") {
      return `${input.scopeLabel}自动执行已暂停。可以先查看执行详情或质量修复区，再决定是否继续自动执行。`;
    }
    return i18next.t("novels.novelEditTakeover.shared.jj1vtt");
  }
  if (input.mode === "loading") {
    return i18next.t("novels.novelEditTakeover.shared.do7m5l");
  }
  return i18next.t("novels.novelEditTakeover.shared.ssqyhc");
}

export function buildContinueAutoExecutionActionLabel(scopeLabel: string, isPending: boolean): string {
  return isPending ? "继续执行中..." : `继续自动执行${scopeLabel}`;
}

export function buildSkipQualityRepairActionLabel(scopeLabel: string, isPending: boolean): string {
  return isPending ? "继续执行中..." : `跳过本次建议，继续${scopeLabel}`;
}

export function buildContinueAutoExecutionToast(scopeLabel: string): string {
  return `自动导演已继续执行${scopeLabel}，并会在后台自动审核与修复。`;
}
