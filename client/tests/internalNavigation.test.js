import test from "node:test";
import assert from "node:assert/strict";
import { resolveInternalNavigationTarget } from "../src/lib/internalNavigation.ts";

test("keeps root-relative app routes inside React Router", () => {
  assert.equal(
    resolveInternalNavigationTarget("/tasks?kind=novel_workflow&id=task_1", "http://127.0.0.1:5173/"),
    "/tasks?kind=novel_workflow&id=task_1",
  );
});

test("converts same-origin browser URLs to app routes", () => {
  assert.equal(
    resolveInternalNavigationTarget("http://127.0.0.1:5173/tasks?kind=novel_workflow&id=task_1", "http://127.0.0.1:5173/"),
    "/tasks?kind=novel_workflow&id=task_1",
  );
});

test("converts desktop hash URLs to app routes", () => {
  assert.equal(
    resolveInternalNavigationTarget(
      "file:///C:/Program%20Files/AI%20Novel/resources/client/dist/index.html#/tasks?kind=novel_workflow&id=task_1",
      "file:///C:/Program%20Files/AI%20Novel/resources/client/dist/index.html#/auto-director/follow-ups",
    ),
    "/tasks?kind=novel_workflow&id=task_1",
  );
});

test("does not treat external URLs as internal app routes", () => {
  assert.equal(
    resolveInternalNavigationTarget("https://example.com/tasks", "http://127.0.0.1:5173/"),
    null,
  );
  assert.equal(
    resolveInternalNavigationTarget("//example.com/tasks", "http://127.0.0.1:5173/"),
    null,
  );
});
