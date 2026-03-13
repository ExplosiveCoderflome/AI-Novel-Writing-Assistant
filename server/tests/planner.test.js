const test = require("node:test");
const assert = require("node:assert/strict");
const { compileIntentToPlan } = require("../dist/agents/planner/compiler.js");
const { normalizeIntentPayload } = require("../dist/agents/planner/utils.js");

test("compileIntentToPlan uses chapter order tools for chapter content", () => {
  const plan = compileIntentToPlan({
    goal: "前两章都写了什么",
    intent: "query_chapter_content",
    confidence: 0.8,
    requiresNovelContext: true,
    chapterSelectors: {
      relative: { type: "first_n", count: 2 },
    },
  }, {
    goal: "前两章都写了什么",
    messages: [],
    contextMode: "novel",
    novelId: "novel-1",
  });

  assert.equal(plan.actions[0].tool, "summarize_chapter_range");
  assert.deepEqual(plan.actions[0].input, {
    novelId: "novel-1",
    startOrder: 1,
    endOrder: 2,
    mode: "summary",
  });
});

test("compileIntentToPlan uses list_novels for global novel listing", () => {
  const plan = compileIntentToPlan({
    goal: "列出当前的小说列表",
    intent: "list_novels",
    confidence: 0.8,
    requiresNovelContext: false,
    chapterSelectors: {},
  }, {
    goal: "列出当前的小说列表",
    messages: [],
    contextMode: "global",
  });

  assert.deepEqual(plan.actions.map((item) => item.tool), ["list_novels"]);
});

test("compileIntentToPlan uses list_worlds for global world listing", () => {
  const plan = compileIntentToPlan({
    goal: "列出世界观列表",
    intent: "list_worlds",
    confidence: 0.8,
    requiresNovelContext: false,
    chapterSelectors: {},
  }, {
    goal: "列出世界观列表",
    messages: [],
    contextMode: "global",
  });

  assert.deepEqual(plan.actions.map((item) => item.tool), ["list_worlds"]);
});

test("compileIntentToPlan uses create_novel for explicit novel creation", () => {
  const plan = compileIntentToPlan({
    goal: "创建一本小说《抗日奇侠传》",
    intent: "create_novel",
    confidence: 0.8,
    requiresNovelContext: false,
    novelTitle: "抗日奇侠传",
    chapterSelectors: {},
  }, {
    goal: "创建一本小说《抗日奇侠传》",
    messages: [],
    contextMode: "global",
  });

  assert.deepEqual(plan.actions.map((item) => item.tool), ["create_novel"]);
  assert.deepEqual(plan.actions[0].input, { title: "抗日奇侠传" });
});

test("compileIntentToPlan uses select_novel_workspace for workspace switching", () => {
  const plan = compileIntentToPlan({
    goal: "把《抗日奇侠传》设为当前工作区",
    intent: "select_novel_workspace",
    confidence: 0.8,
    requiresNovelContext: false,
    novelTitle: "抗日奇侠传",
    chapterSelectors: {},
  }, {
    goal: "把《抗日奇侠传》设为当前工作区",
    messages: [],
    contextMode: "global",
  });

  assert.deepEqual(plan.actions.map((item) => item.tool), ["select_novel_workspace"]);
  assert.deepEqual(plan.actions[0].input, { title: "抗日奇侠传" });
});

test("compileIntentToPlan uses bind_world_to_novel for current novel world binding", () => {
  const plan = compileIntentToPlan({
    goal: "将四合院设为当前小说的世界观",
    intent: "bind_world_to_novel",
    confidence: 0.9,
    requiresNovelContext: true,
    worldName: "四合院",
    chapterSelectors: {},
  }, {
    goal: "将四合院设为当前小说的世界观",
    messages: [],
    contextMode: "novel",
    novelId: "novel-1",
  });

  assert.deepEqual(plan.actions.map((item) => item.tool), ["bind_world_to_novel"]);
  assert.deepEqual(plan.actions[0].input, {
    novelId: "novel-1",
    worldName: "四合院",
  });
});

test("compileIntentToPlan compiles rewrite into read plus pipeline approval path", () => {
  const plan = compileIntentToPlan({
    goal: "重写第三章",
    intent: "rewrite_chapter",
    confidence: 0.8,
    requiresNovelContext: true,
    chapterSelectors: {
      orders: [3],
    },
  }, {
    goal: "重写第三章",
    messages: [],
    contextMode: "novel",
    novelId: "novel-1",
  });

  assert.deepEqual(plan.actions.map((item) => item.tool), [
    "get_chapter_content_by_order",
    "preview_pipeline_run",
    "queue_pipeline_run",
  ]);
});

test("compileIntentToPlan uses failure diagnostics for failed chapter generation question", () => {
  const plan = compileIntentToPlan({
    goal: "第三章为什么失败",
    intent: "inspect_failure_reason",
    confidence: 0.8,
    requiresNovelContext: true,
    chapterSelectors: {
      orders: [3],
    },
  }, {
    goal: "第三章为什么失败",
    messages: [],
    contextMode: "novel",
    novelId: "novel-1",
    currentRunId: "run-1",
  });

  assert.deepEqual(plan.actions.map((item) => item.tool), [
    "get_run_failure_reason",
    "explain_generation_blocker",
  ]);
  assert.deepEqual(plan.actions[1].input, {
    novelId: "novel-1",
    chapterOrder: 3,
    runId: "run-1",
  });
});

test("normalizeIntentPayload fills missing goal and chapterSelectors from AI partial output", () => {
  const normalized = normalizeIntentPayload({
    intent: "list_novels",
    confidence: 0.2,
    novelTitle: null,
    chapterSelectors: null,
  }, {
    goal: "查看当前有多少本在写的小说",
    messages: [],
    contextMode: "global",
  });

  assert.equal(normalized.goal, "查看当前有多少本在写的小说");
  assert.deepEqual(normalized.chapterSelectors, {});
  assert.equal("novelTitle" in normalized, false);
});
