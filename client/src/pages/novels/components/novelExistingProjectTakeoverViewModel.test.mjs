import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTakeoverChapterTarget,
  buildTakeoverGuidance,
  buildTakeoverProgressInspection,
  formatTakeoverStartError,
  resolveRecommendedTakeoverEntryStep,
} from "./novelExistingProjectTakeoverViewModel.ts";

function buildReadiness(overrides = {}) {
  return {
    novelId: "novel-1",
    novelTitle: "测试小说",
    hasActiveTask: false,
    activeTaskId: null,
    snapshot: {
      hasStoryMacroPlan: true,
      hasBookContract: true,
      characterCount: 3,
      chapterCount: 0,
      volumeCount: 0,
      firstVolumeChapterCount: 0,
    },
    stages: [],
    entrySteps: [
      {
        step: "story_macro",
        label: "故事宏观规划",
        description: "补齐书级规划",
        available: true,
        recommended: false,
        status: "complete",
        reason: "已具备书级规划",
        previews: [],
      },
      {
        step: "character",
        label: "角色准备",
        description: "补齐角色资产",
        available: true,
        recommended: false,
        status: "complete",
        reason: "角色资产已具备",
        previews: [],
      },
      {
        step: "outline",
        label: "卷战略",
        description: "补齐卷规划",
        available: true,
        recommended: true,
        status: "missing",
        reason: "可以从卷战略继续",
        previews: [
          {
            strategy: "continue_existing",
            summary: "AI 会沿用已有角色，继续生成卷战略与卷骨架。",
            effectSummary: "不会重建已有角色。",
            effectiveStep: "outline",
            effectiveStage: "outline",
            skipSteps: ["story_macro", "character"],
            continueStep: "outline",
            restartStep: null,
            usesCurrentBatch: false,
            impactNotes: ["保留已有资产。"],
          },
        ],
      },
    ],
    activePipelineJob: null,
    latestCheckpoint: null,
    executableRange: null,
    ...overrides,
  };
}

test("takeover recommendation chooses the available recommended entry for the current project", () => {
  const step = resolveRecommendedTakeoverEntryStep(buildReadiness(), "book");

  assert.equal(step, "outline");
});

test("takeover guidance explains the recommended continuation and protected assets", () => {
  const guidance = buildTakeoverGuidance(
    buildReadiness(),
    "outline",
    "continue_existing",
    "auto_to_ready",
  );

  assert.match(guidance.diagnosis, /卷规划/);
  assert.match(guidance.nextStep, /沿用已有角色/);
  assert.equal(guidance.actionLabel, "继续推进到可开写");
  assert.ok(guidance.protectionNotes.some((note) => note.includes("3 个角色资产")));
});

test("takeover guidance prefers an active context task over a new takeover", () => {
  const guidance = buildTakeoverGuidance(
    buildReadiness(),
    "outline",
    "continue_existing",
    "auto_to_ready",
    {
      task: {
        id: "task-1",
        novelId: "novel-1",
        status: "waiting_approval",
        currentStage: "章节执行",
        currentItemKey: "chapter_execution",
        currentItemLabel: "正在查看第1章执行面板",
        progress: 0.5,
        checkpointType: null,
        checkpointSummary: null,
        lastError: null,
        pendingManualRecovery: false,
        cancelRequestedAt: null,
      },
      run: null,
      activeStep: null,
      latestCommand: null,
      runtime: null,
      projection: null,
      recentEvents: [],
      artifacts: [],
      factSummary: null,
      chapterProgress: {
        totalChapters: 40,
        draftedChapterCount: 10,
        approvedChapterCount: 5,
        completedChapters: 5,
        needsRepairChapters: 0,
        currentChapterOrder: 11,
        ratio: 0.4,
      },
      displayState: {
        stageKey: "chapter_execution",
        stageLabel: "章节执行",
        stepIndex: 5,
        totalSteps: 7,
        mode: "waiting",
        headline: "等待确认",
        description: "等待确认",
        currentAction: "章节执行",
        checkpointLabel: "暂无",
        progressPercent: 50,
        requiresUserAction: false,
        isLiveRunning: false,
        needsRecovery: false,
        steps: [],
      },
      nextActions: ["continue"],
    },
  );

  assert.match(guidance.diagnosis, /章节执行/);
  assert.match(guidance.nextStep, /第 11 章/);
  assert.equal(guidance.actionLabel, "进入当前任务");
});

