import type {
  ChapterRepairContext,
  ChapterReviewContext,
  ChapterWriteContext,
} from "@ai-novel/shared/types/chapterRuntime";
import { createContextBlock } from "../../../core/contextBudget";
import type { PromptContextBlock } from "../../../core/promptTypes";
import { buildWriterStyleContractText } from "../../../../services/styleEngine/styleContractText";
import {
  buildCharacterGuidanceText,
  buildLedgerItemLine,
  buildParticipantText,
  buildPendingCandidateGuardText,
  buildRelationStageText,
  compactText,
  resolveTargetWordRange,
  takeUnique,
  toListBlock,
} from "../chapterLayeredContextShared";
import { normalizeChapterWriteContext } from "./chapterContextPolicies";

export const WRITER_FORBIDDEN_GROUPS = [
  "full_outline",
  "full_bible",
  "all_characters",
  "all_audit_issues",
  "anti_copy_corpus",
  "raw_rag_dump",
] as const;

export type ChapterWriterBlockMode = "full" | "incremental" | "review" | "repair";

interface ChapterWriterBlockOptions {
  mode?: ChapterWriterBlockMode;
  incrementalContext?: {
    previousRoundSummary?: string | null;
    roundInstruction?: string | null;
    currentSceneProgress?: string | null;
  } | null;
}

export function sanitizeWriterContextBlocks(blocks: PromptContextBlock[]): {
  allowedBlocks: PromptContextBlock[];
  removedBlockIds: string[];
} {
  const forbidden = new Set<string>(WRITER_FORBIDDEN_GROUPS);
  const removedBlockIds = blocks
    .filter((block) => forbidden.has(block.group))
    .map((block) => block.id);
  return {
    allowedBlocks: blocks.filter((block) => !forbidden.has(block.group)),
    removedBlockIds,
  };
}

function hasLedgerPressure(writeContext: ChapterWriteContext): boolean {
  return writeContext.ledgerUrgentItems.length > 0
    || writeContext.ledgerOverdueItems.length > 0
    || writeContext.ledgerPendingItems.length > 0;
}

function hasCharacterResourcePressure(writeContext: ChapterWriteContext): boolean {
  const context = writeContext.characterResourceContext;
  if (!context) {
    return false;
  }
  return context.availableItems.length > 0
    || context.setupNeededItems.length > 0
    || context.blockedItems.length > 0
    || context.highRiskCommittedItems.length > 0
    || context.pendingProposalItems.length > 0
    || context.riskSignals.length > 0;
}

function buildCharacterHardFactsText(writeContext: ChapterWriteContext): string {
  const hardFacts = writeContext.characterHardFacts ?? [];
  if (hardFacts.length === 0) {
    return [
      "【角色硬事实】",
      "当前没有已登记的角色硬事实；不得凭空改写角色阵营、身份、境界、所在地或行动可用性。",
      "如章节任务没有明确要求，不要新增不可逆角色状态。",
    ].join("\n");
  }
  const hasPendingReviewFields = hardFacts.some((fact) => (fact.pendingReviewFields ?? []).length > 0);

  return [
    "【角色硬事实】",
    "以下内容是正文生成前的不可违背写作约束，优先级高于软性人物简介。",
    hasPendingReviewFields
      ? "标记为待确认的当前状态/当前目标只作参考；如与最新剧情冲突，可按合理逻辑调整。"
      : "",
    ...hardFacts.slice(0, 8).map((fact) => {
      const pendingReviewFields = new Set(fact.pendingReviewFields ?? []);
      const parts = takeUnique([
        fact.role ? `角色定位=${fact.role}` : "",
        fact.identityLabel ? `身份=${fact.identityLabel}` : "",
        fact.factionLabel ? `阵营=${fact.factionLabel}` : "",
        fact.stanceLabel ? `立场=${fact.stanceLabel}` : "",
        fact.powerLevel ? `战力=${fact.powerLevel}` : "",
        fact.realm ? `境界=${fact.realm}` : "",
        fact.currentLocation ? `当前位置=${fact.currentLocation}` : "",
        fact.availability ? `可出场状态=${fact.availability}` : "",
        fact.currentState
          ? pendingReviewFields.has("currentState")
            ? `当前状态(待确认，如与最新剧情冲突可按合理逻辑调整)=${fact.currentState}`
            : `当前状态=${fact.currentState}`
          : "",
        fact.currentGoal
          ? pendingReviewFields.has("currentGoal")
            ? `当前目标(待确认，如与最新剧情冲突可按合理逻辑调整)=${fact.currentGoal}`
            : `当前目标=${fact.currentGoal}`
          : "",
        fact.prohibitions.length > 0 ? `禁止误写=${fact.prohibitions.join(" / ")}` : "",
      ], 12);
      return `- ${fact.name}: ${parts.join(" | ")}`;
    }),
  ].filter(Boolean).join("\n");
}

