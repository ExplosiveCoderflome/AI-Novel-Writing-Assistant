const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DirectorEventProjectionService,
} = require("../dist/services/novel/director/runtime/DirectorEventProjectionService.js");

function buildSnapshot(overrides = {}) {
  return {
    schemaVersion: 1,
    runId: "task-1",
    novelId: "novel-1",
    entrypoint: "confirm",
    policy: {
      mode: "run_until_gate",
      mayOverwriteUserContent: false,
      maxAutoRepairAttempts: 1,
      allowExpensiveReview: false,
      modelTier: "balanced",
      updatedAt: "2026-04-28T00:00:00.000Z",
    },
    steps: [],
    events: [],
    artifacts: [],
    updatedAt: "2026-04-28T00:00:00.000Z",
    ...overrides,
  };
}

test("director event projection marks approval gates as user action", () => {
  const service = new DirectorEventProjectionService();
  const projection = service.buildSnapshotProjection(buildSnapshot({
    steps: [{
      idempotencyKey: "task-1:chapter_execution_node:novel:novel-1",
      nodeKey: "chapter_execution_node",
      label: "执行章节生成批次",
      status: "waiting_approval",
      targetType: "novel",
      targetId: "novel-1",
      startedAt: "2026-04-28T00:00:01.000Z",
      policyDecision: {
        canRun: false,
        requiresApproval: true,
        reason: "当前策略需要确认后继续。",
        mayOverwriteUserContent: false,
        affectedArtifacts: [],
        autoRetryBudget: 0,
        onQualityFailure: "pause_for_manual",
      },
    }],
    events: [{
      eventId: "event-1",
      type: "approval_required",
      taskId: "task-1",
      novelId: "novel-1",
      nodeKey: "chapter_execution_node",
      summary: "章节执行等待确认。",
      occurredAt: "2026-04-28T00:00:02.000Z",
    }],
  }));

  assert.equal(projection.status, "waiting_approval");
  assert.equal(projection.requiresUserAction, true);
  assert.equal(projection.currentNodeKey, "chapter_execution_node");
  assert.equal(projection.headline, "等待确认：执行章节生成批次");
  assert.equal(projection.detail, "当前策略需要确认后继续。");
  assert.equal(projection.blockedReason, "当前策略需要确认后继续。");
  assert.equal(projection.blockingReason, "当前策略需要确认后继续。");
  assert.equal(projection.recoveryDecision, "auto_resume_from_checkpoint");
  assert.equal(projection.isAutopilotRecoverable, false);
  assert.equal(projection.recentEvents.length, 1);
});

test("director event projection keeps latest event first", () => {
  const service = new DirectorEventProjectionService();
  const projection = service.buildSnapshotProjection(buildSnapshot({
    steps: [{
      idempotencyKey: "task-1:story_macro_phase:novel:novel-1",
      nodeKey: "story_macro_phase",
      label: "生成书级规划资产",
      status: "succeeded",
      targetType: "novel",
      targetId: "novel-1",
      startedAt: "2026-04-28T00:00:01.000Z",
      finishedAt: "2026-04-28T00:00:03.000Z",
    }],
    events: [
      {
        eventId: "event-old",
        type: "node_started",
        summary: "开始生成书级规划资产。",
        occurredAt: "2026-04-28T00:00:01.000Z",
      },
      {
        eventId: "event-new",
        type: "node_completed",
        summary: "书级规划资产已准备好。",
        occurredAt: "2026-04-28T00:00:03.000Z",
      },
    ],
  }), {
    factSummary: {
      allStepsCompleted: true,
      completedStepCount: 1,
      totalStepCount: 1,
      currentFactStepId: null,
      currentFactStepLabel: null,
      currentFactEvidence: null,
      hasNovelProject: true,
      hasStoryMacro: true,
      hasBookContract: true,
      characterCount: 1,
      hasVolumeStrategy: true,
      volumeCount: 1,
      outlineFacts: {
        beatSheetReady: true,
        chapterListReady: true,
        chapterDetailReady: true,
        plannedChapterCount: 1,
        selectedChapterCount: 1,
        completedDetailSteps: 1,
        totalDetailSteps: 1,
        syncedChapterCount: 1,
      },
      chapterExecutionFacts: {
        totalChapters: 1,
        draftedChapterCount: 1,
        reviewedChapterCount: 1,
        approvedChapterCount: 1,
        committedChapterCount: 1,
        completedChapters: 1,
        needsRepairChapters: 0,
        ratio: 1,
        expectedChapterCount: 1,
      },
      repairFacts: {
        draftedChapterCount: 1,
        reviewedChapterCount: 1,
        committedChapterCount: 1,
        needsRepairChapters: 0,
        payoffArtifactCount: 1,
        characterResourceArtifactCount: 1,
      },
      steps: [{
        stepId: "story.macro.plan",
        label: "鐢熸垚涔︾骇瑙勫垝璧勪骇",
        stage: "story_macro",
        completed: true,
        completenessRatio: 1,
        evidence: { artifactType: "story_macro" },
        nextAction: null,
      }],
    },
  });

  assert.equal(projection.status, "completed");
  assert.equal(projection.requiresUserAction, false);
  assert.equal(projection.headline, "步骤完成：生成书级规划资产");
  assert.equal(projection.lastEventSummary, "书级规划资产已准备好。");
  assert.equal(projection.recentEvents[0].eventId, "event-new");
});

