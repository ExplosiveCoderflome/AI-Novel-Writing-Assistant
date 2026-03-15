const test = require("node:test");
const assert = require("node:assert/strict");
const { compileIntentToPlan } = require("../dist/agents/planner/compiler.js");
const { normalizeIntentPayload } = require("../dist/agents/planner/utils.js");
const { summarizeIntentValidationFailure } = require("../dist/agents/planner/parser.js");

test("compileIntentToPlan uses chapter order tools for chapter content", () => {
  const plan = compileIntentToPlan({
    goal: "What happened in the first two chapters?",
    intent: "query_chapter_content",
    confidence: 0.8,
    requiresNovelContext: true,
    chapterSelectors: {
      relative: { type: "first_n", count: 2 },
    },
  }, {
    goal: "What happened in the first two chapters?",
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
    goal: "List current novels",
    intent: "list_novels",
    confidence: 0.8,
    requiresNovelContext: false,
    chapterSelectors: {},
  }, {
    goal: "List current novels",
    messages: [],
    contextMode: "global",
  });

  assert.deepEqual(plan.actions.map((item) => item.tool), ["list_novels"]);
});

test("compileIntentToPlan uses list_base_characters for base character library queries", () => {
  const plan = compileIntentToPlan({
    goal: "List base character library entries",
    intent: "list_base_characters",
    confidence: 0.86,
    requiresNovelContext: false,
    chapterSelectors: {},
  }, {
    goal: "List base character library entries",
    messages: [],
    contextMode: "global",
  });

  assert.deepEqual(plan.actions.map((item) => item.tool), ["list_base_characters"]);
  assert.deepEqual(plan.actions[0].input, { limit: 20 });
});

test("compileIntentToPlan uses list_worlds for global world listing", () => {
  const plan = compileIntentToPlan({
    goal: "List worlds",
    intent: "list_worlds",
    confidence: 0.8,
    requiresNovelContext: false,
    chapterSelectors: {},
  }, {
    goal: "List worlds",
    messages: [],
    contextMode: "global",
  });

  assert.deepEqual(plan.actions.map((item) => item.tool), ["list_worlds"]);
});

test("compileIntentToPlan uses list_tasks for system task status queries", () => {
  const plan = compileIntentToPlan({
    goal: "List system tasks",
    intent: "query_task_status",
    confidence: 0.85,
    requiresNovelContext: false,
    chapterSelectors: {},
  }, {
    goal: "List system tasks",
    messages: [],
    contextMode: "global",
  });

  assert.deepEqual(plan.actions.map((item) => item.tool), ["list_tasks"]);
});

test("compileIntentToPlan uses create_novel for explicit novel creation", () => {
  const plan = compileIntentToPlan({
    goal: "Create novel Anti Hero Legend",
    intent: "create_novel",
    confidence: 0.8,
    requiresNovelContext: false,
    novelTitle: "Anti Hero Legend",
    chapterSelectors: {},
  }, {
    goal: "Create novel Anti Hero Legend",
    messages: [],
    contextMode: "global",
  });

  assert.deepEqual(plan.actions.map((item) => item.tool), ["create_novel"]);
  assert.deepEqual(plan.actions[0].input, { title: "Anti Hero Legend" });
});

test("compileIntentToPlan uses select_novel_workspace for workspace switching", () => {
  const plan = compileIntentToPlan({
    goal: "Switch workspace to Anti Hero Legend",
    intent: "select_novel_workspace",
    confidence: 0.8,
    requiresNovelContext: false,
    novelTitle: "Anti Hero Legend",
    chapterSelectors: {},
  }, {
    goal: "Switch workspace to Anti Hero Legend",
    messages: [],
    contextMode: "global",
  });

  assert.deepEqual(plan.actions.map((item) => item.tool), ["select_novel_workspace"]);
  assert.deepEqual(plan.actions[0].input, { title: "Anti Hero Legend" });
});