function buildResourceItemLine(item: NonNullable<ChapterWriteContext["characterResourceContext"]>["availableItems"][number]): string {
  const holder = item.holderCharacterName ? `holder=${item.holderCharacterName}` : "holder=unknown";
  const window = item.expectedUseStartChapterOrder || item.expectedUseEndChapterOrder
    ? `window=${item.expectedUseStartChapterOrder ?? "?"}-${item.expectedUseEndChapterOrder ?? "?"}`
    : "";
  const constraints = item.constraints.length > 0 ? `constraints=${item.constraints.slice(0, 2).join(" / ")}` : "";
  return `${item.name} [${item.status}; ${holder}; ${item.narrativeFunction}] ${item.summary}${window ? ` | ${window}` : ""}${constraints ? ` | ${constraints}` : ""}`;
}

function buildResourceProposalLine(item: NonNullable<ChapterWriteContext["characterResourceContext"]>["pendingProposalItems"][number]): string {
  const evidence = item.evidence[0] ? ` | evidence=${item.evidence[0]}` : "";
  return `${item.summary} [risk=${item.riskLevel}; status=${item.status}]${evidence}`;
}

function buildCharacterResourceContextBlock(writeContext: ChapterWriteContext): string {
  const context = writeContext.characterResourceContext;
  if (!context) {
    return "";
  }
  return [
    `Resource ledger summary: ${context.summary}`,
    toListBlock("Available resources", context.availableItems.slice(0, 6).map(buildResourceItemLine)),
    toListBlock("Needs setup before use", context.setupNeededItems.slice(0, 5).map(buildResourceItemLine)),
    toListBlock("Unavailable or risky to reuse", context.blockedItems.slice(0, 5).map(buildResourceItemLine)),
    toListBlock("High-risk committed resources", context.highRiskCommittedItems.slice(0, 4).map(buildResourceItemLine)),
    toListBlock("Pending resource proposals (not committed)", context.pendingProposalItems.slice(0, 4).map(buildResourceProposalLine)),
    toListBlock("Resource risk signals", context.riskSignals.slice(0, 5).map((item) => `${item.severity}: ${item.summary}`)),
  ].filter(Boolean).join("\n");
}

function shouldIncludeCharacterDynamics(
  writeContext: ChapterWriteContext,
  mode: ChapterWriterBlockMode,
): boolean {
  if (mode === "incremental") {
    return writeContext.activeRelationStages.length > 0
      || writeContext.pendingCandidateGuards.length > 0;
  }
  if (mode === "repair") {
    return writeContext.characterBehaviorGuides.length > 0 || writeContext.activeRelationStages.length > 0;
  }
  return writeContext.characterBehaviorGuides.length > 0
    || writeContext.activeRelationStages.length > 0
    || writeContext.pendingCandidateGuards.length > 0;
}

