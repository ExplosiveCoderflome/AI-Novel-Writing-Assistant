import i18next from "i18next";
import type {
  DirectorTaskSnapshot,
} from "@ai-novel/shared/types/directorRuntime";
import type {
  DirectorAutoExecutionPlan,
  DirectorRunMode,
  DirectorTakeoverEntryReadiness,
  DirectorTakeoverEntryStep,
  DirectorTakeoverPreview,
  DirectorTakeoverReadinessResponse,
  DirectorTakeoverStrategy,
} from "@ai-novel/shared/types/novelDirector";

type TakeoverScopeMode = "book" | "chapter_range" | "volume";

export interface TakeoverGuidanceViewModel {
  diagnosis: string;
  nextStep: string;
  protectionNotes: string[];
  riskLevel: "safe" | "caution";
  actionLabel: string;
}

export interface TakeoverProgressCard {
  title: string;
  status: string;
  detail: string;
}

export interface TakeoverProgressInspectionViewModel {
  cards: TakeoverProgressCard[];
  summary: string;
}

export interface TakeoverChapterTargetViewModel {
  startOrder: number;
  maxOrder: number;
  selectedOrder: number;
  plan: DirectorAutoExecutionPlan;
  actionLabel: string;
  summary: string;
}

export function getEntryStepUserLabel(step: DirectorTakeoverEntryStep): string {
  const map: Record<DirectorTakeoverEntryStep, string> = {
    basic: i18next.t("novels.takeover.entry.basic", { defaultValue: "项目设定" }),
    story_macro: i18next.t("novels.takeover.entry.story_macro", { defaultValue: "故事宏观规划" }),
    world: i18next.t("novels.takeover.entry.world", { defaultValue: "世界观准备" }),
    character: i18next.t("novels.takeover.entry.character", { defaultValue: "角色准备" }),
    outline: i18next.t("novels.takeover.entry.outline", { defaultValue: "卷规划" }),
    structured: i18next.t("novels.takeover.entry.structured", { defaultValue: "节奏拆章" }),
    chapter: i18next.t("novels.takeover.entry.chapter", { defaultValue: "章节执行" }),
    pipeline: i18next.t("novels.takeover.entry.pipeline", { defaultValue: "质量修复" }),
  };
  return map[step] ?? step;
}

export function getRunModeActionLabel(runMode: DirectorRunMode): string {
  const map: Record<DirectorRunMode, string> = {
    auto_to_ready: i18next.t("novels.takeover.runMode.auto_to_ready", { defaultValue: "继续推进到可开写" }),
    auto_to_execution: i18next.t("novels.takeover.runMode.auto_to_execution", { defaultValue: "按范围继续推进" }),
    full_book_autopilot: i18next.t("novels.takeover.runMode.full_book_autopilot", { defaultValue: "接管整本书继续推进" }),
    stage_review: i18next.t("novels.takeover.runMode.stage_review", { defaultValue: "继续推进" }),
  };
  return map[runMode] ?? i18next.t("common.actions.continue", { defaultValue: "继续推进" });
}

export function isTakeoverEntryStepAllowedForScope(
  entryStep: DirectorTakeoverEntryStep,
  scopeMode: TakeoverScopeMode,
): boolean {
  if (scopeMode === "chapter_range") {
    return entryStep === "structured" || entryStep === "chapter" || entryStep === "pipeline";
  }
  if (scopeMode === "volume") {
    return entryStep === "outline" || entryStep === "structured" || entryStep === "chapter" || entryStep === "pipeline";
  }
  return true;
}

export function resolveRecommendedTakeoverEntryStep(
  readiness: DirectorTakeoverReadinessResponse | null,
  scopeMode: TakeoverScopeMode,
): DirectorTakeoverEntryStep | null {
  if (!readiness) {
    return null;
  }
  const allowed = (entry: DirectorTakeoverEntryReadiness) => (
    entry.available && isTakeoverEntryStepAllowedForScope(entry.step, scopeMode)
  );
  return (
    readiness.entrySteps.find((entry) => entry.recommended && allowed(entry))
    ?? readiness.entrySteps.find(allowed)
    ?? null
  )?.step ?? null;
}