test("compileIntentToPlan uses bind_world_to_novel for current novel world binding", () => {
  const plan = compileIntentToPlan({
    goal: "Bind Courtyard World to current novel",
    intent: "bind_world_to_novel",
    confidence: 0.9,
    requiresNovelContext: true,
    worldName: "Courtyard World",
    chapterSelectors: {},
  }, {
    goal: "Bind Courtyard World to current novel",
    messages: [],
    contextMode: "novel",
    novelId: "novel-1",
  });

  assert.deepEqual(plan.actions.map((item) => item.tool), ["bind_world_to_novel"]);
  assert.deepEqual(plan.actions[0].input, {
    novelId: "novel-1",
    worldName: "Courtyard World",
  });
});

test("compileIntentToPlan uses unbind_world_from_novel for current novel world removal", () => {
  const plan = compileIntentToPlan({
    goal: "Do not use this world anymore",
    intent: "unbind_world_from_novel",
    confidence: 0.9,
    requiresNovelContext: true,
    chapterSelectors: {},
  }, {
    goal: "Do not use this world anymore",
    messages: [],
    contextMode: "novel",
    novelId: "novel-1",
    worldId: "world-1",
  });

  assert.deepEqual(plan.actions.map((item) => item.tool), ["unbind_world_from_novel"]);
  assert.deepEqual(plan.actions[0].input, {
    novelId: "novel-1",
  });
});