test("takeover progress inspection summarizes volume, outline detail, drafting, and quality assets", () => {
  const inspection = buildTakeoverProgressInspection(buildReadiness({
    snapshot: {
      hasStoryMacroPlan: true,
      hasBookContract: true,
      characterCount: 5,
      chapterCount: 40,
      volumeCount: 2,
      hasVolumeStrategyPlan: true,
      firstVolumeChapterCount: 40,
      volumeChapterRanges: [{ volumeOrder: 1, startOrder: 1, endOrder: 40 }],
      firstVolumePreparedChapterCount: 10,
      generatedChapterCount: 10,
      approvedChapterCount: 5,
      pendingRepairChapterCount: 5,
    },
    executableRange: {
      startOrder: 1,
      endOrder: 10,
      totalChapterCount: 10,
      nextChapterOrder: 11,
    },
  }));

  assert.equal(inspection.cards.length, 4);
  assert.match(inspection.cards[0].detail, /2 卷/);
  assert.match(inspection.cards[1].detail, /1-10/);
  assert.match(inspection.cards[2].status, /10/);
  assert.match(inspection.cards[3].detail, /第 11 章/);
});

test("takeover chapter target starts after already written chapters", () => {
  const target = buildTakeoverChapterTarget(buildReadiness({
    snapshot: {
      hasStoryMacroPlan: true,
      hasBookContract: true,
      characterCount: 5,
      chapterCount: 40,
      volumeCount: 1,
      firstVolumeChapterCount: 40,
      generatedChapterCount: 10,
      approvedChapterCount: 5,
    },
  }), {
    task: null,
    run: null,
    activeStep: null,
    latestCommand: null,
    runtime: null,
    projection: null,
    recentEvents: [],
    artifacts: [],
    factSummary: null,
    chapterProgress: {
      totalChapters: 40,
      draftedChapterCount: 10,
      approvedChapterCount: 5,
      completedChapters: 5,
      needsRepairChapters: 0,
      currentChapterOrder: 2,
      ratio: 0.4,
    },
    displayState: {
      stageKey: "chapter_execution",
      stageLabel: "章节执行",
      stepIndex: 5,
      totalSteps: 7,
      mode: "waiting",
      headline: "等待确认",
      description: "等待确认",
      currentAction: "章节执行",
      checkpointLabel: "暂无",
      progressPercent: 50,
      requiresUserAction: false,
      isLiveRunning: false,
      needsRecovery: false,
      steps: [],
    },
    nextActions: ["continue"],
  });

  assert.equal(target?.startOrder, 11);
  assert.equal(target?.maxOrder, 40);
  assert.equal(target?.selectedOrder, 11);
  assert.equal(target?.plan.mode, "chapter_range");
  assert.equal(target?.plan.startOrder, 11);
  assert.equal(target?.plan.endOrder, 11);
  assert.equal(target?.actionLabel, "推进至第 11 章");
});

test("takeover chapter target builds a chapter range when the user chooses a later chapter", () => {
  const target = buildTakeoverChapterTarget(buildReadiness({
    snapshot: {
      hasStoryMacroPlan: true,
      hasBookContract: true,
      characterCount: 5,
      chapterCount: 40,
      volumeCount: 1,
      firstVolumeChapterCount: 40,
      generatedChapterCount: 10,
      approvedChapterCount: 5,
    },
    executableRange: {
      startOrder: 1,
      endOrder: 40,
      totalChapterCount: 40,
      nextChapterOrder: 11,
    },
  }), null, 15);

  assert.equal(target?.startOrder, 11);
  assert.equal(target?.maxOrder, 40);
  assert.equal(target?.selectedOrder, 15);
  assert.equal(target?.plan.startOrder, 11);
  assert.equal(target?.plan.endOrder, 15);
  assert.match(target?.summary ?? "", /第 11 章开始/);
});

test("takeover chapter target clamps input to unwritten chapter range", () => {
  const target = buildTakeoverChapterTarget(buildReadiness({
    snapshot: {
      hasStoryMacroPlan: true,
      hasBookContract: true,
      characterCount: 5,
      chapterCount: 40,
      volumeCount: 1,
      firstVolumeChapterCount: 40,
      generatedChapterCount: 10,
      approvedChapterCount: 5,
    },
  }), null, 8);

  assert.equal(target?.startOrder, 11);
  assert.equal(target?.selectedOrder, 11);
  assert.equal(target?.plan.startOrder, 11);
  assert.equal(target?.plan.endOrder, 11);
});

test("takeover start errors are translated into a recoverable user action", () => {
  const message = formatTakeoverStartError(new Error("章节范围只能从节奏拆章、章节执行或质量修复开始。"));

  assert.match(message, /不能直接从章节范围继续/);
  assert.match(message, /推荐位置/);
});
