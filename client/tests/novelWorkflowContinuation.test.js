import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveDirectorContinueMode,
  resolveWorkflowContinuationFeedback,
} from "../src/lib/novelWorkflowContinuation.js";

test("novelWorkflowContinuation Test Suite", async (t) => {
  await t.test("resolveDirectorContinueMode resolves correct mode from task status", () => {
    assert.equal(resolveDirectorContinueMode({ checkpointType: "replan_required" }), "skip_quality_repair");
    assert.equal(resolveDirectorContinueMode({ checkpointType: "chapter_batch_ready" }), "auto_execute_range");
    assert.equal(resolveDirectorContinueMode({ pendingManualRecovery: true }), "resume");
  });

  await t.test("resolveWorkflowContinuationFeedback generates user-facing feedback messages", () => {
    const feedback = resolveWorkflowContinuationFeedback(null, { mode: "skip_quality_repair" });
    assert.equal(feedback.tone, "success");
    assert.ok(feedback.message.includes("跳过"));
  });
});
