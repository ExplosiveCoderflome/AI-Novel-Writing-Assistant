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

const ENTRY_STEP_USER_LABELS: Record<DirectorTakeoverEntryStep, string> = {
  basic: i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_12dc9530"),
  story_macro: i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_15183ae2"),
  character: i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_3ed577c6"),
  outline: i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_19ac37e4"),
  structured: i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_e2a7c7b0"),
  chapter: i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_663bbefc"),
  pipeline: i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_9b00f20b"),
};

const RUN_MODE_ACTION_LABELS: Record<DirectorRunMode, string> = {
  auto_to_ready: i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_901e9a25"),
  auto_to_execution: i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_a896249b"),
  full_book_autopilot: i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_500cf5d6"),
  stage_review: i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_6daaa38c"),
};

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
    const currentStage = task.currentStage?.trim() || taskSnapshot?.displayState.stageLabel || i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_5081b5c6");
    const currentLabel = task.currentItemLabel?.trim() || taskSnapshot?.displayState.currentAction || i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_df69e3da");
    const nextChapterOrder = chapterProgress?.currentChapterOrder ?? chapterProgress?.activeChapterOrder ?? null;
    return {
      diagnosis: `当前已有导演任务停在「${currentStage}」。`,
      nextStep: nextChapterOrder
        ? `系统检测到章节执行已推进到第 ${nextChapterOrder} 章附近，建议先回到当前任务继续。`
        : `当前任务状态：${currentLabel}。`,
      protectionNotes: [
        `任务状态：${task.status}`,
        currentLabel,
        i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_0e010629"),
      ],
      riskLevel: "safe",
      actionLabel: i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_50f2047b"),
    };
  }
  if (!readiness) {
    return {
      diagnosis: i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_32b26ff5"),
      nextStep: i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_0a116c77"),
      protectionNotes: [i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_2fc7900b")],
      riskLevel: "safe",
      actionLabel: RUN_MODE_ACTION_LABELS[runMode] ?? i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_6daaa38c"),
    };
  }
  const preview = findTakeoverPreview(readiness, entryStep, strategy);
  const entryLabel = ENTRY_STEP_USER_LABELS[preview?.effectiveStep ?? entryStep] ?? i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_6f90bf77");
  const hasCharacters = readiness.snapshot.characterCount > 0;
  const hasVolumes = readiness.snapshot.volumeCount > 0;
  const hasChapters = readiness.snapshot.chapterCount > 0;
  const protectionNotes = [
    hasCharacters ? `保留已创建的 ${readiness.snapshot.characterCount} 个角色资产。` : i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_ab6350b6"),
    hasVolumes ? i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_1a372abe") : i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_48d41db5"),
    hasChapters ? `保留已有 ${readiness.snapshot.chapterCount} 章正文或章节资产。` : i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_e7d35cc2"),
  ];
  const riskLevel = strategy === "restart_current_step" ? "caution" : "safe";
  return {
    diagnosis: `系统检测到项目可以从「${entryLabel}」接上。`,
    nextStep: preview?.summary ?? `AI 会从「${entryLabel}」继续推进。`,
    protectionNotes,
    riskLevel,
    actionLabel: buildPrimaryActionLabel({
      fallback: RUN_MODE_ACTION_LABELS[runMode] ?? i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_6daaa38c"),
      taskSnapshot,
      readiness,
    }),
  };
}

function formatRatio(done: number, total: number): string {
  if (total <= 0) {
    return done > 0 ? `${done} 项` : i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_f61f4cf6");
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
    return i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_21b5d972");
  }
  if ((input.readiness?.snapshot.chapterCount ?? 0) > 0) {
    return i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_aa7745d1");
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
      title: i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_3ead3ec9"),
      status: factSummary?.hasVolumeStrategy || (snapshot?.volumeCount ?? 0) > 0 ? i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_48408afa") : i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_4ed38aeb"),
      detail: snapshot
        ? `${snapshot.volumeCount} 卷；当前卷章节 ${snapshot.firstVolumeChapterCount} 章；已拆范围 ${volumeRanges.map((range) => `第${range.startOrder}-${range.endOrder}章`).join("、") || i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_f61f4cf6")}`
        : i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_c11d6c54"),
    },
    {
      title: i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_b35a6efb"),
      status: formatRatio(syncedChapterCount, plannedChapterCount),
      detail: selectedChapterCount > 0
        ? `当前可执行范围 ${readiness?.executableRange?.startOrder ?? 1}-${readiness?.executableRange?.endOrder ?? selectedChapterCount} 章。`
        : i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_59b7c2f0"),
    },
    {
      title: i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_1f6d47dd"),
      status: formatRatio(detailDone, detailTotal),
      detail: outline?.chapterDetailReady || detailDone > 0
        ? `已准备 ${detailDone} 个章节任务单 / 执行资源。`
        : i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_112a5c82"),
    },
    {
      title: i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_60c6456d"),
      status: formatRatio(drafted, chapterProgress?.totalChapters ?? chapterFacts?.totalChapters ?? plannedChapterCount),
      detail: [
        reviewed > 0 ? `已审校 ${reviewed} 章` : "",
        approved > 0 ? `已通过 ${approved} 章` : "",
        pendingRepair > 0 ? `待处理 ${pendingRepair} 章` : "",
        nextChapterOrder ? `下一章第 ${nextChapterOrder} 章` : "",
      ].filter(Boolean).join("；") || i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_e24795d3"),
    },
  ];

  return {
    cards,
    summary: taskSnapshot?.task
      ? `当前任务：${taskSnapshot.task.currentStage || taskSnapshot.displayState.stageLabel || i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_1772aede")} / ${taskSnapshot.task.currentItemLabel || taskSnapshot.displayState.currentAction || i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_df69e3da")}`
      : i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.detectedAssetProgressCurrentProject"),
  };
}

export function formatTakeoverStartError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.includes(i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_793fb4f8"))) {
    return i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_1dc45f3e");
  }
  if (message.includes(i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_de3efd01"))) {
    return i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_68d3ea47");
  }
  return message || i18next.t("gen.pages.novels.components.novelExistingProjectTakeoverViewModel.gen_2f988e20");
}
