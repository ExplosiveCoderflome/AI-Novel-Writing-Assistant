import test from "node:test";
import assert from "node:assert/strict";

import * as params from "./legacyTaskUrlParams.ts";

const { stripLegacyTaskUrlParams } = params;

test("legacy task URL module only exposes parameter cleanup", () => {
  assert.deepEqual(Object.keys(params), ["stripLegacyTaskUrlParams"]);
});

test("legacy task parameters are removed while repeated non-task parameters and encoding survive", () => {
  const original = new URLSearchParams("stage=chapter&directorTaskId=old&volumeId=a%2Bb&workspaceTaskId=manual&taskId=older&tag=first&tag=second");
  const cleaned = stripLegacyTaskUrlParams(original);

  assert.equal(cleaned.toString(), "stage=chapter&volumeId=a%2Bb&tag=first&tag=second");
  assert.equal(original.get("directorTaskId"), "old");
});
