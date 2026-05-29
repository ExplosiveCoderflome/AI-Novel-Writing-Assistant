const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDirectorDashboardView,
} = require("../dist/services/novel/director/projections/DirectorDashboardViewBuilder.js");

const baseDisplayState = {
  stageKey: "structured_outline",
  stageLabel: "节奏 / 拆章",
  stepIndex: 4,
  totalSteps: 7,
  mode: "running",
  headline: "正在自动导演",
  description: "AI 正在后台接管这本书的开书流程。",
  currentAction: "正在细化章节任务单",
  checkpointLabel: "暂无",
  progressPercent: 45,
  nextActionLabel: null,
  currentFactStepId: "volume.chapter_detail_bundle.generate",
  currentFactStepLabel: "执行章节任务包细化",
  currentFactDescription: "正在细化章节任务单",
  requiresUserAction: false,
  isLiveRunning: true,
  needsRecovery: false,
  steps: [
    { key: "project_setup", label: "项目设定", status: "completed", isCurrent: false },
    { key: "story_planning", label: "故事宏观规划", status: "completed", isCurrent: false },
    { key: "character_setup", label: "角色准备", status: "completed", isCurrent: false },
    { key: "volume_strategy", label: "卷战略", status: "completed", isCurrent: false },
    { key: "structured_outline", label: "节奏 / 拆章", status: "running", isCurrent: true },
    { key: "chapter_execution", label: "章节执行", status: "pending", isCurrent: false },
    { key: "quality_repair", label: "质量修复", status: "pending", isCurrent: false },
  ],
};

function buildView(patch = {}) {
  return buildDirectorDashboardView({
    task: {
      status: "running",
      currentStage: "节奏 / 拆章",
      currentItemKey: "chapter_detail_bundle",
      currentItemLabel: "正在细化第 9/10 章 · 任务单",
      progress: 0.89,
      checkpointType: null,
      checkpointSummary: null,
      lastError: null,
      pendingManualRecovery: false,
      ...patch.task,
    },
    projection: patch.projection ?? {
      status: "running",
      currentLabel: "正在细化第 9/10 章 · 任务单",
      requiresUserAction: false,
      policyMode: "auto_safe_scope",
      updatedAt: "2026-05-29T00:00:00.000Z",
      recentEvents: [],
      progressBreakdown: {
        totalPercent: 45,
        activeJobProgress: 1,
      },
    },
    displayState: {
      ...baseDisplayState,
      ...patch.displayState,
    },
    factSummary: patch.factSummary ?? null,
    chapterProgress: patch.chapterProgress ?? null,
    activeStep: Object.prototype.hasOwnProperty.call(patch, "activeStep") ? patch.activeStep : {
      status: "running",
      nodeKey: "structured_outline.chapter_detail_bundle",
      label: "正在细化章节任务单",
    },
    latestCommand: Object.prototype.hasOwnProperty.call(patch, "latestCommand") ? patch.latestCommand : {
      status: "running",
      commandType: "continue",
    },
  });
}

test("dashboard keeps running mode when task is running despite stale approval projection", () => {
  const view = buildView({
    projection: {
      status: "waiting_approval",
      currentLabel: "旧审批点",
      requiresUserAction: true,
      blockedReason: "历史审批原因",
      policyMode: "auto_safe_scope",
      updatedAt: "2026-05-29T00:00:00.000Z",
      recentEvents: [],
      progressBreakdown: {
        totalPercent: 45,
        activeJobProgress: 0,
      },
    },
  });

  assert.equal(view.mode, "running");
  assert.equal(view.requiresUserAction, false);
  assert.equal(view.progressPercent, 89);
  assert.equal(view.progressSource, "task_live");
  assert.equal(view.currentAction, "正在细化第 9/10 章 · 任务单");
  assert.ok(view.diagnostics.some((item) => item.code === "stale_action_projection_ignored"));
});

test("dashboard uses waiting mode only for explicit approval task checkpoints", () => {
  const view = buildView({
    task: {
      status: "waiting_approval",
      progress: 0.68,
      checkpointType: "chapter_batch_ready",
      checkpointSummary: "前 10 章自动执行已暂停",
    },
    projection: {
      status: "waiting_approval",
      currentLabel: "章节执行等待确认",
      requiresUserAction: true,
      blockedReason: "需要确认后继续",
      policyMode: "auto_safe_scope",
      updatedAt: "2026-05-29T00:00:00.000Z",
      recentEvents: [],
      progressBreakdown: {
        totalPercent: 68,
        activeJobProgress: 0,
      },
    },
    activeStep: {
      status: "waiting_approval",
      nodeKey: "chapter_execution_node",
      label: "章节执行等待确认",
    },
  });

  assert.equal(view.mode, "waiting_user");
  assert.equal(view.requiresUserAction, true);
  assert.equal(view.primaryAction.type, "confirm_and_continue");
  assert.equal(view.progressPercent, 68);
  assert.equal(view.progressSource, "checkpoint");
});

test("dashboard keeps running mode when workspace artifacts are missing", () => {
  const view = buildView({
    projection: {
      status: "running",
      currentLabel: "正在细化第 9/10 章 · 任务单",
      requiresUserAction: false,
      policyMode: "auto_safe_scope",
      updatedAt: "2026-05-29T00:00:00.000Z",
      recentEvents: [],
      visibleRiskBadges: [
        { label: "缺少规划资源", level: "warning", source: "artifact" },
      ],
      progressBreakdown: {
        totalPercent: 45,
        activeJobProgress: 1,
      },
    },
  });

  assert.equal(view.mode, "running");
  assert.equal(view.requiresUserAction, false);
  assert.ok(view.diagnostics.some((item) => item.label === "缺少规划资源" && item.source === "artifact"));
});

test("dashboard keeps running mode when an old failed projection is stale", () => {
  const view = buildView({
    projection: {
      status: "failed",
      currentLabel: "旧失败点",
      requiresUserAction: false,
      blockedReason: "历史失败原因",
      policyMode: "auto_safe_scope",
      updatedAt: "2026-05-29T00:00:00.000Z",
      recentEvents: [],
      progressBreakdown: {
        totalPercent: 45,
        activeJobProgress: 0,
      },
    },
  });

  assert.equal(view.mode, "running");
  assert.equal(view.requiresUserAction, false);
  assert.ok(view.diagnostics.some((item) => item.code === "stale_action_projection_ignored"));
});

test("dashboard separates failed and recovering states", () => {
  const failed = buildView({
    task: {
      status: "failed",
      lastError: "章节生成失败",
      pendingManualRecovery: false,
    },
    projection: {
      status: "failed",
      currentLabel: "章节生成失败",
      requiresUserAction: false,
      policyMode: "auto_safe_scope",
      updatedAt: "2026-05-29T00:00:00.000Z",
      recentEvents: [],
    },
  });
  const recovering = buildView({
    task: {
      status: "running",
      currentStage: null,
      currentItemKey: null,
      currentItemLabel: null,
      lastError: "执行器租约过期",
      pendingManualRecovery: true,
    },
    projection: {
      status: "idle",
      currentLabel: null,
      requiresUserAction: false,
      policyMode: "auto_safe_scope",
      updatedAt: "2026-05-29T00:00:00.000Z",
      recentEvents: [],
    },
    activeStep: null,
    latestCommand: null,
  });

  assert.equal(failed.mode, "failed");
  assert.equal(failed.primaryAction.type, "open_task_center");
  assert.ok(failed.secondaryActions.some((item) => item.type === "resume_from_checkpoint"));
  assert.equal(recovering.mode, "recovering");
  assert.equal(recovering.primaryAction.type, "open_task_center");
});
