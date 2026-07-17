import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const clientRoot = resolve(import.meta.dirname, "..");
const read = (relativePath) => readFileSync(resolve(clientRoot, relativePath), "utf8");

test("workspace facade exposes the shared workbench contract", () => {
  const facade = read("src/components/workspace/index.ts");
  assert.match(facade, /WorkspaceHeader/);
  assert.match(facade, /WorkspaceNextAction/);
  assert.match(facade, /WorkspaceStateNotice/);
  assert.match(facade, /WorkspaceTone/);
});

test("task queue facade exposes severity impact empty and summary contracts", () => {
  const facade = read("src/components/taskQueue/index.ts");
  assert.match(facade, /TaskQueueSeverityBadge/);
  assert.match(facade, /TaskQueueImpactNotice/);
  assert.match(facade, /TaskQueueEmptyState/);
  assert.match(facade, /TaskQueueSummaryGrid/);
});

test("shared workspace and task queue components stay token based", () => {
  const sources = [
    "src/components/workspace/WorkspaceHeader.tsx",
    "src/components/workspace/WorkspaceNextAction.tsx",
    "src/components/workspace/WorkspaceStateNotice.tsx",
    "src/components/taskQueue/TaskQueuePrimitives.tsx",
    "src/components/taskQueue/TaskQueueSemantic.tsx",
  ].map(read).join("\n");
  assert.doesNotMatch(sources, /#[0-9a-f]{3,8}/i);
  assert.doesNotMatch(sources, /(?:slate|amber|yellow|emerald|sky|rose|red|green|blue)-\d/);
  assert.doesNotMatch(sources, /bg-gradient/);
});

test("task and follow-up pages expose recovery states and keep director identity explicit", () => {
  const taskPage = read("src/pages/tasks/TaskCenterPage.tsx");
  const taskFilters = read("src/pages/tasks/components/TaskCenterFilterPanel.tsx");
  const followUpPage = read("src/pages/autoDirectorFollowUps/AutoDirectorFollowUpCenterPage.tsx");
  const followUpList = read("src/pages/autoDirectorFollowUps/components/AutoDirectorFollowUpList.tsx");
  const followUpOverview = read("src/pages/autoDirectorFollowUps/components/AutoDirectorFollowUpOverview.tsx");
  assert.match(taskPage, /WorkspaceHeader/);
  assert.match(taskPage, /WorkspaceNextAction/);
  assert.match(taskPage, /TaskCenterDetailPanel/);
  assert.match(taskPage, /getTaskOverview/);
  assert.match(taskPage, /recoveryCandidateCount/);
  assert.match(taskPage, /listRecoveryCandidates/);
  assert.match(followUpPage, /WorkspaceHeader/);
  assert.match(followUpPage, /WorkspaceNextAction/);
  assert.match(followUpPage, /searchParams\.get\("directorTaskId"\)/);
  assert.doesNotMatch(followUpPage, /workspaceTaskId/);
  assert.match(taskFilters, /aria-label="按任务类型筛选"/);
  assert.match(followUpList, /aria-label="按跟进原因筛选"/);
  assert.match(followUpOverview, /aria-pressed=/);
});
