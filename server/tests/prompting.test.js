const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createContextBlock,
} = require("../dist/prompting/core/contextBudget.js");
const {
  selectContextBlocks,
} = require("../dist/prompting/core/contextSelection.js");
const {
  getRegisteredPromptAsset,
  listRegisteredPromptAssets,
} = require("../dist/prompting/registry.js");
const {
  resolveWorkflow,
} = require("../dist/prompting/workflows/workflowRegistry.js");
const {
  plannerChapterPlanPrompt,
} = require("../dist/prompting/prompts/planner/plannerPlan.prompts.js");

test("prompt registry exposes versioned planning assets", () => {
  const assets = listRegisteredPromptAssets();
  const keys = assets.map((asset) => `${asset.id}@${asset.version}`);

  assert.ok(keys.includes("planner.intent.parse@v1"));
  assert.ok(keys.includes("agent.runtime.fallback_answer@v1"));
  assert.ok(keys.includes("agent.runtime.setup_guidance@v1"));
  assert.ok(keys.includes("agent.runtime.setup_ideation@v1"));
  assert.ok(keys.includes("planner.chapter.plan@v1"));
  assert.ok(keys.includes("novel.director.candidates@v1"));
  assert.ok(keys.includes("title.generation@v1"));
  assert.ok(keys.includes("audit.chapter.full@v1"));
  assert.ok(keys.includes("bookAnalysis.source.note@v1"));
  assert.ok(keys.includes("character.base.skeleton@v1"));
  assert.ok(keys.includes("novel.continuation.rewrite_similarity@v1"));
  assert.ok(keys.includes("novel.draft_optimize.selection@v1"));
  assert.ok(keys.includes("novel.draft_optimize.full@v1"));
  assert.ok(keys.includes("novel.framing.suggest@v1"));
  assert.ok(keys.includes("novel.production.characters@v1"));
  assert.ok(keys.includes("state.snapshot.extract@v1"));
  assert.ok(keys.includes("storyMode.tree.generate@v1"));
  assert.ok(keys.includes("storyWorldSlice.generate@v1"));
  assert.ok(keys.includes("style.generate@v1"));
  assert.ok(keys.includes("style.rewrite@v1"));
  assert.ok(keys.includes("style.profile.extract@v1"));
  assert.ok(keys.includes("style.recommendation@v1"));
  assert.ok(keys.includes("novel.review.chapter@v1"));
  assert.ok(keys.includes("world.inspiration.concept_card@v1"));
  assert.ok(keys.includes("world.inspiration.localize_concept_card@v1"));
  assert.ok(keys.includes("world.property_options.generate@v1"));
  assert.ok(keys.includes("world.deepening.questions@v1"));
  assert.ok(keys.includes("world.consistency.check@v1"));
  assert.ok(keys.includes("world.layer.generate@v1"));
  assert.ok(keys.includes("world.layer.localize@v1"));
  assert.ok(keys.includes("world.import.extract@v1"));
  assert.ok(keys.includes("world.reference.inspiration@v1"));
  assert.ok(keys.includes("world.structure.generate@v1"));

  const chapterAsset = getRegisteredPromptAsset("planner.chapter.plan", "v1");
  assert.ok(chapterAsset);
  assert.equal(chapterAsset.taskType, "planner");
});

test("context selection keeps the freshest structural source while preserving required status", () => {
  const blocks = [
    createContextBlock({
      id: "chapter_target",
      group: "chapter_target",
      priority: 100,
      required: true,
      content: "章节目标：推进主线",
    }),
    createContextBlock({
      id: "outline_source",
      group: "outline_source",
      priority: 96,
      required: true,
      conflictGroup: "structural_source",
      freshness: 2,
      content: "主线大纲：旧版结构源",
    }),
    createContextBlock({
      id: "volume_summary",
      group: "volume_summary",
      priority: 94,
      conflictGroup: "structural_source",
      freshness: 3,
      content: "卷级工作台：更新后的结构源",
    }),
    createContextBlock({
      id: "state_snapshot",
      group: "state_snapshot",
      priority: 98,
      required: true,
      content: "状态快照：当前推进到第三章",
    }),
    createContextBlock({
      id: "recent_decisions",
      group: "recent_decisions",
      priority: 40,
      content: "最近决策：".concat("低优先级参考。".repeat(80)),
    }),
  ];

  const selection = selectContextBlocks(blocks, {
    maxTokensBudget: 40,
    requiredGroups: ["chapter_target", "state_snapshot"],
    preferredGroups: ["outline_source", "volume_summary"],
    dropOrder: ["recent_decisions"],
  });

  const selectedIds = selection.selectedBlocks.map((block) => block.id);
  assert.ok(selectedIds.includes("chapter_target"));
  assert.ok(selectedIds.includes("state_snapshot"));
  assert.ok(selectedIds.includes("volume_summary"));
  assert.ok(!selectedIds.includes("outline_source"));
  assert.ok(selection.droppedBlockIds.includes("outline_source"));

  const structuralSource = selection.selectedBlocks.find((block) => block.id === "volume_summary");
  assert.ok(structuralSource);
  assert.equal(structuralSource.required, true);
});

test("workflow registry holds execution-first intents when collaboration is still required", () => {
  const resolution = resolveWorkflow({
    goal: "先一起打磨这本书，再决定要不要启动整本生成",
    intent: "produce_novel",
    confidence: 0.72,
    requiresNovelContext: false,
    interactionMode: "co_create",
    assistantResponse: "offer_options",
    shouldAskFollowup: true,
    missingInfo: ["主线承诺"],
    novelTitle: "信号轨道",
    chapterSelectors: {},
  }, {
    goal: "先一起打磨这本书，再决定要不要启动整本生成",
    messages: [],
    contextMode: "global",
  });

  assert.equal(resolution.holdForCollaboration, true);
  assert.deepEqual(resolution.actions, []);
});

test("workflow registry expands produce_novel into the fixed production chain", () => {
  const resolution = resolveWorkflow({
    goal: "创建一本 18 章小说并启动整本生成",
    intent: "produce_novel",
    confidence: 0.95,
    requiresNovelContext: false,
    novelTitle: "信号轨道",
    description: "一支打捞小队追逐木星附近漂流的档案站。",
    targetChapterCount: 18,
    chapterSelectors: {},
  }, {
    goal: "创建一本 18 章小说并启动整本生成",
    messages: [],
    contextMode: "global",
  });

  assert.deepEqual(resolution.actions.map((action) => action.tool), [
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
  assert.equal(resolution.actions[0].input.title, "信号轨道");
  assert.equal(resolution.actions[6].input.targetChapterCount, 18);
});

test("planner chapter prompt post validator rejects structurally unusable chapter plans", () => {
  assert.throws(() => plannerChapterPlanPrompt.postValidate({
    title: "第 3 章",
    objective: "",
    participants: [],
    reveals: [],
    riskNotes: [],
    hookTarget: "",
    planRole: null,
    phaseLabel: "",
    mustAdvance: [],
    mustPreserve: [],
    scenes: [],
  }, {
    scopeLabel: "章节规划",
  }, {
    blocks: [],
    selectedBlockIds: [],
    estimatedInputTokens: 0,
  }));
});
