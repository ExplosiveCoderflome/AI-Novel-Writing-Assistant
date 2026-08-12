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
  return i18next.t("novels.directorAutoExecutionPlan.shared.7rlj0g", { val1: fallbackCount });
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
    return i18next.t("lib.novelWorkflowTaskUi.mr8bw9", { val1: resolveAutoExecutionScopeLabel(task) });
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
    return i18next.t("novels.novelEditTakeover.shared.cofuwa", { val1: input.novelTitle, val2: input.scopeLabel });
  }
  if (input.mode === "waiting" || input.mode === "action_required") {
    if (input.checkpointType === "candidate_selection_required") {
      return i18next.t("novels.novelEditTakeover.shared.y9rbdw", { val1: input.novelTitle });
    }
    if (input.checkpointType === "character_setup_required") {
      return i18next.t("novels.novelEditTakeover.shared.xlwh2z", { val1: input.novelTitle });
    }
    if (input.checkpointType === "volume_strategy_ready") {
      return i18next.t("novels.novelEditTakeover.shared.jv12i4", { val1: input.novelTitle });
    }
    if (input.checkpointType === "workflow_completed") {
      return i18next.t("novels.novelEditTakeover.shared.11igk3", { val1: input.novelTitle });
    }
    if (input.checkpointType === "replan_required") {
      return i18next.t("novels.novelEditTakeover.shared.lcfhq1", { val1: input.novelTitle });
    }
  }
  if (input.mode === "failed") {
    if (input.checkpointType === "chapter_batch_ready") {
      return i18next.t("novels.novelEditTakeover.shared.zfww13", { val1: input.novelTitle, val2: input.scopeLabel });
    }
    return i18next.t("novels.novelEditTakeover.shared.cf5mk5", { val1: input.novelTitle });
  }
  if (input.mode === "loading") {
    return i18next.t("novels.novelEditTakeover.shared.8yg7cy", { val1: input.novelTitle });
  }
  return i18next.t("novels.novelEditTakeover.shared.8udsek", { val1: input.novelTitle });
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
    return i18next.t("novels.novelEditTakeover.shared.j0jy5t", { val1: input.scopeLabel });
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
      return i18next.t("novels.novelEditTakeover.shared.n5hlo1", { val1: input.scopeLabel });
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
      return i18next.t("novels.novelEditTakeover.shared.slhfmx", { val1: input.scopeLabel });
    }
    return i18next.t("novels.novelEditTakeover.shared.jj1vtt");
  }
  if (input.mode === "loading") {
    return i18next.t("novels.novelEditTakeover.shared.do7m5l");
  }
  return i18next.t("novels.novelEditTakeover.shared.ssqyhc");
}

export function buildContinueAutoExecutionActionLabel(scopeLabel: string, isPending: boolean): string {
  return isPending ? "继续执行中..." : i18next.t("novels.novelEditTakeover.shared.lpivmv", { val1: scopeLabel });
}

export function buildSkipQualityRepairActionLabel(scopeLabel: string, isPending: boolean): string {
  return isPending ? "继续执行中..." : i18next.t("novels.novelEditTakeover.shared.okfv4r", { val1: scopeLabel });
}

export function buildContinueAutoExecutionToast(scopeLabel: string): string {
  return i18next.t("novels.novelEditTakeover.shared.9orta3", { val1: scopeLabel });
}
