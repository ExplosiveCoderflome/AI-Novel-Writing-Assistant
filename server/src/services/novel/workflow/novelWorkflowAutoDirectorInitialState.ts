import type {
  NovelWorkflowLane,
  NovelWorkflowResumeTarget,
  NovelWorkflowStage,
} from "@ai-novel/shared/types/novelWorkflow";
import { DIRECTOR_PROGRESS } from "../director/novelDirectorProgress";
import { NOVEL_WORKFLOW_STAGE_PROGRESS, parseResumeTarget } from "./novelWorkflow.shared";

export interface AutoDirectorBootstrapInitialState {
  stage: NovelWorkflowStage;
  itemKey?: string | null;
  itemLabel: string;
  progress?: number;
  chapterId?: string | null;
  volumeId?: string | null;
}

function mapTabToStage(stage: NovelWorkflowResumeTarget["stage"] | null | undefined): NovelWorkflowStage | null {
  if (stage === "story_macro") return "story_macro";
  if (stage === "character") return "character_setup";
  if (stage === "outline") return "volume_strategy";
  if (stage === "structured") return "structured_outline";
  if (stage === "chapter") return "chapter_execution";
  if (stage === "pipeline") return "quality_repair";
  return null;
}

function defaultProgressForStage(stage: NovelWorkflowStage): number {
  return NOVEL_WORKFLOW_STAGE_PROGRESS[stage] ?? 0.08;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeAutoDirectorPhase(value: unknown): NovelWorkflowStage | null {
  if (
    value === "story_macro"
    || value === "character_setup"
    || value === "volume_strategy"
    || value === "structured_outline"
    || value === "chapter_execution"
    || value === "quality_repair"
  ) {
    return value;
  }
  if (value === "front10_ready" || value === "chapter_batch_ready") {
    return "chapter_execution";
  }
  if (value === "replan_required") {
    return "quality_repair";
  }
  return null;
}

function parseSeedResumeTarget(seedPayload: Record<string, unknown>): NovelWorkflowResumeTarget | null {
  if (typeof seedPayload.resumeTarget === "string") {
    return parseResumeTarget(seedPayload.resumeTarget);
  }
  if (isRecord(seedPayload.resumeTarget)) {
    return seedPayload.resumeTarget as unknown as NovelWorkflowResumeTarget;
  }
  return null;
}

function resolveAutoDirectorInitialItem(stage: NovelWorkflowStage): {
  itemKey: string;
  itemLabel: string;
  progress: number;
} {
  if (stage === "story_macro") {
    return {
      itemKey: "book_contract",
      itemLabel: "正在准备 Book Contract 与故事宏观规划",
      progress: DIRECTOR_PROGRESS.bookContract,
    };
  }
  if (stage === "character_setup") {
    return {
      itemKey: "character_setup",
      itemLabel: "正在补齐角色准备",
      progress: DIRECTOR_PROGRESS.characterSetup,
    };
  }
  if (stage === "volume_strategy") {
    return {
      itemKey: "volume_strategy",
      itemLabel: "正在继续生成卷战略",
      progress: DIRECTOR_PROGRESS.volumeStrategy,
    };
  }
  if (stage === "structured_outline") {
    return {
      itemKey: "beat_sheet",
      itemLabel: "正在继续生成第 1 卷节奏板与细化",
      progress: DIRECTOR_PROGRESS.beatSheet,
    };
  }
  if (stage === "chapter_execution") {
    return {
      itemKey: "chapter_execution",
      itemLabel: "正在恢复当前章节批次",
      progress: 0.93,
    };
  }
  if (stage === "quality_repair") {
    return {
      itemKey: "quality_repair",
      itemLabel: "正在恢复当前质量修复批次",
      progress: 0.975,
    };
  }
  return {
    itemKey: "auto_director",
    itemLabel: "等待生成候选方向",
    progress: defaultProgressForStage("auto_director"),
  };
}

export function resolveAutoDirectorBootstrapInitialState(input: {
  lane: NovelWorkflowLane;
  novelId?: string | null;
  seedPayload?: Record<string, unknown>;
}): AutoDirectorBootstrapInitialState | null {
  if (input.lane !== "auto_director" || !input.novelId || !input.seedPayload) {
    return null;
  }

  const directorSession = isRecord(input.seedPayload.directorSession)
    ? input.seedPayload.directorSession
    : null;
  const resumeTarget = parseSeedResumeTarget(input.seedPayload);
  const takeover = isRecord(input.seedPayload.takeover)
    ? input.seedPayload.takeover
    : null;
  const phaseStage = normalizeAutoDirectorPhase(directorSession?.phase);
  const resumeStage = mapTabToStage(resumeTarget?.stage);
  const effectiveStage = normalizeAutoDirectorPhase(takeover?.effectiveStage);
  const stage = phaseStage ?? effectiveStage ?? resumeStage;
  if (!stage || stage === "auto_director" || stage === "project_setup") {
    return null;
  }

  const initialItem = resolveAutoDirectorInitialItem(stage);
  return {
    stage,
    itemKey: initialItem.itemKey,
    itemLabel: initialItem.itemLabel,
    progress: initialItem.progress,
    chapterId: resumeTarget?.chapterId ?? null,
    volumeId: resumeTarget?.volumeId ?? null,
  };
}
