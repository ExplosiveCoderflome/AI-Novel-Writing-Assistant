const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildAlternativePathFromRejectedApproval,
  summarizeOutput,
} = require("../dist/agents/runtime/runtimeHelpers.js");
const { composeAssistantMessage } = require("../dist/agents/runtime/answerComposer.js");
const { setNovelSetupGuidanceLLMFactoryForTests } = require("../dist/agents/runtime/novelSetupGuidanceComposer.js");
const { setNovelSetupIdeationLLMFactoryForTests } = require("../dist/agents/runtime/novelSetupIdeationComposer.js");
const { buildCreativeHubTurnSummary } = require("../dist/creativeHub/creativeHubTurnSummary.js");
const { deriveNextBindingsFromRunSteps } = require("../dist/creativeHub/creativeHubRuntimeHelpers.js");

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

test("buildCreativeHubTurnSummary skips pure setup chat turns without tool results", () => {
  const summary = buildCreativeHubTurnSummary({
    checkpointId: "checkpoint-1",
    goal: "我想写一本小说",
    threadStatus: "idle",
    latestError: null,
    plannerResult: {
      source: "llm",
      validationWarnings: [],
      structuredIntent: {
        goal: "我想写一本小说",
        intent: "create_novel",
        confidence: 0.88,
        requiresNovelContext: false,
        chapterSelectors: {},
      },
      actions: [],
    },
    executionResult: {
      run: {
        id: "run-setup-1",
        status: "succeeded",
        currentStep: null,
      },
      approvals: [],
      steps: [],
      latestError: null,
    },
    interrupts: [],
    productionStatus: null,
  });

  assert.equal(summary, null);
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

test("composeAssistantMessage summarizes world unbinding", async () => {
  const text = await composeAssistantMessage(
    "不使用妻孝世界观了",
    "执行摘要",
    [{
      tool: "unbind_world_from_novel",
      success: true,
      summary: "已将世界观《妻孝世界观》从小说《妻子的秘密交易》解绑。",
      output: {
        novelId: "novel-1",
        novelTitle: "妻子的秘密交易",
        previousWorldId: "world-1",
        previousWorldName: "妻孝世界观",
        worldId: null,
        worldName: null,
        summary: "已将世界观《妻孝世界观》从小说《妻子的秘密交易》解绑。",
      },
    }],
    false,
    { contextMode: "novel", novelId: "novel-1", worldId: "world-1" },
    {
      goal: "不使用妻孝世界观了",
      intent: "unbind_world_from_novel",
      confidence: 0.92,
      requiresNovelContext: true,
      chapterSelectors: {},
    },
  );
  assert.match(text, /解绑/);
  assert.match(text, /妻孝世界观/);
});

test("composeAssistantMessage asks a warm kickoff question when create_novel lacks title", async () => {
  const captured = [];
  setNovelSetupGuidanceLLMFactoryForTests(async () => ({
    invoke: async (messages) => {
      captured.push(messages);
      return {
        content: "当然可以。你想先给这本书起个暂定名字，还是先告诉我你更想写什么类型、谁来当主角？",
      };
    },
  }));
  try {
    const text = await composeAssistantMessage(
      "我想写一本小说",
      "执行摘要",
      [],
      false,
      { contextMode: "global" },
      {
        goal: "我想写一本小说",
        intent: "create_novel",
        confidence: 0.86,
        requiresNovelContext: false,
        chapterSelectors: {},
      },
    );
    assert.equal(text, "当然可以。你想先给这本书起个暂定名字，还是先告诉我你更想写什么类型、谁来当主角？");
    assert.match(captured[0][1].content, /当前还没有创建成功的小说/);
    assert.match(captured[0][1].content, /用户还没有明确标题/);
  } finally {
    setNovelSetupGuidanceLLMFactoryForTests();
  }
});

test("composeAssistantMessage guides setup after create_novel", async () => {
  const captured = [];
  setNovelSetupGuidanceLLMFactoryForTests(async () => ({
    invoke: async (messages) => {
      captured.push(messages);
      return {
        content: "《风雪断桥》已经开好了，我们先把故事抓手定稳一点。你更想先聊主角是谁、他卡在什么冲突里，还是我先给你几种题材方向做选择？",
      };
    },
  }));
  try {
    const text = await composeAssistantMessage(
      "创建一本小说《风雪断桥》",
      "执行摘要",
      [
        {
          tool: "create_novel",
          success: true,
          summary: "已创建小说《风雪断桥》，当前进入初始化引导。",
          output: {
            novelId: "novel-setup-1",
            title: "风雪断桥",
            status: "draft",
            chapterCount: 0,
            summary: "已创建小说《风雪断桥》，当前进入初始化引导。",
            setup: {
              novelId: "novel-setup-1",
              title: "风雪断桥",
              stage: "setup_in_progress",
              completionRatio: 17,
              completedCount: 1,
              totalCount: 6,
              missingItems: ["题材与风格", "叙事配置", "世界观基础"],
              nextQuestion: "这本书想讲谁、遇到什么冲突、最后要把故事推向哪里？",
              recommendedAction: "先帮我补这本书的一句话设定，明确主角、核心冲突和故事承诺。",
              checklist: [],
            },
          },
        },
      ],
      false,
      { contextMode: "global" },
      {
        goal: "创建一本小说《风雪断桥》",
        intent: "create_novel",
        confidence: 0.92,
        requiresNovelContext: false,
        novelTitle: "风雪断桥",
        chapterSelectors: {},
      },
    );
    assert.equal(text, "《风雪断桥》已经开好了，我们先把故事抓手定稳一点。你更想先聊主角是谁、他卡在什么冲突里，还是我先给你几种题材方向做选择？");
    assert.match(captured[0][1].content, /题材与风格、叙事配置、世界观基础/);
    assert.match(captured[0][1].content, /系统建议提问：这本书想讲谁、遇到什么冲突、最后要把故事推向哪里？/);
  } finally {
    setNovelSetupGuidanceLLMFactoryForTests();
  }
});

test("composeAssistantMessage generates setup options from grounded novel facts", async () => {
  const captured = [];
  setNovelSetupIdeationLLMFactoryForTests(async () => ({
    invoke: async (messages) => {
      captured.push(messages);
      return {
        content: [
          "1. 方案一：主角是没落豪门赘婿，被迫卷入妻子背后的地下交易网，故事走压抑黑色都市线。",
          "2. 方案二：主角是调查记者丈夫，顺着妻子的异常消费挖出更大的阶层献祭秘密，故事偏悬疑反转。",
          "3. 方案三：主角是被家庭伦理绑住的普通人，在守住婚姻与自我尊严之间被不断逼迫，故事更偏情绪撕裂。",
          "你可以先挑最接近的一版，我再继续把它细化成一句话设定。",
        ].join("\n"),
      };
    },
  }));
  try {
    const text = await composeAssistantMessage(
      "基于当前标题和已有信息，为这本小说提供 3 套核心设定备选。每套都要包含主角、核心冲突、目标和题材气质。",
      "执行摘要",
      [
        {
          tool: "get_novel_context",
          success: true,
          summary: "已读取小说总览。",
          output: {
            novelId: "novel-1",
            title: "妻子的秘密交易",
            description: "都市婚姻危机题材，围绕妻子隐秘交易展开。",
            genre: "都市情感",
            styleTone: "压抑黑暗",
            narrativePov: "third_person",
            pacePreference: "balanced",
            projectMode: "co_pilot",
            emotionIntensity: "high",
            aiFreedom: "medium",
            defaultChapterLength: 2800,
            worldId: "world-1",
            worldName: "黑暗都市",
            outline: null,
            structuredOutline: null,
            chapterCount: 0,
            completedChapterCount: 0,
            latestCompletedChapterOrder: null,
            chapterSummary: [],
          },
        },
        {
          tool: "get_story_bible",
          success: true,
          summary: "已读取小说圣经设定。",
          output: {
            novelId: "novel-1",
            exists: true,
            coreSetting: "婚姻与忠诚不断被利益侵蚀。",
            forbiddenRules: null,
            mainPromise: "在背叛与尊严之间不断撕扯。",
            characterArcs: null,
            worldRules: null,
          },
        },
        {
          tool: "get_world_constraints",
          success: true,
          summary: "已读取世界观约束：黑暗都市。",
          output: {
            worldId: "world-1",
            novelId: "novel-1",
            worldName: "黑暗都市",
            constraints: {
              axioms: "权势与金钱主导亲密关系。",
              magicSystem: null,
              conflicts: "阶层碾压与婚姻博弈交织。",
              consistencyReport: null,
            },
          },
        },
      ],
      false,
      { contextMode: "novel", novelId: "novel-1" },
      {
        goal: "基于当前标题和已有信息，为这本小说提供 3 套核心设定备选。每套都要包含主角、核心冲突、目标和题材气质。",
        intent: "ideate_novel_setup",
        confidence: 0.93,
        requiresNovelContext: true,
        chapterSelectors: {},
      },
    );
    assert.match(text, /方案一/);
    assert.match(text, /挑最接近的一版/);
    assert.match(captured[0][1].content, /妻子的秘密交易/);
    assert.match(captured[0][1].content, /都市婚姻危机题材/);
    assert.match(captured[0][1].content, /婚姻与忠诚不断被利益侵蚀/);
  } finally {
    setNovelSetupIdeationLLMFactoryForTests();
  }
});

test("deriveNextBindingsFromRunSteps clears world binding after unbind tool", () => {
  const next = deriveNextBindingsFromRunSteps({
    novelId: "novel-1",
    chapterId: null,
    worldId: "world-1",
    taskId: null,
    bookAnalysisId: null,
    formulaId: null,
    baseCharacterId: null,
    knowledgeDocumentIds: [],
  }, [{
    stepType: "tool_result",
    status: "succeeded",
    inputJson: JSON.stringify({
      tool: "unbind_world_from_novel",
    }),
    outputJson: JSON.stringify({
      novelId: "novel-1",
      worldId: null,
      worldName: null,
    }),
  }]);

  assert.equal(next.novelId, "novel-1");
  assert.equal(next.worldId, null);
});
