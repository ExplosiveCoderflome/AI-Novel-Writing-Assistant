const test = require("node:test");
const assert = require("node:assert/strict");
const { compileIntentToPlan } = require("../dist/agents/planner/compiler.js");
const { normalizeIntentPayload } = require("../dist/agents/planner/utils.js");
const { summarizeIntentValidationFailure } = require("../dist/agents/planner/parser.js");

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

test("compileIntentToPlan uses list_tasks for system task status queries", () => {
  const plan = compileIntentToPlan({
    goal: "列出当前系统任务状态",
    intent: "query_task_status",
    confidence: 0.85,
    requiresNovelContext: false,
    chapterSelectors: {},
  }, {
    goal: "列出当前系统任务状态",
    messages: [],
    contextMode: "global",
  });

  assert.deepEqual(plan.actions.map((item) => item.tool), ["list_tasks"]);
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

test("compileIntentToPlan expands produce_novel into fixed production chain", () => {
  const plan = compileIntentToPlan({
    goal: "创建一本20章小说《抗日奇侠传》，并开始整本生成",
    intent: "produce_novel",
    confidence: 0.95,
    requiresNovelContext: false,
    novelTitle: "抗日奇侠传",
    description: "主角穿越到抗战年代，带着邪门外挂一路搅局。",
    targetChapterCount: 20,
    chapterSelectors: {},
  }, {
    goal: "创建一本20章小说《抗日奇侠传》，并开始整本生成",
    messages: [],
    contextMode: "global",
  });

  assert.deepEqual(plan.actions.map((item) => item.tool), [
    "create_novel",
    "generate_world_for_novel",
    "bind_world_to_novel",
    "generate_novel_characters",
    "generate_story_bible",
    "generate_novel_outline",
    "generate_structured_outline",
    "sync_chapters_from_structured_outline",
    "preview_pipeline_run",
    "queue_pipeline_run",
  ]);
  assert.equal(plan.actions[0].input.title, "抗日奇侠传");
  assert.equal(plan.actions[6].input.targetChapterCount, 20);
});

test("compileIntentToPlan uses production status tool for whole-book progress questions", () => {
  const plan = compileIntentToPlan({
    goal: "整本生成到哪一步了",
    intent: "query_novel_production_status",
    confidence: 0.9,
    requiresNovelContext: true,
    chapterSelectors: {},
  }, {
    goal: "整本生成到哪一步了",
    messages: [],
    contextMode: "novel",
    novelId: "novel-1",
  });

  assert.deepEqual(plan.actions.map((item) => item.tool), ["get_novel_production_status"]);
  assert.deepEqual(plan.actions[0].input, { novelId: "novel-1" });
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

test("normalizeIntentPayload sets default chapter target for produce_novel", () => {
  const normalized = normalizeIntentPayload({
    intent: "produce_novel",
    confidence: 0.7,
    novelTitle: "整本测试",
    chapterSelectors: {},
  }, {
    goal: "创建一本小说《整本测试》，并开始整本生成",
    messages: [],
    contextMode: "global",
  });

  assert.equal(normalized.targetChapterCount, 20);
});

test("normalizeIntentPayload maps finish-style AI intents to produce_novel", () => {
  const normalized = normalizeIntentPayload({
    intent: "complete_novel",
    confidence: 0.9,
    requiresNovelContext: true,
    chapterSelectors: {},
  }, {
    goal: "完成这本小说",
    messages: [],
    contextMode: "novel",
    novelId: "novel-1",
  });

  assert.equal(normalized.intent, "produce_novel");
  assert.equal(normalized.targetChapterCount, 20);
});

test("normalizeIntentPayload maps task list style AI intents to query_task_status", () => {
  const normalized = normalizeIntentPayload({
    intent: "list_tasks",
    confidence: 0.88,
    chapterSelectors: null,
  }, {
    goal: "列出当前系统任务状态",
    messages: [],
    contextMode: "global",
  });

  assert.equal(normalized.intent, "query_task_status");
  assert.deepEqual(normalized.chapterSelectors, {});
});

test("normalizeIntentPayload maps character count style AI intents to inspect_characters", () => {
  const normalized = normalizeIntentPayload({
    intent: "query_character_count",
    confidence: 0.86,
    chapterSelectors: null,
  }, {
    goal: "本书已经规划了几个角色",
    messages: [],
    contextMode: "novel",
    novelId: "novel-1",
  });

  assert.equal(normalized.intent, "inspect_characters");
  assert.deepEqual(normalized.chapterSelectors, {});
});

test("normalizeIntentPayload maps current novel character count style AI intents to inspect_characters", () => {
  const normalized = normalizeIntentPayload({
    intent: "current_novel_character_count",
    confidence: 0.9,
    chapterSelectors: null,
  }, {
    goal: "当前小说有几个角色",
    messages: [],
    contextMode: "novel",
    novelId: "novel-1",
  });

  assert.equal(normalized.intent, "inspect_characters");
  assert.deepEqual(normalized.chapterSelectors, {});
});

test("summarizeIntentValidationFailure returns readable intent validation details", () => {
  const message = summarizeIntentValidationFailure(
    {
      goal: "当前小说有几个角色",
      intent: "current_novel_character_total",
      chapterSelectors: {},
    },
    [{
      code: "invalid_value",
      values: [],
      path: ["intent"],
      message: "Invalid option",
    }],
  );

  assert.equal(message, "LLM 返回的意图结构无效：意图字段不受支持：current_novel_character_total。");
});