function buildIncrementalRoundContextBlock(
  incrementalContext: ChapterWriterBlockOptions["incrementalContext"],
): PromptContextBlock | null {
  if (!incrementalContext) {
    return null;
  }
  const content = [
    incrementalContext.previousRoundSummary?.trim()
      ? `Previous round summary: ${incrementalContext.previousRoundSummary.trim()}`
      : "",
    incrementalContext.currentSceneProgress?.trim()
      ? `Current scene progress: ${incrementalContext.currentSceneProgress.trim()}`
      : "",
    incrementalContext.roundInstruction?.trim()
      ? `Current round instruction: ${incrementalContext.roundInstruction.trim()}`
      : "",
  ].filter(Boolean).join("\n");
  if (!content) {
    return null;
  }
  return createContextBlock({
    id: "incremental_round_context",
    group: "incremental_round_context",
    priority: 99,
    required: true,
    content,
  });
}

function buildChapterBoundaryContextBlock(writeContext: ChapterWriteContext): PromptContextBlock | null {
  const boundary = writeContext.chapterBoundary;
  if (!boundary) {
    return null;
  }
  return createContextBlock({
    id: "chapter_boundary",
    group: "chapter_boundary",
    priority: 99,
    required: true,
    allowSummary: false,
    content: [
      "Chapter boundary:",
      boundary.exclusiveEvent ? `Exclusive event: ${compactText(boundary.exclusiveEvent)}` : "",
      boundary.entryState ? `Entry state: ${compactText(boundary.entryState)}` : "",
      boundary.endingState ? `Ending state: ${compactText(boundary.endingState)}` : "",
      boundary.nextChapterEntryState ? `Next chapter entry state: ${compactText(boundary.nextChapterEntryState)}` : "",
      typeof boundary.allowedRevealLevel === "number" ? `Allowed reveal level: ${boundary.allowedRevealLevel}` : "",
      toListBlock("Do not cross", boundary.doNotCross ?? []),
      toListBlock("Protected reveals", boundary.protectedReveals ?? []),
    ].filter(Boolean).join("\n"),
  });
}