test("compileIntentToPlan expands produce_novel into fixed production chain", () => {
  const plan = compileIntentToPlan({
    goal: "Create a 20 chapter novel and start full production",
    intent: "produce_novel",
    confidence: 0.95,
    requiresNovelContext: false,
    novelTitle: "Anti Hero Legend",
    description: "A hero travels to a war era and changes history.",
    targetChapterCount: 20,
    chapterSelectors: {},
  }, {
    goal: "Create a 20 chapter novel and start full production",
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
  assert.equal(plan.actions[0].input.title, "Anti Hero Legend");
  assert.equal(plan.actions[6].input.targetChapterCount, 20);
});

test("compileIntentToPlan carries production preferences into create_novel", () => {
  const plan = compileIntentToPlan({
    goal: "Create a guided sci-fi novel and start full production",
    intent: "produce_novel",
    confidence: 0.96,
    requiresNovelContext: false,
    novelTitle: "Signal Orbit",
    description: "A rescue crew chases a drifting archive station near Jupiter.",
    genre: "Science Fiction",
    styleTone: "Cold and tense",
    projectMode: "co_pilot",
    pacePreference: "balanced",
    narrativePov: "third_person",
    emotionIntensity: "high",
    aiFreedom: "medium",
    defaultChapterLength: 2800,
    targetChapterCount: 18,
    chapterSelectors: {},
  }, {
    goal: "Create a guided sci-fi novel and start full production",
    messages: [],
    contextMode: "global",
  });

  assert.deepEqual(plan.actions[0].input, {
    title: "Signal Orbit",
    description: "A rescue crew chases a drifting archive station near Jupiter.",
    genre: "Science Fiction",
    styleTone: "Cold and tense",
    projectMode: "co_pilot",
    pacePreference: "balanced",
    narrativePov: "third_person",
    emotionIntensity: "high",
    aiFreedom: "medium",
    defaultChapterLength: 2800,
  });
  assert.equal(plan.actions[6].input.targetChapterCount, 18);
});

test("compileIntentToPlan uses production status tool for whole-book progress questions", () => {
  const plan = compileIntentToPlan({
    goal: "What is the full novel production status?",
    intent: "query_novel_production_status",
    confidence: 0.9,
    requiresNovelContext: true,
    chapterSelectors: {},
  }, {
    goal: "What is the full novel production status?",
    messages: [],
    contextMode: "novel",
    novelId: "novel-1",
  });

  assert.deepEqual(plan.actions.map((item) => item.tool), ["get_novel_production_status"]);
  assert.deepEqual(plan.actions[0].input, { novelId: "novel-1" });
});

test("compileIntentToPlan uses search_knowledge for similar-setting reference queries", () => {
  const plan = compileIntentToPlan({
    goal: "Find settings similar to wife-honor dynamics",
    intent: "search_knowledge",
    confidence: 0.84,
    requiresNovelContext: false,
    chapterSelectors: {},
  }, {
    goal: "Find settings similar to wife-honor dynamics",
    messages: [],
    contextMode: "global",
    worldId: "world-1",
  });

  assert.deepEqual(plan.actions.map((item) => item.tool), ["search_knowledge"]);
  assert.deepEqual(plan.actions[0].input, {
    query: "Find settings similar to wife-honor dynamics",
    worldId: "world-1",
  });
});

test("compileIntentToPlan reads novel context for setup ideation requests", () => {
  const plan = compileIntentToPlan({
    goal: "Provide 3 premise options for the current novel",
    intent: "ideate_novel_setup",
    confidence: 0.87,
    requiresNovelContext: true,
    chapterSelectors: {},
  }, {
    goal: "Provide 3 premise options for the current novel",
    messages: [],
    contextMode: "novel",
    novelId: "novel-1",
  });

  assert.deepEqual(plan.actions.map((item) => item.tool), [
    "get_novel_context",
    "get_story_bible",
    "get_world_constraints",
  ]);
  assert.deepEqual(plan.actions[0].input, { novelId: "novel-1" });
  assert.deepEqual(plan.actions[1].input, { novelId: "novel-1" });
  assert.deepEqual(plan.actions[2].input, { novelId: "novel-1" });
});

test("compileIntentToPlan compiles rewrite into read plus pipeline approval path", () => {
  const plan = compileIntentToPlan({
    goal: "Rewrite chapter 3",
    intent: "rewrite_chapter",
    confidence: 0.8,
    requiresNovelContext: true,
    chapterSelectors: {
      orders: [3],
    },
  }, {
    goal: "Rewrite chapter 3",
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
    goal: "Why did chapter 3 fail?",
    intent: "inspect_failure_reason",
    confidence: 0.8,
    requiresNovelContext: true,
    chapterSelectors: {
      orders: [3],
    },
  }, {
    goal: "Why did chapter 3 fail?",
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
    goal: "Check current novels",
    messages: [],
    contextMode: "global",
  });

  assert.equal(normalized.goal, "Check current novels");
  assert.deepEqual(normalized.chapterSelectors, {});
  assert.equal("novelTitle" in normalized, false);
});

test("normalizeIntentPayload sets default chapter target for produce_novel", () => {
  const normalized = normalizeIntentPayload({
    intent: "produce_novel",
    confidence: 0.7,
    novelTitle: "Pipeline Test",
    chapterSelectors: {},
  }, {
    goal: "Create a novel and start full production",
    messages: [],
    contextMode: "global",
  });

  assert.equal(normalized.targetChapterCount, 20);
});

test("normalizeIntentPayload normalizes production preference fields", () => {
  const normalized = normalizeIntentPayload({
    intent: "produce_novel",
    confidence: 0.82,
    novelTitle: "Preference Test",
    projectMode: "AI \u4e3b\u5bfc",
    pacePreference: "\u5747\u8861",
    narrativePov: "\u7b2c\u4e09\u4eba\u79f0",
    emotionIntensity: "\u9ad8\u60c5\u7eea\u5f3a\u5ea6",
    aiFreedom: "\u4e2d\u7b49 AI \u81ea\u7531\u5ea6",
    defaultChapterLength: "12000",
    chapterSelectors: {},
  }, {
    goal: "Create a preference-heavy novel",
    messages: [],
    contextMode: "global",
  });

  assert.equal(normalized.projectMode, "ai_led");
  assert.equal(normalized.pacePreference, "balanced");
  assert.equal(normalized.narrativePov, "third_person");
  assert.equal(normalized.emotionIntensity, "high");
  assert.equal(normalized.aiFreedom, "medium");
  assert.equal(normalized.defaultChapterLength, 10000);
});

test("normalizeIntentPayload maps finish-style AI intents to produce_novel", () => {
  const normalized = normalizeIntentPayload({
    intent: "complete_novel",
    confidence: 0.9,
    requiresNovelContext: true,
    chapterSelectors: {},
  }, {
    goal: "Finish this novel",
    messages: [],
    contextMode: "novel",
    novelId: "novel-1",
  });

  assert.equal(normalized.intent, "produce_novel");
  assert.equal(normalized.targetChapterCount, 20);
});

test("normalizeIntentPayload maps internal production tool names back to canonical workflow intents", () => {
  const produceNormalized = normalizeIntentPayload({
    intent: "generate_novel_characters",
    confidence: 0.77,
    chapterSelectors: {},
  }, {
    goal: "Generate core characters for the current novel",
    messages: [],
    contextMode: "novel",
    novelId: "novel-1",
  });
  const startPipelineNormalized = normalizeIntentPayload({
    intent: "start_full_novel_pipeline",
    confidence: 0.73,
    chapterSelectors: {},
  }, {
    goal: "Start the full novel pipeline",
    messages: [],
    contextMode: "novel",
    novelId: "novel-1",
  });

  assert.equal(produceNormalized.intent, "produce_novel");
  assert.equal(produceNormalized.targetChapterCount, 20);
  assert.equal(startPipelineNormalized.intent, "start_pipeline");
});

test("normalizeIntentPayload maps task list style AI intents to query_task_status", () => {
  const normalized = normalizeIntentPayload({
    intent: "list_tasks",
    confidence: 0.88,
    chapterSelectors: null,
  }, {
    goal: "List system tasks",
    messages: [],
    contextMode: "global",
  });

  assert.equal(normalized.intent, "query_task_status");
  assert.deepEqual(normalized.chapterSelectors, {});
});

test("normalizeIntentPayload maps similar-setting search aliases to search_knowledge", () => {
  const normalized = normalizeIntentPayload({
    intent: "find_similar_setting",
    confidence: 0.83,
    chapterSelectors: null,
  }, {
    goal: "Find similar relationship settings from existing references",
    messages: [],
    contextMode: "global",
  });

  assert.equal(normalized.intent, "search_knowledge");
  assert.deepEqual(normalized.chapterSelectors, {});
});

test("normalizeIntentPayload maps world unbind aliases to unbind_world_from_novel", () => {
  const normalized = normalizeIntentPayload({
    intent: "unbind_world",
    confidence: 0.84,
    chapterSelectors: null,
  }, {
    goal: "Stop using the current world",
    messages: [],
    contextMode: "novel",
    novelId: "novel-1",
  });

  assert.equal(normalized.intent, "unbind_world_from_novel");
  assert.deepEqual(normalized.chapterSelectors, {});
});

test("normalizeIntentPayload maps setup option aliases to ideate_novel_setup", () => {
  const normalized = normalizeIntentPayload({
    intent: "core_setting_options",
    confidence: 0.85,
    chapterSelectors: null,
  }, {
    goal: "Provide 3 core setup options for the current novel",
    messages: [],
    contextMode: "novel",
    novelId: "novel-1",
  });

  assert.equal(normalized.intent, "ideate_novel_setup");
  assert.deepEqual(normalized.chapterSelectors, {});
});

test("normalizeIntentPayload maps character library aliases to list_base_characters", () => {
  const normalized = normalizeIntentPayload({
    intent: "character_library",
    confidence: 0.82,
    chapterSelectors: null,
  }, {
    goal: "Show base character library",
    messages: [],
    contextMode: "global",
  });

  assert.equal(normalized.intent, "list_base_characters");
  assert.deepEqual(normalized.chapterSelectors, {});
});

test("normalizeIntentPayload maps character count style AI intents to inspect_characters", () => {
  const normalized = normalizeIntentPayload({
    intent: "query_character_count",
    confidence: 0.86,
    chapterSelectors: null,
  }, {
    goal: "How many characters are in the current novel?",
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
    goal: "How many characters does the current novel have?",
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
      goal: "How many characters does the current novel have?",
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

  assert.ok(message.includes("intent"));
  assert.ok(message.includes("current_novel_character_total"));
});