export function findTakeoverPreview(
  readiness: DirectorTakeoverReadinessResponse | null,
  entryStep: DirectorTakeoverEntryStep,
  strategy: DirectorTakeoverStrategy,
): DirectorTakeoverPreview | null {
  return readiness?.entrySteps
    .find((entry) => entry.step === entryStep)
    ?.previews.find((preview) => preview.strategy === strategy) ?? null;
}

export function buildTakeoverGuidance(
  readiness: DirectorTakeoverReadinessResponse | null,
  entryStep: DirectorTakeoverEntryStep,
  strategy: DirectorTakeoverStrategy,
  runMode: DirectorRunMode,
  taskSnapshot?: DirectorTaskSnapshot | null,
): TakeoverGuidanceViewModel {
  const task = taskSnapshot?.task ?? null;
  const chapterProgress = taskSnapshot?.chapterProgress ?? taskSnapshot?.projection?.chapterExecutionProgress ?? null;
  if (task && (task.status === "queued" || task.status === "running" || task.status === "waiting_approval")) {
    const currentStage = task.currentStage?.trim() || taskSnapshot?.displayState.stageLabel || "当前任务";
    const currentLabel = task.currentItemLabel?.trim() || taskSnapshot?.displayState.currentAction || "等待继续";
    const nextChapterOrder = chapterProgress?.currentChapterOrder ?? chapterProgress?.activeChapterOrder ?? null;
    return {
      diagnosis: `当前已有导演任务停在「${currentStage}」。`,
      nextStep: nextChapterOrder
        ? `系统检测到章节执行已推进到第 ${nextChapterOrder} 章附近，建议先回到当前任务继续。`
        : `当前任务状态：${currentLabel}。`,
      protectionNotes: [
        `任务状态：${task.status}`,
        currentLabel,
        "继续当前任务不会新开一条重复接管。",
      ],
      riskLevel: "safe",
      actionLabel: i18next.t("dict.gen_50f2047b"),
    };
  }
  if (!readiness) {
    return {
      diagnosis: "正在读取项目进度，读取完成后会给出推荐接续位置。",
      nextStep: "读取完成后即可继续推进。",
      protectionNotes: ["默认保留已有写作资产。"],
      riskLevel: "safe",
      actionLabel: getRunModeActionLabel(runMode),
    };
  }
  const preview = findTakeoverPreview(readiness, entryStep, strategy);
  const entryLabel = getEntryStepUserLabel(preview?.effectiveStep ?? entryStep);
  const hasCharacters = readiness.snapshot.characterCount > 0;
  const hasVolumes = readiness.snapshot.volumeCount > 0;
  const hasChapters = readiness.snapshot.chapterCount > 0;
  const protectionNotes = [
    hasCharacters ? `保留已创建的 ${readiness.snapshot.characterCount} 个角色资产。` : "没有检测到已创建角色，AI 会补齐角色准备。",
    hasVolumes ? "沿用已有卷规划资产，只补后续缺口。" : "没有检测到卷规划，AI 会继续生成卷规划。",
    hasChapters ? `保留已有 ${readiness.snapshot.chapterCount} 章正文或章节资产。` : "没有检测到已生成正文。",
  ];
  const riskLevel = strategy === "restart_current_step" ? "caution" : "safe";
  return {
    diagnosis: `系统检测到项目可以从「${entryLabel}」接上。`,
    nextStep: preview?.summary ?? `AI 会从「${entryLabel}」继续推进。`,
    protectionNotes,
    riskLevel,
    actionLabel: buildPrimaryActionLabel({
      fallback: getRunModeActionLabel(runMode),
      taskSnapshot,
      readiness,
    }),
  };
}

function formatRatio(done: number, total: number): string {
  if (total <= 0) {
    return done > 0 ? `${done} 项` : "暂无";
  }
  return `${done} / ${total}`;
}