export function buildChapterWriterContextBlocks(
  writeContext: ChapterWriteContext,
  options: ChapterWriterBlockOptions = {},
): PromptContextBlock[] {
  writeContext = normalizeChapterWriteContext(writeContext);
  const mode = options.mode ?? "full";
  const isIncremental = mode === "incremental";
  const includeVolumeWindow = mode === "full" || mode === "review";
  const includePayoffLedger = mode === "full" && hasLedgerPressure(writeContext);
  const includePayoffDirectives = writeContext.payoffDirectives.length > 0;
  const hasObligationContract = Object.values(writeContext.obligationContract).some((items) => items.length > 0);
  const includeCharacterResources = !isIncremental && hasCharacterResourcePressure(writeContext);
  const includeCharacterDynamics = shouldIncludeCharacterDynamics(writeContext, mode);
  const includeOpenConflicts = !isIncremental && writeContext.openConflictSummaries.length > 0;
  const includeRecentChapters = mode === "full" && writeContext.recentChapterSummaries.length > 0;
  const includeStyleContract = mode !== "incremental" && Boolean(writeContext.styleContract);
  const includeContinuationConstraints = mode === "full" && writeContext.continuationConstraints.length > 0;
  const wordRange = resolveTargetWordRange(writeContext.chapterMission.targetWordCount);
  const blocks: Array<PromptContextBlock | null> = [
    createContextBlock({
      id: "chapter_mission",
      group: "chapter_mission",
      priority: 100,
      required: true,
      content: [
        `章节任务：${writeContext.chapterMission.title}`,
        `目标：${writeContext.chapterMission.objective}`,
        `预期效果：${writeContext.chapterMission.expectation}`,
        `状态驱动的下一步动作：${writeContext.nextAction}`,
        writeContext.chapterMission.planRole ? `计划角色：${writeContext.chapterMission.planRole}` : "",
        wordRange.targetWordCount != null
          ? `目标篇幅：约 ${wordRange.targetWordCount} 个中文字符（可接受范围 ${wordRange.minWordCount}-${wordRange.maxWordCount}；不要明显低于最低值）。`
          : "",
        writeContext.completedMilestones.length > 0
          ? toListBlock("已完成事项（不得重复追求或重新触发）", writeContext.completedMilestones, "无")
          : "",
        toListBlock("必须推进", writeContext.chapterMission.mustAdvance, "无"),
        toListBlock("必须保留", writeContext.chapterMission.mustPreserve, "无"),
        toListBlock("风险提示", writeContext.chapterMission.riskNotes, "无"),
        writeContext.chapterMission.taskSheet
          ? `原始任务单：\n${writeContext.chapterMission.taskSheet}`
          : "",
        writeContext.chapterMission.hookTarget ? `章末钩子：${writeContext.chapterMission.hookTarget}` : "",
      ].filter(Boolean).join("\n"),
    }),
    writeContext.previousChapterTail
      ? createContextBlock({
        id: "previous_chapter_tail",
        group: "previous_chapter_tail",
        priority: 100,
        required: true,
        allowSummary: false,
        content: [
          "上一章实际尾段（本章开头必须直接承接这里的时间、地点、人物状态和未兑现动作）：",
          writeContext.previousChapterTail,
        ].join("\n"),
      })
      : null,
    createContextBlock({
      id: "reader_experience",
      group: "reader_experience",
      priority: 100,
      required: true,
      allowSummary: false,
      content: [
        "读者体验合同（本章正文、验收与修复共用）：",
        `读者核心问题：${writeContext.readerExperience.readerQuestion}`,
        `本章可见回报：${writeContext.readerExperience.promisedReward}`,
        `回报级别：${writeContext.readerExperience.rewardLevel}`,
        `主角即时欲望：${writeContext.readerExperience.protagonistWant}`,
        `主要阻力：${writeContext.readerExperience.primaryResistance}`,
        `关键转折：${writeContext.readerExperience.keyTurn}`,
        `情绪位移：${writeContext.readerExperience.emotionalShift}`,
        `信息交付：${writeContext.readerExperience.informationReveal}`,
        `章末净变化：${writeContext.readerExperience.netChange}`,
        toListBlock(
          "继承的钩子责任（优先回应后再制造新问题）",
          writeContext.readerExperience.inheritedHookResponsibilities,
          "无明确旧钩子责任",
        ),
        `章末追读钩子：${writeContext.readerExperience.endingHook}`,
      ].join("\n"),
    }),
    hasObligationContract
      ? createContextBlock({
        id: "obligation_contract",
        group: "obligation_contract",
        priority: 99,
        required: true,
        allowSummary: false,
        content: [
          "章节执行义务：",
          toListBlock("本章必须命中", writeContext.obligationContract.mustHitNow, "无"),
          toListBlock("必须保留", writeContext.obligationContract.mustPreserve, "无"),
          toListBlock("必须触碰的伏笔", writeContext.obligationContract.requiredPayoffTouches, "无"),
          toListBlock("必须出场的角色", writeContext.obligationContract.requiredCharacterAppearances, "无"),
          toListBlock("必须变化的目标", writeContext.obligationContract.requiredGoalChanges, "无"),
          toListBlock("可延后处理", writeContext.obligationContract.canDefer, "无"),
          toListBlock("禁止越界", writeContext.obligationContract.forbiddenCrossings, "无"),
        ].filter(Boolean).join("\n"),
      })
      : null,
    includePayoffDirectives
      ? createContextBlock({
        id: "payoff_directives",
        group: "payoff_directives",
        priority: 98,
        required: true,
        allowSummary: false,
        content: [
          "Payoff directives:",
          ...writeContext.payoffDirectives.map((item) => [
            `- ${item.title} [${item.operation}]`,
            item.ledgerKey ? `ledger=${item.ledgerKey}` : "",
            item.reason ? `reason=${item.reason}` : "",
            item.forbiddenReveal ? `forbiddenReveal=${item.forbiddenReveal}` : "",
          ].filter(Boolean).join(" | ")),
        ].join("\n"),
      })
      : null,
    createContextBlock({
      id: "state_goal",
      group: "state_goal",
      priority: 97,
      required: Boolean(writeContext.chapterStateGoal),
      content: writeContext.chapterStateGoal
        ? [
             `State goal: ${writeContext.chapterStateGoal.summary}`,
             toListBlock("Target conflicts", writeContext.chapterStateGoal.targetConflicts),
             toListBlock("Target relationships", writeContext.chapterStateGoal.targetRelationships),
             toListBlock("Protected secrets", writeContext.protectedSecrets),
           ].filter(Boolean).join("\n")
        : "",
    }),
    buildIncrementalRoundContextBlock(options.incrementalContext),
    includeVolumeWindow
      ? createContextBlock({
        id: "volume_window",
        group: "volume_window",
        priority: 96,
        content: writeContext.volumeWindow
          ? [
              `Current volume: ${writeContext.volumeWindow.title}`,
              `Volume mission: ${writeContext.volumeWindow.missionSummary}`,
              writeContext.volumeWindow.coreReward
                ? `Current volume reader reward: ${writeContext.volumeWindow.coreReward}`
                : "",
              writeContext.volumeWindow.readerRewardLadder
                ? `Book reader reward ladder: ${writeContext.volumeWindow.readerRewardLadder}`
                : "",
              toListBlock("Current volume pending payoffs", writeContext.volumeWindow.pendingPayoffs.slice(0, 3)),
              writeContext.volumeWindow.keyMilestoneGuards.length > 0
                ? toListBlock(
                  "Volume key milestone guards — pacing constraints",
                  writeContext.volumeWindow.keyMilestoneGuards
                    .filter((guard) => guard.status !== "done")
                    .map((guard) => `[${guard.targetChapterRange}] ${guard.event}: ${guard.note}`),
                )
                : "",
            ].filter(Boolean).join("\n")
          : "Current volume: none",
      })
      : null,
    writeContext.narrativeProgressHint
      ? createContextBlock({
        id: "narrative_progress_hint",
        group: "narrative_progress_hint",
        priority: 98,
        required: false,
        content: writeContext.narrativeProgressHint,
      })
      : null,
    includePayoffLedger
      ? createContextBlock({
        id: "payoff_ledger",
        group: "payoff_ledger",
        priority: 95,
        content: [
          writeContext.ledgerSummary
            ? `Payoff ledger summary: pending=${writeContext.ledgerSummary.pendingCount}, urgent=${writeContext.ledgerSummary.urgentCount}, overdue=${writeContext.ledgerSummary.overdueCount}`
            : "Payoff ledger summary: none",
          toListBlock("Urgent payoffs", writeContext.ledgerUrgentItems.map((item) => buildLedgerItemLine(item, "urgent"))),
          toListBlock("Overdue payoffs", writeContext.ledgerOverdueItems.map((item) => buildLedgerItemLine(item, "overdue"))),
          toListBlock(
            "Active pending payoffs",
            writeContext.ledgerPendingItems.slice(0, 3).map((item) => buildLedgerItemLine(item, "pending")),
          ),
        ].join("\n"),
      })
      : null,
    createContextBlock({
      id: "character_hard_facts",
      group: "character_hard_facts",
      priority: 99,
      required: true,
      allowSummary: false,
      content: buildCharacterHardFactsText(writeContext),
    }),
    createContextBlock({
      id: "participant_subset",
      group: "participant_subset",
      priority: 92,
      required: true,
      content: buildParticipantText(writeContext),
    }),
    includeCharacterDynamics
      ? createContextBlock({
        id: "character_dynamics",
        group: "character_dynamics",
        priority: 91,
        content: [
          buildCharacterGuidanceText(writeContext),
          buildRelationStageText(writeContext),
          buildPendingCandidateGuardText(writeContext),
        ].join("\n\n"),
      })
      : null,
    includeCharacterResources
      ? createContextBlock({
        id: "character_resource_context",
        group: "character_resource_context",
        priority: 90,
        required: mode === "review" || mode === "repair",
        content: buildCharacterResourceContextBlock(writeContext),
      })
      : null,
    createContextBlock({
      id: "local_state",
      group: "local_state",
      priority: 89,
      required: true,
      content: `写作前当前局面：\n${writeContext.localStateSummary}`,
    }),
    includeOpenConflicts
      ? createContextBlock({
        id: "open_conflicts",
        group: "open_conflicts",
        priority: 88,
        content: toListBlock("Open conflicts", writeContext.openConflictSummaries.slice(0, 6)),
      })
      : null,
    includeRecentChapters
      ? createContextBlock({
        id: "recent_chapters",
        group: "recent_chapters",
        priority: 86,
        content: toListBlock("Recent chapter summaries", writeContext.recentChapterSummaries),
      })
      : null,
    mode === "full"
      ? createContextBlock({
        id: "opening_constraints",
        group: "opening_constraints",
        priority: 80,
        content: [
          `Opening anti-repeat hint:\n${writeContext.openingAntiRepeatHint}`,
          writeContext.recentScenePatterns.length > 0
            ? toListBlock(
              "Scene pattern blacklist — do NOT repeat these exact time+location+action combinations",
              writeContext.recentScenePatterns.slice(0, 6),
            )
            : "",
        ].filter(Boolean).join("\n\n"),
      })
      : null,
    includeStyleContract
      ? createContextBlock({
        id: "style_contract",
        group: "style_contract",
        priority: 74,
        required: mode === "full",
        content: buildWriterStyleContractText(writeContext.styleContract),
      })
      : null,
    includeContinuationConstraints
      ? createContextBlock({
        id: "continuation_constraints",
        group: "continuation_constraints",
        priority: 74,
        required: mode === "full",
        allowSummary: false,
        content: toListBlock("Continuation constraints", writeContext.continuationConstraints),
      })
      : null,
  ];
  return blocks.filter((block): block is PromptContextBlock => block !== null && block.content.trim().length > 0);
}

