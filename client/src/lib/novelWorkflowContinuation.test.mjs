import test from "node:test";
import assert from "node:assert/strict";

import { resolveDirectorContinueMode } from "./novelWorkflowContinuation.ts";

test("professional recovery replans instead of skipping a replan checkpoint", () => {
  assert.equal(resolveDirectorContinueMode({
    checkpointType: "replan_required",
    currentItemKey: "quality_repair",
    currentStage: "质量修复",
    pendingManualRecovery: false,
  }), "auto_execute_range");
});