function buildPrimaryActionLabel(input: {
  fallback: string;
  taskSnapshot?: DirectorTaskSnapshot | null;
  readiness?: DirectorTakeoverReadinessResponse | null;
}): string {
  const progress = input.taskSnapshot?.chapterProgress
    ?? input.taskSnapshot?.projection?.chapterExecutionProgress
    ?? null;
  if (progress?.currentChapterOrder) {
    return `继续写第 ${progress.currentChapterOrder} 章`;
  }
  const drafted = progress?.draftedChapterCount ?? input.readiness?.snapshot.generatedChapterCount ?? 0;
  const approved = progress?.approvedChapterCount ?? input.readiness?.snapshot.approvedChapterCount ?? 0;
  if (drafted > approved) {
    return i18next.t("dict.gen_21b5d972");
  }
  if ((input.readiness?.snapshot.chapterCount ?? 0) > 0) {
    return i18next.t("dict.gen_aa7745d1");
  }
  return input.fallback;
}

function normalizePositiveOrder(value: number | null | undefined): number | null {
  if (!Number.isFinite(value ?? NaN) || !value || value < 1) {
    return null;
  }
  return Math.max(1, Math.round(value));
}

function maxNormalizedOrder(values: Array<number | null | undefined>): number | null {
  const normalized = values
    .map(normalizePositiveOrder)
    .filter((value): value is number => Boolean(value));
  if (normalized.length === 0) {
    return null;
  }
  return Math.max(...normalized);
}

export function buildTakeoverChapterTarget(
  readiness: DirectorTakeoverReadinessResponse | null,
  taskSnapshot?: DirectorTaskSnapshot | null,
  selectedOrder?: number | null,
): TakeoverChapterTargetViewModel | null {
  const progress = taskSnapshot?.chapterProgress
    ?? taskSnapshot?.projection?.chapterExecutionProgress
    ?? null;
  const snapshot = readiness?.snapshot ?? null;
  const writtenChapterCount = maxNormalizedOrder([
    progress?.draftedChapterCount,
    progress?.completedChapters,
    snapshot?.generatedChapterCount,
  ]);
  const startOrder = maxNormalizedOrder([
    progress?.currentChapterOrder
      ?? null,
    progress?.activeChapterOrder
      ?? null,
    readiness?.executableRange?.nextChapterOrder
      ?? null,
    writtenChapterCount ? writtenChapterCount + 1 : null,
    snapshot?.approvedChapterCount ? snapshot.approvedChapterCount + 1 : null,
  ]);
  const totalChapters = maxNormalizedOrder([
    progress?.totalChapters
      ?? null,
    readiness?.executableRange?.endOrder
      ?? null,
    snapshot?.chapterCount
      ?? null,
    snapshot?.firstVolumeChapterCount
      ?? null,
  ]);
  if (!startOrder || !totalChapters || startOrder > totalChapters) {
    return null;
  }
  const normalizedSelected = normalizePositiveOrder(selectedOrder ?? null);
  const selected = normalizedSelected
    ? Math.min(Math.max(normalizedSelected, startOrder), totalChapters)
    : startOrder;
  const plan: DirectorAutoExecutionPlan = {
    mode: "chapter_range",
    startOrder,
    endOrder: selected,
    autoReview: true,
    autoRepair: true,
  };
  return {
    startOrder,
    maxOrder: totalChapters,
    selectedOrder: selected,
    plan,
    actionLabel: `推进至第 ${selected} 章`,
    summary: selected === startOrder
      ? `从第 ${startOrder} 章继续推进。`
      : `从第 ${startOrder} 章开始，连续推进到第 ${selected} 章。`,
  };
}