export function buildChapterReviewContextBlocks(reviewContext: ChapterReviewContext): PromptContextBlock[] {
  return [
    ...buildChapterWriterContextBlocks(reviewContext, { mode: "review" }),
    buildChapterBoundaryContextBlock(reviewContext),
    createContextBlock({
      id: "structure_obligations",
      group: "structure_obligations",
      priority: 94,
      required: true,
      content: toListBlock("Structure obligations", reviewContext.structureObligations),
    }),
    createContextBlock({
      id: "world_rules",
      group: "world_rules",
      priority: 84,
      content: toListBlock("Relevant world rules", reviewContext.worldRules),
    }),
    createContextBlock({
      id: "historical_issues",
      group: "historical_issues",
      priority: 82,
      content: toListBlock("Historical unresolved issues", reviewContext.historicalIssues),
    }),
  ].filter((block): block is PromptContextBlock => block !== null && block.content.trim().length > 0);
}

export function buildChapterRepairContextBlocks(repairContext: ChapterRepairContext): PromptContextBlock[] {
  return [
    ...buildChapterWriterContextBlocks(repairContext.writeContext, { mode: "repair" }),
    createContextBlock({
      id: "repair_issues",
      group: "repair_issues",
      priority: 100,
      required: true,
      content: repairContext.issues.length > 0
        ? [
            "Repair issues:",
            ...repairContext.issues.map((issue) => (
              `- ${issue.severity}/${issue.category}: ${issue.evidence} | fix: ${issue.fixSuggestion}`
            )),
          ].join("\n")
        : "Repair issues: none",
    }),
    buildChapterBoundaryContextBlock(repairContext.writeContext),
    createContextBlock({
      id: "structure_obligations",
      group: "structure_obligations",
      priority: 95,
      required: true,
      content: toListBlock("Structure obligations", repairContext.structureObligations),
    }),
    createContextBlock({
      id: "repair_boundaries",
      group: "repair_boundaries",
      priority: 96,
      required: true,
      content: toListBlock("Allowed edit boundaries", repairContext.allowedEditBoundaries),
    }),
    createContextBlock({
      id: "world_rules",
      group: "world_rules",
      priority: 84,
      content: toListBlock("Relevant world rules", repairContext.worldRules),
    }),
    createContextBlock({
      id: "historical_issues",
      group: "historical_issues",
      priority: 82,
      content: toListBlock("Historical unresolved issues", repairContext.historicalIssues),
    }),
  ].filter((block): block is PromptContextBlock => block !== null && block.content.trim().length > 0);
}
