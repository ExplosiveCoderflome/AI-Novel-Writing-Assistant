const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildAlternativePathFromRejectedApproval,
  summarizeOutput,
} = require("../dist/agents/runtime/runtimeHelpers.js");
const { composeAssistantMessage } = require("../dist/agents/runtime/answerComposer.js");

test("rejected pipeline approval falls back to preview only", () => {
  const result = buildAlternativePathFromRejectedApproval({
    goal: "写第三章",
    context: { contextMode: "novel", novelId: "novel-1" },
    plannedActions: [{
      agent: "Planner",
      reasoning: "execute",
      calls: [{
        tool: "queue_pipeline_run",
        reason: "queue",
        idempotencyKey: "k1",
        input: { novelId: "novel-1", startOrder: 3, endOrder: 3 },
      }],
    }],
  });
  assert.equal(result[0].calls[0].tool, "preview_pipeline_run");
});

test("summarizeOutput handles chapter range summary", () => {
  const text = summarizeOutput("summarize_chapter_range", {
    startOrder: 1,
    endOrder: 3,
  });
  assert.equal(text, "已总结第1到第3章。");
});

test("composeAssistantMessage summarizes produce_novel before queue approval", async () => {
  const text = await composeAssistantMessage(
    "创建一本20章小说《抗日奇侠传》，并开始整本生成",
    "执行摘要",
    [
      {
        tool: "create_novel",
        success: true,
        summary: "已创建小说《抗日奇侠传》。",
        output: {
          novelId: "novel-1",
          title: "抗日奇侠传",
        },
      },
      {
        tool: "generate_world_for_novel",
        success: true,
        summary: "已生成世界观。",
        output: {
          novelId: "novel-1",
          worldId: "world-1",
          worldName: "抗战异闻录",
        },
      },
      {
        tool: "generate_novel_characters",
        success: true,
        summary: "已生成核心角色。",
        output: {
          novelId: "novel-1",
          characterCount: 5,
        },
      },
      {
        tool: "generate_story_bible",
        success: true,
        summary: "已生成小说圣经。",
        output: {
          novelId: "novel-1",
        },
      },
      {
        tool: "generate_novel_outline",
        success: true,
        summary: "已生成发展走向。",
        output: {
          novelId: "novel-1",
        },
      },
      {
        tool: "generate_structured_outline",
        success: true,
        summary: "已生成结构化大纲。",
        output: {
          novelId: "novel-1",
          targetChapterCount: 20,
        },
      },
      {
        tool: "sync_chapters_from_structured_outline",
        success: true,
        summary: "已同步章节目录。",
        output: {
          novelId: "novel-1",
          chapterCount: 20,
        },
      },
      {
        tool: "preview_pipeline_run",
        success: true,
        summary: "已完成整本写作预览。",
        output: {
          novelId: "novel-1",
          startOrder: 1,
          endOrder: 20,
        },
      },
    ],
    true,
    { contextMode: "novel", novelId: "novel-1" },
    {
      goal: "创建一本20章小说《抗日奇侠传》，并开始整本生成",
      intent: "produce_novel",
      confidence: 0.95,
      requiresNovelContext: false,
      novelTitle: "抗日奇侠传",
      targetChapterCount: 20,
      chapterSelectors: {},
    },
  );
  assert.match(text, /核心资产已生成完成/);
  assert.match(text, /等待审批/);
});

test("composeAssistantMessage summarizes production status query", async () => {
  const text = await composeAssistantMessage(
    "整本生成到哪一步了",
    "执行摘要",
    [
      {
        tool: "get_novel_production_status",
        success: true,
        summary: "已读取整本生产状态。",
        output: {
          novelId: "novel-1",
          title: "抗日奇侠传",
          currentStage: "等待启动整本写作",
          chapterCount: 20,
          targetChapterCount: 20,
          pipelineStatus: null,
          failureSummary: null,
          recoveryHint: "当前资产已准备完成，可在审批通过后启动整本写作。",
        },
      },
    ],
    false,
    { contextMode: "novel", novelId: "novel-1" },
    {
      goal: "整本生成到哪一步了",
      intent: "query_novel_production_status",
      confidence: 0.92,
      requiresNovelContext: true,
      chapterSelectors: {},
    },
  );
  assert.match(text, /等待启动整本写作/);
  assert.match(text, /20\/20 章/);
  assert.match(text, /审批通过后启动整本写作/);
});
