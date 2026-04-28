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
  }));

  assert.equal(projection.status, "completed");
  assert.equal(projection.requiresUserAction, false);
  assert.equal(projection.headline, "步骤完成：生成书级规划资产");
  assert.equal(projection.lastEventSummary, "书级规划资产已准备好。");
  assert.equal(projection.recentEvents[0].eventId, "event-new");
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
  assert.equal(projection.scopeSummary, "工作区：12 章，4 章有正文，1 章待修复，1 类产物待补齐。");
  assert.equal(projection.progressSummary, "进展：0/1 个步骤完成，2 个产物记录，1 个用户内容受保护，1 个产物需确认，1 个修复任务。");
});
