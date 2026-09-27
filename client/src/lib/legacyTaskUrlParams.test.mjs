import test from "node:test";
import assert from "node:assert/strict";

import * as params from "./legacyTaskUrlParams.ts";

const { buildCandidateTaskHref, readCandidateTaskId, stripLegacyTaskUrlParams } = params;

test("legacy task parameters are removed while repeated non-task parameters and encoding survive", () => {
  const original = new URLSearchParams("stage=chapter&directorTaskId=old&volumeId=a%2Bb&workspaceTaskId=manual&taskId=older&tag=first&tag=second");
  const cleaned = stripLegacyTaskUrlParams(original);

  assert.equal(cleaned.toString(), "stage=chapter&volumeId=a%2Bb&tag=first&tag=second");
  assert.equal(original.get("directorTaskId"), "old");
});

test("candidate task URL retains the task identifier before a novel exists", () => {
  assert.equal(buildCandidateTaskHref("candidate 1"), "/novels/auto-director?taskId=candidate+1");
  assert.equal(buildCandidateTaskHref("candidate 1", new URLSearchParams("marketBriefId=brief")), "/novels/auto-director?marketBriefId=brief&taskId=candidate+1");
  assert.equal(readCandidateTaskId(new URLSearchParams("taskId=candidate+1")), "candidate 1");
});

test("old follow-up links can select their task before the URL is cleaned", () => {
  assert.equal(params.readLegacyDirectorTaskId(new URLSearchParams("directorTaskId=old&taskId=older")), "old");
  assert.equal(params.readLegacyDirectorTaskId(new URLSearchParams("taskId=older")), "older");
});