test("director event projection exposes deferred quality debt", () => {
  const service = new DirectorEventProjectionService();
  const projection = service.buildSnapshotProjection(buildSnapshot({
    policy: {
      mode: "auto_safe_scope",
      mayOverwriteUserContent: false,
      maxAutoRepairAttempts: 1,
      allowExpensiveReview: false,
      modelTier: "balanced",
      updatedAt: "2026-04-28T00:00:00.000Z",
    },
    steps: [{
      idempotencyKey: "task-1:chapter_execution_node:novel:novel-1",
      nodeKey: "chapter_execution_node",
      label: "继续章节生成",
      status: "running",
      targetType: "novel",
      targetId: "novel-1",
      startedAt: "2026-04-28T00:00:01.000Z",
    }],
    events: [{
      eventId: "event-quality-debt",
      type: "continue_with_risk",
      taskId: "task-1",
      novelId: "novel-1",
      nodeKey: "planner.replan",
      summary: "全书自动成书已暂存重复重规划问题，并继续推进后续章节。",
      affectedScope: "chapter_order:6",
      severity: "medium",
      metadata: { chapterOrder: 6 },
      occurredAt: "2026-04-28T00:00:02.000Z",
    }],
  }));

  assert.equal(projection.recoveryDecision, "defer_and_continue");
  assert.equal(projection.isAutopilotRecoverable, true);
  assert.deepEqual(projection.qualityDebtSummary, {
    deferredChapterCount: 1,
    deferredChapterOrders: [6],
    latestReason: "全书自动成书已暂存重复重规划问题，并继续推进后续章节。",
  });
  assert.ok(projection.visibleRiskBadges.some((badge) => badge.label === "已暂存质量债"));
});

test("director event projection exposes quality budget summary", () => {
  const service = new DirectorEventProjectionService();
  const projection = service.buildSnapshotProjection(buildSnapshot({
    steps: [{
      idempotencyKey: "task-1:chapter_repair_node:chapter:chapter-6",
      nodeKey: "chapter_repair_node",
      label: "修复第 6 章",
      status: "running",
      targetType: "chapter",
      targetId: "chapter-6",
      startedAt: "2026-04-28T00:00:01.000Z",
    }],
    events: [{
      eventId: "event-budget",
      type: "repair_ticket_created",
      taskId: "task-1",
      novelId: "novel-1",
      nodeKey: "chapter_repair_node",
      summary: "第 6 章同类质量问题再次出现。",
      affectedScope: "chapter:chapter-6",
      severity: "medium",
      metadata: {
        chapterOrder: 6,
        qualityBudgetNextAction: "auto_replan_window",
        qualityBudgetEntry: {
          signatureKey: "sig-1",
          issueSignature: "quality_loop|medium|repair|章节衔接问题",
          blockingLedgerKeys: ["continuity_state"],
          affectedChapterWindow: {
            startOrder: 6,
            endOrder: 8,
            chapterOrders: [6, 7, 8],
            chapterIds: [],
          },
          patchRepairCount: 1,
          chapterRewriteCount: 1,
          windowReplanCount: 0,
          deferredCount: 0,
          lastAction: "chapter_rewrite",
          lastReason: "章节衔接问题仍存在",
          lastChapterId: "chapter-6",
          lastChapterOrder: 6,
          updatedAt: "2026-04-28T00:00:02.000Z",
        },
      },
      occurredAt: "2026-04-28T00:00:02.000Z",
    }],
  }));

  assert.deepEqual(projection.qualityBudgetSummary, {
    currentChapterId: "chapter-6",
    currentChapterOrder: 6,
    latestSignatureKey: "sig-1",
    latestIssueSignature: "quality_loop|medium|repair|章节衔接问题",
    latestReason: "章节衔接问题仍存在",
    patchRepairUsed: 1,
    chapterRewriteUsed: 1,
    windowReplanUsed: 0,
    deferredCount: 0,
    nextAction: "auto_replan_window",
    nextActionLabel: "重规划受影响章节",
    explanation: "质量预算：局部修复 1/1，整章重写 1/1，窗口重规划 0/1；同类问题下一步会重规划受影响章节。",
  });
});