export function buildTakeoverProgressInspection(
  readiness: DirectorTakeoverReadinessResponse | null,
  taskSnapshot?: DirectorTaskSnapshot | null,
): TakeoverProgressInspectionViewModel {
  const factSummary = taskSnapshot?.factSummary ?? taskSnapshot?.projection?.factSummary ?? null;
  const outline = factSummary?.outlineFacts ?? null;
  const chapterFacts = factSummary?.chapterExecutionFacts ?? null;
  const repairFacts = factSummary?.repairFacts ?? null;
  const chapterProgress = taskSnapshot?.chapterProgress ?? taskSnapshot?.projection?.chapterExecutionProgress ?? null;
  const snapshot = readiness?.snapshot ?? null;
  const volumeRanges = snapshot?.volumeChapterRanges ?? [];
  const syncedChapterCount = outline?.syncedChapterCount ?? snapshot?.chapterCount ?? 0;
  const plannedChapterCount = outline?.plannedChapterCount ?? snapshot?.chapterCount ?? chapterProgress?.totalChapters ?? 0;
  const selectedChapterCount = outline?.selectedChapterCount ?? readiness?.executableRange?.totalChapterCount ?? 0;
  const detailDone = outline?.completedDetailSteps ?? snapshot?.firstVolumePreparedChapterCount ?? 0;
  const detailTotal = outline?.totalDetailSteps ?? selectedChapterCount;
  const drafted = chapterProgress?.draftedChapterCount ?? chapterFacts?.draftedChapterCount ?? snapshot?.generatedChapterCount ?? 0;
  const approved = chapterProgress?.approvedChapterCount ?? chapterFacts?.approvedChapterCount ?? snapshot?.approvedChapterCount ?? 0;
  const reviewed = chapterFacts?.reviewedChapterCount ?? repairFacts?.reviewedChapterCount ?? 0;
  const pendingRepair = chapterProgress?.needsRepairChapters ?? chapterFacts?.needsRepairChapters ?? snapshot?.pendingRepairChapterCount ?? 0;
  const nextChapterOrder = chapterProgress?.currentChapterOrder ?? readiness?.executableRange?.nextChapterOrder ?? null;

  const cards: TakeoverProgressCard[] = [
    {
      title: i18next.t("dict.gen_3ead3ec9"),
      status: factSummary?.hasVolumeStrategy || (snapshot?.volumeCount ?? 0) > 0 ? "已具备卷战略" : "待补卷战略",
      detail: snapshot
        ? `${snapshot.volumeCount} 卷；当前卷章节 ${snapshot.firstVolumeChapterCount} 章；已拆范围 ${volumeRanges.map((range) => `第${range.startOrder}-${range.endOrder}章`).join("、") || "暂无"}`
        : "正在读取卷规划。",
    },
    {
      title: i18next.t("dict.gen_b35a6efb"),
      status: formatRatio(syncedChapterCount, plannedChapterCount),
      detail: selectedChapterCount > 0
        ? `当前可执行范围 ${readiness?.executableRange?.startOrder ?? 1}-${readiness?.executableRange?.endOrder ?? selectedChapterCount} 章。`
        : "尚未检测到可执行章节范围。",
    },
    {
      title: i18next.t("dict.gen_1f6d47dd"),
      status: formatRatio(detailDone, detailTotal),
      detail: outline?.chapterDetailReady || detailDone > 0
        ? `已准备 ${detailDone} 个章节任务单 / 执行资源。`
        : "尚未检测到章节细化资源。",
    },
    {
      title: i18next.t("dict.gen_60c6456d"),
      status: formatRatio(drafted, chapterProgress?.totalChapters ?? chapterFacts?.totalChapters ?? plannedChapterCount),
      detail: [
        reviewed > 0 ? `已审校 ${reviewed} 章` : "",
        approved > 0 ? `已通过 ${approved} 章` : "",
        pendingRepair > 0 ? `待处理 ${pendingRepair} 章` : "",
        nextChapterOrder ? `下一章第 ${nextChapterOrder} 章` : "",
      ].filter(Boolean).join("；") || "尚未开始正文生产。",
    },
  ];

  return {
    cards,
    summary: taskSnapshot?.task
      ? `当前任务：${taskSnapshot.task.currentStage || taskSnapshot.displayState.stageLabel || "自动导演"} / ${taskSnapshot.task.currentItemLabel || taskSnapshot.displayState.currentAction || "等待继续"}`
      : "以下为当前项目已检测到的资产进度。",
  };
}

export function formatTakeoverStartError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.includes("章节范围只能从节奏拆章、章节执行或质量修复开始")) {
    return i18next.t("dict.gen_1dc45f3e");
  }
  if (message.includes("当前已有自动导演任务")) {
    return i18next.t("dict.gen_68d3ea47");
  }
  return message || "启动自动导演接管失败。";
}
