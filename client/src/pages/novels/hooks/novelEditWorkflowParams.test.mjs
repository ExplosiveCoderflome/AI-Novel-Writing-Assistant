import test from "node:test";
import assert from "node:assert/strict";

import {
  readNovelEditWorkflowTaskIds,
  withNovelEditDirectorTaskId,
  withNovelEditWorkspaceTaskId,
} from "./novelEditWorkflowParams.ts";

test("novel edit workflow params separate director and workspace task ids", () => {
  const params = new URLSearchParams("stage=structured&directorTaskId=director-1&workspaceTaskId=workspace-1");

  assert.deepEqual(readNovelEditWorkflowTaskIds(params), {
    directorTaskId: "director-1",
    workspaceTaskId: "workspace-1",
  });
});

test("novel edit workflow params read legacy taskId as director task id", () => {
  const params = new URLSearchParams("stage=structured&taskId=director-legacy&workspaceTaskId=workspace-1");

  assert.deepEqual(readNovelEditWorkflowTaskIds(params), {
    directorTaskId: "director-legacy",
    workspaceTaskId: "workspace-1",
  });
});

test("workspace task id updates do not overwrite the director task id", () => {
  const params = new URLSearchParams("stage=basic&directorTaskId=director-1");
  const next = withNovelEditWorkspaceTaskId(params, "workspace-1");

  assert.equal(next.get("directorTaskId"), "director-1");
  assert.equal(next.get("workspaceTaskId"), "workspace-1");
});

test("director task id canonicalization does not overwrite the workspace task id", () => {
  const params = new URLSearchParams("stage=basic&taskId=stale&workspaceTaskId=workspace-1");
  const next = withNovelEditDirectorTaskId(params, "director-2");

  assert.equal(next.get("directorTaskId"), "director-2");
  assert.equal(next.has("taskId"), false);
  assert.equal(next.get("workspaceTaskId"), "workspace-1");
});

test("clearing the director task id keeps the manual workspace binding", () => {
  const params = new URLSearchParams("stage=basic&directorTaskId=director-1&taskId=stale&workspaceTaskId=workspace-1");
  const next = withNovelEditDirectorTaskId(params, "");

  assert.equal(next.has("directorTaskId"), false);
  assert.equal(next.has("taskId"), false);
  assert.equal(next.get("workspaceTaskId"), "workspace-1");
});