test("director event projection summarizes workspace progress and next action", () => {
  const service = new DirectorEventProjectionService();
  const projection = service.buildSnapshotProjection(buildSnapshot({
    steps: [{
      idempotencyKey: "task-1:workspace_analyze:novel:novel-1",
      nodeKey: "workspace_analyze",
      label: "分析小说资产",
      status: "running",
      targetType: "novel",
      targetId: "novel-1",
      startedAt: "2026-04-28T00:00:01.000Z",
    }],
    events: [{
      eventId: "event-workspace",
      type: "workspace_analyzed",
      summary: "工作区分析完成。",
      occurredAt: "2026-04-28T00:00:02.000Z",
    }],
    artifacts: [
      {
        id: "chapter_draft:chapter:chapter-1:Chapter:chapter-1",
        novelId: "novel-1",
        artifactType: "chapter_draft",
        targetType: "chapter",
        targetId: "chapter-1",
        version: 1,
        status: "active",
        source: "user_edited",
        contentRef: { table: "Chapter", id: "chapter-1" },
        contentHash: "hash-1",
        schemaVersion: "legacy-wrapper-v1",
        protectedUserContent: true,
      },
      {
        id: "audit_report:chapter:chapter-1:AuditReport:audit-1",
        novelId: "novel-1",
        artifactType: "audit_report",
        targetType: "chapter",
        targetId: "chapter-1",
        version: 1,
        status: "stale",
        source: "backfilled",
        contentRef: { table: "AuditReport", id: "audit-1" },
        schemaVersion: "legacy-wrapper-v1",
      },
    ],
    lastWorkspaceAnalysis: {
      novelId: "novel-1",
      inventory: {
        novelId: "novel-1",
        novelTitle: "测试小说",
        hasBookContract: true,
        hasStoryMacro: true,
        hasCharacters: true,
        hasVolumeStrategy: true,
        hasChapterPlan: true,
        chapterCount: 12,
        draftedChapterCount: 4,
        approvedChapterCount: 2,
        pendingRepairChapterCount: 1,
        hasActivePipelineJob: false,
        hasActiveDirectorRun: true,
        hasWorldBinding: true,
        hasSourceKnowledge: false,
        hasContinuationAnalysis: false,
        latestDirectorTaskId: "task-1",
        activeDirectorTaskId: "task-1",
        activePipelineJobId: null,
        missingArtifactTypes: ["rolling_window_review"],
        staleArtifacts: [{
          id: "audit_report:chapter:chapter-1:AuditReport:audit-1",
          novelId: "novel-1",
          artifactType: "audit_report",
          targetType: "chapter",
          targetId: "chapter-1",
          version: 1,
          status: "stale",
          source: "backfilled",
          contentRef: { table: "AuditReport", id: "audit-1" },
          schemaVersion: "legacy-wrapper-v1",
        }],
        protectedUserContentArtifacts: [{
          id: "chapter_draft:chapter:chapter-1:Chapter:chapter-1",
          novelId: "novel-1",
          artifactType: "chapter_draft",
          targetType: "chapter",
          targetId: "chapter-1",
          version: 1,
          status: "active",
          source: "user_edited",
          contentRef: { table: "Chapter", id: "chapter-1" },
          schemaVersion: "legacy-wrapper-v1",
          protectedUserContent: true,
        }],
        needsRepairArtifacts: [{
          id: "repair_ticket:chapter:chapter-1:Chapter:chapter-1",
          novelId: "novel-1",
          artifactType: "repair_ticket",
          targetType: "chapter",
          targetId: "chapter-1",
          version: 1,
          status: "active",
          source: "backfilled",
          contentRef: { table: "Chapter", id: "chapter-1" },
          schemaVersion: "legacy-wrapper-v1",
        }],
        artifacts: [],
      },
      interpretation: null,
      manualEditImpact: null,
      recommendation: {
        action: "review_recent_chapters",
        reason: "先复查近期章节。",
        affectedScope: "chapter:chapter-1",
        riskLevel: "medium",
      },
      confidence: 0.8,
      evidenceRefs: ["workspace_inventory"],
      generatedAt: "2026-04-28T00:00:02.000Z",
      prompt: null,
    },
  }));

  assert.equal(projection.status, "running");
  assert.equal(projection.headline, "推进任务：分析小说资产");
  assert.equal(projection.detail, "最近进展：工作区分析完成。");
  assert.equal(projection.nextActionLabel, "复查最近章节");
  assert.equal(projection.recommendedAction.action, "review_recent_chapters");
  assert.equal(projection.scopeSummary, "工作区：12 章，4 章有正文，1 章待修复，1 类产物待补齐。");
  assert.equal(projection.progressSummary, "进展：0/1 个步骤完成，2 个产物记录，1 个用户内容受保护，1 个产物需确认，1 个修复任务。");
  assert.equal(projection.recoveryDecision, "auto_repair_chapter");
  assert.equal(projection.progressBreakdown.planningPercent, 100);
  assert.equal(projection.progressBreakdown.chapterExecutionPercent, 25);
  assert.equal(projection.progressBreakdown.qualityRepairPercent, 75);
  assert.equal(projection.progressBreakdown.totalPercent, 59);
  assert.equal(projection.progressBreakdown.planningProgress, 100);
  assert.equal(projection.progressBreakdown.chapterProgress, 25);
  assert.equal(projection.progressBreakdown.qualityProgress, 75);
  assert.equal(projection.progressBreakdown.activeJobProgress, 1);
  assert.equal(projection.progressBreakdown.continuableChapters, 3);
  assert.deepEqual(
    projection.visibleRiskBadges.map((badge) => badge.label),
    ["受保护正文", "1 章待修复", "1 项需复核", "缺少规划资源"],
  );
});

