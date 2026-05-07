import test from "node:test";
import assert from "node:assert/strict";

import { tabFromDirectorProgress } from "./novelWorkspaceNavigation.ts";

test("running chapter execution uses the active item over a stale chapter batch checkpoint", () => {
  assert.equal(tabFromDirectorProgress({
    status: "running",
    currentStage: "章节执行",
    currentItemKey: "chapter_execution",
    checkpointType: "chapter_batch_ready",
  }), "chapter");
});

test("running chapter execution accepts runtime node keys over stale checkpoints", () => {
  assert.equal(tabFromDirectorProgress({
    status: "running",
    currentStage: "chapter_execution",
    currentItemKey: "chapter_execution_node",
    checkpointType: "chapter_batch_ready",
  }), "chapter");
});

test("chapter quality node keeps the rail on chapter execution instead of regressing", () => {
  assert.equal(tabFromDirectorProgress({
    status: "running",
    currentStage: "quality_repair",
    currentItemKey: "chapter_quality_review_node",
    checkpointType: "chapter_batch_ready",
  }), "pipeline");
});

test("waiting chapter batch checkpoint stays on structured outline before execution starts", () => {
  assert.equal(tabFromDirectorProgress({
    status: "waiting_approval",
    currentStage: "章节执行",
    currentItemKey: "chapter_execution",
    checkpointType: "chapter_batch_ready",
  }), "structured");
});
