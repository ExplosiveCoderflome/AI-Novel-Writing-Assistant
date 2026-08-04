import test from "node:test";
import assert from "node:assert/strict";
import {
  getDirectorCockpitActionHref,
  getDirectorCockpitContinuationMode,
  isDirectorCockpitContinuationAction,
} from "../src/lib/directorCockpitActions.js";

test("directorCockpitActions Test Suite", async (t) => {
  await t.test("getDirectorCockpitActionHref resolves correct workspace links", () => {
    const projection = {
      novelId: "test-novel-123",
      focusNovel: { href: "/novels/test-novel-123/edit" },
    };

    const actionWithHref = {
      type: "open_target",
      target: { href: "/novels/test-novel-123/edit?tab=character" },
    };
    assert.equal(getDirectorCockpitActionHref(projection, actionWithHref), "/novels/test-novel-123/edit?tab=character");

    const actionWithTab = {
      type: "open_target",
      target: { tab: "character", taskId: "task-99" },
    };
    assert.equal(getDirectorCockpitActionHref(projection, actionWithTab), "/novels/test-novel-123/edit?stage=character&directorTaskId=task-99");
  });

  await t.test("isDirectorCockpitContinuationAction correctly identifies continuation actions", () => {
    assert.equal(isDirectorCockpitContinuationAction({ type: "continue" }), true);
    assert.equal(isDirectorCockpitContinuationAction({ type: "auto_execute_range" }), true);
    assert.equal(isDirectorCockpitContinuationAction({ type: "open_details" }), false);
  });

  await t.test("getDirectorCockpitContinuationMode maps actions to continuation modes", () => {
    assert.equal(getDirectorCockpitContinuationMode({ type: "auto_execute_range" }), "auto_execute_range");
    assert.equal(
      getDirectorCockpitContinuationMode({ type: "continue", commandPayload: { continuationMode: "skip_quality_repair" } }),
      "skip_quality_repair",
    );
    assert.equal(getDirectorCockpitContinuationMode({ type: "open_details" }), undefined);
  });
});