test("director event projection keeps heartbeat as latest running progress", () => {
  const service = new DirectorEventProjectionService();
  const projection = service.buildSnapshotProjection(buildSnapshot({
    steps: [{
      idempotencyKey: "task-1:volume_strategy.volume_generation:volume:volume-1",
      nodeKey: "volume_strategy.volume_generation",
      label: "正在生成卷战略（已等待 30s）",
      status: "running",
      targetType: "volume",
      targetId: "volume-1",
      startedAt: "2026-04-28T00:00:01.000Z",
    }],
    events: [
      {
        eventId: "event-start",
        type: "node_started",
        nodeKey: "volume_strategy.volume_generation",
        summary: "正在生成卷战略",
        occurredAt: "2026-04-28T00:00:01.000Z",
      },
      {
        eventId: "event-heartbeat",
        type: "node_heartbeat",
        nodeKey: "volume_strategy.volume_generation",
        summary: "正在生成卷战略（已等待 30s）",
        occurredAt: "2026-04-28T00:00:31.000Z",
      },
    ],
  }));

  assert.equal(projection.status, "running");
  assert.equal(projection.headline, "推进任务：正在生成卷战略（已等待 30s）");
  assert.equal(projection.detail, "最近进展：正在生成卷战略（已等待 30s）");
  assert.equal(projection.recentEvents[0].type, "node_heartbeat");
});
