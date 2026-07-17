import test from "node:test";
import assert from "node:assert/strict";

import {
  getFollowUpActionConsequence,
  getFollowUpActionRiskDescription,
  getFollowUpLevelLabel,
  getFollowUpPriorityLabel,
  getFollowUpTone,
  resolveFollowUpOverviewPresentation,
} from "./followUpPresentation.ts";

const baseItem = {
  section: "pending",
  reason: "chapter_batch_execution_pending",
  priority: "P2",
  itemType: "task",
  pendingManualRecovery: false,
};

test("follow-up presentation separates blockers and quality reminders", () => {
  assert.equal(getFollowUpTone({ ...baseItem, section: "exception", priority: "P0" }), "danger");
  const quality = { ...baseItem, reason: "quality_repair_pending" };
  assert.equal(getFollowUpTone(quality), "warning");
  assert.equal(getFollowUpLevelLabel(quality), "质量提醒");
  assert.equal(getFollowUpTone({ ...quality, section: "exception", priority: "P0" }), "warning");
});

test("follow-up presentation treats pending confirmation as an action instead of a fault", () => {
  assert.equal(getFollowUpTone(baseItem), "info");
  assert.equal(getFollowUpLevelLabel(baseItem), "待操作");
});

test("follow-up presentation keeps explicit replan blocking and cancellation historical", () => {
  const replan = { ...baseItem, reason: "replan_required", priority: "P1" };
  const cancelled = { ...baseItem, section: "exception", reason: "runtime_cancelled", priority: "P1" };
  assert.equal(getFollowUpTone(replan), "danger");
  assert.equal(getFollowUpLevelLabel(replan), "需要重规划");
  assert.equal(getFollowUpPriorityLabel(replan.priority, replan.reason), "立即处理");
  assert.equal(getFollowUpTone(cancelled), "neutral");
  assert.equal(getFollowUpLevelLabel(cancelled), "已取消");
  assert.equal(getFollowUpPriorityLabel(cancelled.priority, cancelled.reason), "可按需恢复");
});

test("follow-up presentation marks progress and auto approval without blocking", () => {
  assert.equal(getFollowUpTone({ ...baseItem, section: "auto_progress", reason: "auto_progress_running" }), "info");
  assert.equal(getFollowUpTone({
    ...baseItem,
    section: "auto_progress",
    reason: "auto_approval_completed",
    itemType: "auto_approval_record",
  }), "success");
});

test("follow-up action consequences are driven by structured action codes", () => {
  assert.match(getFollowUpActionConsequence({
    code: "retry_with_task_model",
    kind: "mutation",
    label: "重试",
    riskLevel: "low",
    requiresConfirm: false,
  }), /任务保存的模型/);
  assert.match(getFollowUpActionConsequence({
    code: "open_detail",
    kind: "navigation",
    label: "详情",
    riskLevel: "low",
    requiresConfirm: false,
  }), /不会改变/);
  assert.match(getFollowUpActionRiskDescription({
    code: "retry_with_route_model",
    kind: "mutation",
    label: "重试",
    riskLevel: "medium",
    requiresConfirm: true,
  }), /需要确认/);
});

test("follow-up priorities are presented as user actions instead of raw enum values", () => {
  assert.equal(getFollowUpPriorityLabel("P0"), "立即处理");
  assert.equal(getFollowUpPriorityLabel("P1"), "尽快处理");
  assert.equal(getFollowUpPriorityLabel("P2"), "可稍后处理");
});

test("follow-up overview promotes replan but keeps cancellation out of blockers", () => {
  const replan = resolveFollowUpOverviewPresentation({
    countersBySection: { needs_validation: 0, exception: 0, pending: 1, auto_progress: 0, replaced: 0 },
    countersByReason: { replan_required: 1 },
  });
  assert.equal(replan.criticalCount, 1);
  assert.equal(replan.pendingActionCount, 0);
  assert.equal(replan.recommendedSection, "pending");

  const replanWithFailure = resolveFollowUpOverviewPresentation({
    countersBySection: { needs_validation: 0, exception: 1, pending: 1, auto_progress: 0, replaced: 0 },
    countersByReason: { replan_required: 1, runtime_failed: 1 },
  });
  assert.equal(replanWithFailure.criticalCount, 2);
  assert.equal(replanWithFailure.recommendedSection, "pending");

  const cancelled = resolveFollowUpOverviewPresentation({
    countersBySection: { needs_validation: 0, exception: 1, pending: 0, auto_progress: 0, replaced: 0 },
    countersByReason: { runtime_cancelled: 1 },
  });
  assert.equal(cancelled.criticalCount, 0);
  assert.equal(cancelled.recommendedSection, "");
});
