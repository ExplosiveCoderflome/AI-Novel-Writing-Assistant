import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCandidateTaskHref,
  readCandidateTaskId,
  stripLegacyTaskUrlParams,
} from "./legacyTaskUrlParams.ts";

test("legacy task parameters are removed while repeated non-task parameters and encoding survive", () => {
  const original = new URLSearchParams("stage=chapter&directorTaskId=old&volumeId=a%2Bb&workspaceTaskId=manual&taskId=older&tag=first&tag=second");
  const cleaned = stripLegacyTaskUrlParams(original);

  assert.equal(cleaned.toString(), "stage=chapter&volumeId=a%2Bb&tag=first&tag=second");
  assert.equal(original.get("directorTaskId"), "old");
});

test("candidate task URL retains the task identifier before a novel exists", () => {
  assert.equal(buildCandidateTaskHref("candidate 1"), "/novels/auto-director?taskId=candidate+1");
  assert.equal(readCandidateTaskId(new URLSearchParams("taskId=candidate+1")), "candidate 1");
});
