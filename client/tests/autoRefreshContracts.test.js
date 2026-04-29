import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const homePage = readFileSync("client/src/pages/Home.tsx", "utf8");
const novelListPage = readFileSync("client/src/pages/novels/NovelList.tsx", "utf8");
const taskCenterPage = readFileSync("client/src/pages/tasks/TaskCenterPage.tsx", "utf8");
const sidebar = readFileSync("client/src/components/layout/Sidebar.tsx", "utf8");
const novelEditPage = readFileSync("client/src/pages/novels/NovelEdit.tsx", "utf8");

function getUseQueryBlock(source, queryKeySnippet) {
  const queryKeyIndex = source.indexOf(queryKeySnippet);
  assert.notEqual(queryKeyIndex, -1, `${queryKeySnippet} query should exist`);
  const blockStart = source.lastIndexOf("useQuery({", queryKeyIndex);
  assert.notEqual(blockStart, -1, `${queryKeySnippet} query should use useQuery object syntax`);

  let depth = 0;
  for (let index = blockStart; index < source.length; index += 1) {
    if (source[index] === "{") {
      depth += 1;
    } else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(blockStart, index + 1);
      }
    }
  }
  throw new Error(`${queryKeySnippet} query block should be closed`);
}

test("novel list keeps auto-refreshing while auto director progress is active", () => {
  const block = getUseQueryBlock(novelListPage, "queryKeys.novels.list(1, 100)");

  assert.match(block, /refetchInterval:\s*\(query\)\s*=>/);
  assert.match(block, /latestAutoDirectorTask/);
  assert.match(block, /LIVE_TASK_STATUSES\.has\(task\.status\)/);
});

test("global task overview refresh includes waiting approval work", () => {
  const homeTaskBlock = getUseQueryBlock(homePage, "queryKeys.tasks.overview");
  const sidebarTaskBlock = getUseQueryBlock(sidebar, "queryKeys.tasks.overview");

  assert.match(homeTaskBlock, /waitingApprovalCount/);
  assert.match(sidebarTaskBlock, /waitingApprovalCount/);
});

test("task center and novel editor keep active auto director detail polling", () => {
  const taskListBlock = getUseQueryBlock(taskCenterPage, "queryKeys.tasks.list(listParamsKey)");
  const taskDetailBlock = getUseQueryBlock(taskCenterPage, "queryKeys.tasks.detail(selectedKind ?? \"none\", selectedId ?? \"none\")");
  const autoDirectorBlock = getUseQueryBlock(novelEditPage, "queryKeys.novels.autoDirectorTask(id)");

  assert.match(taskListBlock, /ACTIVE_STATUSES\.has\(item\.status\)/);
  assert.match(taskDetailBlock, /ACTIVE_STATUSES\.has\(task\.status\)/);
  assert.match(autoDirectorBlock, /task\.status === "waiting_approval"/);
});
