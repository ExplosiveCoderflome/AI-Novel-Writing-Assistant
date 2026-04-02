const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createContextBlock,
} = require("../dist/prompting/core/contextBudget.js");
const {
  NOVEL_PROMPT_BUDGETS,
} = require("../dist/prompting/prompts/novel/promptBudgetProfiles.js");
const {
  runStructuredPrompt,
  setPromptRunnerLLMFactoryForTests,
  setPromptRunnerStructuredInvokerForTests,
  streamStructuredPrompt,
  streamTextPrompt,
} = require("../dist/prompting/core/promptRunner.js");
const {
  selectContextBlocks,
} = require("../dist/prompting/core/contextSelection.js");
const {
  getRegisteredPromptAsset,
} = require("../dist/prompting/registry.js");
const {
  resolveWorkflow,
} = require("../dist/prompting/workflows/workflowRegistry.js");
const {
  plannerChapterPlanPrompt,
} = require("../dist/prompting/prompts/planner/plannerPlan.prompts.js");
const {
  genreTreePrompt,
} = require("../dist/prompting/prompts/genre/genre.prompts.js");
const {
  titleGenerationPrompt,
} = require("../dist/prompting/prompts/helper/titleGeneration.prompt.js");
const {
  styleRewritePrompt,
} = require("../dist/prompting/prompts/style/style.prompts.js");
const {
  worldDraftGenerationPrompt,
  worldDraftRefineAlternativesPrompt,
} = require("../dist/prompting/prompts/world/worldDraft.prompts.js");
const {
  storyModeChildPrompt,
  storyModeTreePrompt,
} = require("../dist/prompting/prompts/storyMode/storyMode.prompts.js");
const {
  bookAnalysisSourceNotePrompt,
  bookAnalysisSectionPrompt,
} = require("../dist/prompting/prompts/bookAnalysis/bookAnalysis.prompts.js");
const {
  sanitizeWriterContextBlocks,
} = require("../dist/prompting/prompts/novel/chapterLayeredContext.js");
const {
  directorPlanBlueprintSchema,
} = require("../dist/services/novel/director/novelDirectorSchemas.js");

test("prompt registry exposes versioned planning assets", () => {
  const keys = [
    "planner.intent.parse@v1",
    "agent.runtime.fallback_answer@v1",
    "agent.runtime.setup_guidance@v1",
    "agent.runtime.setup_ideation@v1",
    "planner.chapter.plan@v1",
    "novel.director.candidates@v1",
    "novel.director.candidate_patch@v1",
    "novel.director.blueprint@v1",
    "novel.character.castOptions@v2",
    "novel.character.castOptions.repair@v1",
    "novel.character.castOptions.zhNormalize@v1",
    "novel.character.supplemental@v1",
    "novel.character.supplemental.zhNormalize@v1",
    "novel.story_macro.decomposition@v1",
    "title.generation@v1",
    "audit.chapter.full@v1",
    "bookAnalysis.source.note@v1",
    "character.base.skeleton@v1",
    "novel.continuation.rewrite_similarity@v1",
    "novel.draft_optimize.selection@v1",
    "novel.draft_optimize.full@v1",
    "novel.framing.suggest@v1",
    "novel.production.characters@v1",
    "state.snapshot.extract@v2",
    "storyMode.child.generate@v1",
    "storyMode.tree.generate@v1",
    "storyWorldSlice.generate@v1",
    "style.generate@v1",
    "style.rewrite@v1",
    "style.profile.extract@v1",
    "style.recommendation@v1",
    "novel.review.chapter@v1",
    "novel.chapter.writer@v2",
    "world.draft.generate@v1",
    "world.draft.refine@v1",
    "world.draft.refine_alternatives@v1",
    "world.inspiration.concept_card@v1",
    "world.inspiration.localize_concept_card@v1",
    "world.property_options.generate@v1",
    "world.deepening.questions@v1",
    "world.consistency.check@v1",
    "world.layer.generate@v1",
    "world.layer.localize@v1",
    "world.import.extract@v1",
    "world.reference.inspiration@v1",
    "world.structure.generate@v1",
  ];

  for (const key of keys) {
    const [id, version] = key.split("@");
    assert.ok(getRegisteredPromptAsset(id, version), `missing prompt asset ${key}`);
  }

  const chapterAsset = getRegisteredPromptAsset("planner.chapter.plan", "v1");
  assert.ok(chapterAsset);
  assert.equal(chapterAsset.taskType, "planner");
});

test("character cast prompt hardens real-name constraints and required gender output", () => {
  const asset = getRegisteredPromptAsset("novel.character.castOptions", "v2");
  assert.ok(asset);

  const messages = asset.render({
    optionCount: 3,
  }, {
    blocks: [
      createContextBlock({
        id: "idea",
        group: "idea_seed",
        priority: 100,
        required: true,
        content: "打工人刘雪婷穿越到秦朝成为太监，最后发现自己竟然就是赵高。",
      }),
      createContextBlock({
        id: "anchor",
        group: "protagonist_anchor",
        priority: 99,
        required: true,
        content: "主角当前身份：秦朝内廷太监。隐藏身份：赵高。",
      }),
      createContextBlock({
        id: "policy",
        group: "output_policy",
        priority: 100,
        required: true,
        content: "name 不能写成功能位，每个角色都必须输出 gender。",
      }),
    ],
    selectedBlockIds: ["idea", "anchor", "policy"],
    droppedBlockIds: [],
    summarizedBlockIds: [],
    estimatedInputTokens: 0,
  });

  assert.equal(messages.length, 2);
  assert.match(String(messages[0].content), /绝对禁止把功能词写进 name/);
  assert.match(String(messages[0].content), /每个角色都必须输出 gender/);
  assert.match(String(messages[0].content), /历史、穿越、宫廷、官场/);
  assert.match(String(messages[1].content), /storyFunction 负责写功能，name 不能写成功能位/);
});

test("novel main-chain prompt assets declare explicit non-zero context budgets", () => {
  const expectedBudgets = new Map([
    ["novel.director.candidates@v1", NOVEL_PROMPT_BUDGETS.directorCandidates],
    ["novel.director.candidate_patch@v1", NOVEL_PROMPT_BUDGETS.directorCandidatePatch],
    ["novel.director.blueprint@v1", NOVEL_PROMPT_BUDGETS.directorBlueprint],
    ["novel.story_macro.decomposition@v1", NOVEL_PROMPT_BUDGETS.storyMacroDecomposition],
    ["novel.story_macro.field_regeneration@v1", NOVEL_PROMPT_BUDGETS.storyMacroFieldRegeneration],
    ["novel.volume.strategy@v1", NOVEL_PROMPT_BUDGETS.volumeStrategy],
    ["novel.volume.strategy.critique@v1", NOVEL_PROMPT_BUDGETS.volumeStrategyCritique],
    ["novel.volume.skeleton@v2", NOVEL_PROMPT_BUDGETS.volumeSkeleton],
    ["novel.volume.beat_sheet@v1", NOVEL_PROMPT_BUDGETS.volumeBeatSheet],
    ["novel.volume.chapter_list@v4", NOVEL_PROMPT_BUDGETS.volumeChapterList],
    ["novel.volume.chapter_purpose@v1", NOVEL_PROMPT_BUDGETS.volumeChapterDetail],
    ["novel.volume.chapter_boundary@v1", NOVEL_PROMPT_BUDGETS.volumeChapterDetail],
    ["novel.volume.chapter_task_sheet@v1", NOVEL_PROMPT_BUDGETS.volumeChapterDetail],
    ["novel.volume.rebalance.adjacent@v1", NOVEL_PROMPT_BUDGETS.volumeRebalance],
    ["novel.chapter.writer@v2", NOVEL_PROMPT_BUDGETS.chapterWriter],
    ["novel.review.chapter@v1", NOVEL_PROMPT_BUDGETS.chapterReview],
    ["novel.review.repair@v1", NOVEL_PROMPT_BUDGETS.chapterRepair],
    ["audit.chapter.full@v1", NOVEL_PROMPT_BUDGETS.chapterReview],
  ]);

  for (const [key, budget] of expectedBudgets.entries()) {
    const [id, version] = key.split("@");
    const asset = getRegisteredPromptAsset(id, version);
    assert.ok(asset, `missing prompt asset ${key}`);
    assert.equal(asset.contextPolicy.maxTokensBudget, budget, `${key} budget mismatch`);
    assert.ok(asset.contextPolicy.maxTokensBudget > 0, `${key} should not use zero budget`);
  }
});

test("writer guard strips forbidden context groups before prompt execution", () => {
  const sanitized = sanitizeWriterContextBlocks([
    createContextBlock({
      id: "chapter_mission",
      group: "chapter_mission",
      priority: 100,
      required: true,
      content: "Chapter mission\n- push the conflict",
    }),
    createContextBlock({
      id: "full-outline",
      group: "full_outline",
      priority: 90,
      content: "Entire outline dump",
    }),
    createContextBlock({
      id: "anti-copy",
      group: "anti_copy_corpus",
      priority: 80,
      content: "Long anti-copy corpus",
    }),
  ]);

  assert.deepEqual(sanitized.allowedBlocks.map((block) => block.id), ["chapter_mission"]);
  assert.deepEqual(sanitized.removedBlockIds, ["full-outline", "anti-copy"]);
});

test("chapter writer prompt carries explicit target length and continuation instructions", () => {
  const asset = getRegisteredPromptAsset("novel.chapter.writer", "v2");
  assert.ok(asset);

  const draftMessages = asset.render({
    novelTitle: "霜轨档案",
    chapterOrder: 4,
    chapterTitle: "旧街反压",
    mode: "draft",
    targetWordCount: 3000,
    minWordCount: 2550,
    maxWordCount: 3450,
  }, {
    blocks: [],
    selectedBlockIds: [],
    droppedBlockIds: [],
    summarizedBlockIds: [],
    estimatedInputTokens: 0,
  });
  assert.match(String(draftMessages[0].content), /本章目标长度：约 3000 字/);
  assert.match(String(draftMessages[0].content), /2550-3450/);

  const continueMessages = asset.render({
    novelTitle: "霜轨档案",
    chapterOrder: 4,
    chapterTitle: "旧街反压",
    mode: "continue",
    targetWordCount: 3000,
    minWordCount: 2550,
    maxWordCount: 3450,
    missingWordGap: 900,
  }, {
    blocks: [],
    selectedBlockIds: [],
    droppedBlockIds: [],
    summarizedBlockIds: [],
    estimatedInputTokens: 0,
  });
  assert.match(String(continueMessages[0].content), /不得重写章节开头/);
  assert.match(String(continueMessages[0].content), /至少缺少约 900 字/);
  assert.match(String(continueMessages[1].content), /任务模式：补写当前章节/);
});

test("director blueprint schema accepts chapter shells without scenes", () => {
  const parsed = directorPlanBlueprintSchema.parse({
    bookPlan: {
      title: "霜轨档案",
      objective: "让主角在第一部中确认失踪档案站背后的真相方向。",
      hookTarget: "真相只是更大装置的入口。",
      participants: ["主角位", "对立位"],
      reveals: ["档案站仍在运行"],
      riskNotes: ["不要过早解释终局机制"],
    },
    arcs: [
      {
        title: "第一幕",
        objective: "建立困境和追查动机",
        summary: "主角被卷入异常信号并决定追查。",
        phaseLabel: "起局",
        hookTarget: "确认信号不是幻觉",
        participants: ["主角位"],
        reveals: ["异常信号真实存在"],
        riskNotes: ["开局不要信息过载"],
        chapters: [
          {
            title: "失真信号",
            objective: "让主角第一次接触异常现象并做出追查决定。",
            expectation: "写清异常现象、选择代价和章节结尾的新悬念。",
            planRole: "setup",
            hookTarget: "有人提前到过现场",
            participants: ["主角位"],
            reveals: ["信号带有人工痕迹"],
            riskNotes: ["不要直接解释来源"],
            mustAdvance: ["主角决定追查"],
            mustPreserve: ["异常来源仍未知"],
            scenes: [],
          },
          {
            title: "空轨车厢",
            objective: "让主角接近第一处关键现场。",
            expectation: "推进追查并提高危险感。",
            planRole: "progress",
            hookTarget: "车厢里残留第二个观察者痕迹",
            participants: ["主角位", "观察位"],
            reveals: ["现场被刻意清理过"],
            riskNotes: ["不要把对立位过早曝光"],
            mustAdvance: ["主角拿到关键线索"],
            mustPreserve: ["对立位身份仍隐藏"],
            scenes: [],
          },
        ],
      },
      {
        title: "第二幕",
        objective: "把调查升级为正面对抗",
        summary: "主角开始意识到自己已被盯上。",
        phaseLabel: "加压",
        hookTarget: "对立位第一次反制",
        participants: ["主角位", "对立位"],
        reveals: ["追查对象会主动反击"],
        riskNotes: ["不要让追查失去方向"],
        chapters: [
          {
            title: "暗门回响",
            objective: "让主角踏入更危险的封闭空间。",
            expectation: "写出探索、反制和新的未知。",
            planRole: "pressure",
            hookTarget: "主角发现自己已被标记",
            participants: ["主角位"],
            reveals: ["异常装置与主角有关"],
            riskNotes: ["不要解释装置全貌"],
            mustAdvance: ["主角确认自己已被卷入局内"],
            mustPreserve: ["终局真相仍远未揭晓"],
            scenes: [],
          },
          {
            title: "观测名单",
            objective: "抛出对立位的阶段性压力。",
            expectation: "让主角意识到时间窗口正在缩短。",
            planRole: "turn",
            hookTarget: "名单上出现主角的旧身份",
            participants: ["主角位", "对立位"],
            reveals: ["主角过去和档案站有关"],
            riskNotes: ["不要一次说穿旧身份细节"],
            mustAdvance: ["时间压力形成"],
            mustPreserve: ["旧身份细节仍保留到后续"],
            scenes: [],
          },
        ],
      },
    ],
  });

  assert.equal(parsed.arcs[0].chapters[0].scenes.length, 0);
  assert.deepEqual(parsed.arcs[0].chapters[0].mustAdvance, ["主角决定追查"]);
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
    droppedBlockIds: [],
    summarizedBlockIds: [],
    estimatedInputTokens: 0,
  }));
});

test("genre prompt render hardens retry instructions and forced JSON mode", () => {
  const messages = genreTreePrompt.render({
    prompt: "都市异能，主角从底层逆袭",
    retry: true,
    forceJson: true,
  }, {
    blocks: [],
    selectedBlockIds: [],
    droppedBlockIds: [],
    summarizedBlockIds: [],
    estimatedInputTokens: 0,
  });

  assert.equal(messages.length, 2);
  assert.match(String(messages[0].content), /只能返回一个 JSON 对象/);
  assert.match(String(messages[0].content), /支持稳定 JSON 输出/);
  assert.match(String(messages[1].content), /都市异能/);
});

test("title prompt render includes retry reason for regeneration attempts", () => {
  const messages = titleGenerationPrompt.render({
    context: {
      mode: "brief",
      count: 8,
      brief: "赛博修仙，主角靠因果算法登仙",
      referenceTitle: "",
      novelTitle: "",
      currentTitle: "",
      genreName: "仙侠",
      genreDescription: "赛博与修仙融合",
    },
    forceJson: true,
    retryReason: "标题风格分布过窄",
  }, {
    blocks: [],
    selectedBlockIds: [],
    droppedBlockIds: [],
    summarizedBlockIds: [],
    estimatedInputTokens: 0,
  });

  assert.equal(messages.length, 2);
  assert.match(String(messages[0].content), /标题风格分布过窄/);
  assert.match(String(messages[0].content), /支持稳定 JSON 输出/);
  assert.match(String(messages[1].content), /赛博修仙/);
});

test("story mode child prompt render includes parent and sibling grounding", () => {
  const messages = storyModeChildPrompt.render({
    prompt: "",
    count: 3,
    parentName: "种田流",
    parentDescription: "围绕稳定经营、资源积累和生活改善展开。",
    parentTemplate: "起步困境 -> 小规模经营 -> 阶段扩张 -> 稳定兑现",
    parentProfile: {
      coreDrive: "通过持续经营和阶段性改善推动连载体验。",
      readerReward: "看到生活逐步变好和资源持续积累。",
      progressionUnits: ["经营节点", "关系升温"],
      allowedConflictForms: ["经营压力", "邻里摩擦"],
      forbiddenConflictForms: ["无缘无故的极端生死战"],
      conflictCeiling: "medium",
      resolutionStyle: "用经营成果和关系修复化解问题。",
      chapterUnit: "一章解决一个经营或关系小问题。",
      volumeReward: "完成一轮生活升级或产业升级。",
      mandatorySignals: ["稳定改善", "可见积累"],
      antiSignals: ["长期脱离经营主线", "冲突烈度失控"],
    },
    existingSiblingNames: ["基建种田流", "日常治愈种田流"],
  }, {
    blocks: [],
    selectedBlockIds: [],
    droppedBlockIds: [],
    summarizedBlockIds: [],
    estimatedInputTokens: 0,
  });

  assert.equal(messages.length, 2);
  assert.match(String(messages[0].content), /必须精确生成 3 个子类节点/);
  assert.match(String(messages[0].content), /children 必须是 \[\]/);
  assert.match(String(messages[1].content), /父类名称：种田流/);
  assert.match(String(messages[1].content), /现有兄弟节点：基建种田流、日常治愈种田流/);
  assert.match(String(messages[1].content), /无。请直接基于父类逻辑和现有兄弟节点进行衍生/);
});

test("story mode child prompt post validator rejects duplicate sibling names and grandchildren", () => {
  assert.throws(() => storyModeChildPrompt.postValidate([
    {
      name: "基建种田流",
      description: "描述",
      template: "模板",
      profile: {
        coreDrive: "推进",
        readerReward: "奖励",
        progressionUnits: ["推进单元"],
        allowedConflictForms: ["允许冲突"],
        forbiddenConflictForms: ["禁止冲突"],
        conflictCeiling: "medium",
        resolutionStyle: "化解方式",
        chapterUnit: "章节单位",
        volumeReward: "卷奖励",
        mandatorySignals: ["必备信号"],
        antiSignals: ["反信号"],
      },
      children: [{ name: "孙级节点" }],
    },
  ], {
    prompt: "补一个偏经营执行的子类",
    count: 1,
    parentName: "种田流",
    parentDescription: "围绕经营展开。",
    parentTemplate: "",
    parentProfile: {
      coreDrive: "通过经营推进。",
      readerReward: "看经营改善。",
      progressionUnits: ["经营节点"],
      allowedConflictForms: ["经营摩擦"],
      forbiddenConflictForms: ["极端大战"],
      conflictCeiling: "medium",
      resolutionStyle: "经营修复。",
      chapterUnit: "一章一个小目标。",
      volumeReward: "一卷一次升级。",
      mandatorySignals: ["持续改善"],
      antiSignals: ["脱离经营主线"],
    },
    existingSiblingNames: ["基建种田流"],
  }));
});

test("book analysis source note prompt enforces grounded Chinese extraction", () => {
  const messages = bookAnalysisSourceNotePrompt.render({
    segmentLabel: "片段 1",
    segmentContent: "主角在雨夜第一次见到反派组织的信使。",
  }, {
    blocks: [],
    selectedBlockIds: [],
    droppedBlockIds: [],
    summarizedBlockIds: [],
    estimatedInputTokens: 0,
  });

  assert.equal(messages.length, 2);
  assert.match(String(messages[0].content), /只提取片段里明确存在或可低风险归纳的信息/);
  assert.match(String(messages[0].content), /禁止补写原文没有直接体现的人物动机、世界设定/);
  assert.match(String(messages[0].content), /evidence：提供最多3条证据/);
});

test("book analysis section prompt includes section-specific structuredData contract", () => {
  const messages = bookAnalysisSectionPrompt.render({
    sectionKey: "overview",
    sectionTitle: "拆书总览",
    promptFocus: "覆盖：一句话定位、题材标签、卖点标签。",
    notesText: "## 片段 1\n摘要：主角在底层逆袭。",
  }, {
    blocks: [],
    selectedBlockIds: [],
    droppedBlockIds: [],
    summarizedBlockIds: [],
    estimatedInputTokens: 0,
  });

  assert.equal(messages.length, 2);
  assert.match(String(messages[0].content), /oneLinePositioning/);
  assert.match(String(messages[0].content), /genreTags/);
  assert.match(String(messages[0].content), /若依据不足，必须明确承认“材料不足”/);
  assert.match(String(messages[0].content), /evidence 只保留最能支撑结论的 3-8 条证据/);
});

test("world draft generation post validator requires requested dimension coverage", () => {
  assert.throws(() => worldDraftGenerationPrompt.postValidate({
    description: "世界概述",
    background: "时代背景",
    conflicts: "主要冲突",
    cultures: "社会风貌",
    politics: "",
    races: "",
    religions: "",
    factions: "",
  }, {
    name: "雾潮城",
    description: "港城蒸汽与异能并存",
    worldType: "蒸汽异能",
    complexity: "standard",
    dimensions: {
      geography: false,
      culture: true,
      magicSystem: false,
      technology: false,
      history: false,
    },
  }));
});

test("world draft refine alternatives post validator enforces exact alternative count", () => {
  assert.throws(() => worldDraftRefineAlternativesPrompt.postValidate([
    { title: "方向 A", content: "内容 A" },
  ], {
    worldName: "雾潮城",
    attribute: "background",
    refinementLevel: "deep",
    currentValue: "原始背景",
    count: 2,
  }));
});

test("runStructuredPrompt forwards repair policy and context telemetry", async () => {
  const originalRepairPolicy = genreTreePrompt.repairPolicy;
  const originalContextPolicy = { ...genreTreePrompt.contextPolicy };
  let captured = null;

  genreTreePrompt.repairPolicy = { maxAttempts: 3 };
  genreTreePrompt.contextPolicy = {
    maxTokensBudget: 8,
    requiredGroups: ["core"],
    dropOrder: ["overflow"],
  };
  setPromptRunnerStructuredInvokerForTests(async (input) => {
    captured = input;
    return {
      data: {
        name: "都市",
        description: "现代高压世界下的异能成长",
        children: [],
      },
      repairUsed: true,
      repairAttempts: 2,
    };
  });

  try {
    const result = await runStructuredPrompt({
      asset: genreTreePrompt,
      promptInput: {
        prompt: "都市异能",
        retry: false,
        forceJson: true,
      },
      contextBlocks: [
        createContextBlock({
          id: "core-1",
          group: "core",
          priority: 100,
          required: true,
          content: [
            "核心设定：",
            "压迫。",
            "高压都市异能成长。".repeat(20),
          ].join("\n"),
        }),
        createContextBlock({
          id: "overflow-1",
          group: "overflow",
          priority: 10,
          content: "低优先级补充：".concat("次要背景。".repeat(20)),
        }),
      ],
    });

    assert.equal(captured.maxRepairAttempts, 3);
    assert.equal(captured.promptMeta.repairAttempts, 0);
    assert.equal(captured.promptMeta.semanticRetryAttempts, 0);
    assert.deepEqual(captured.promptMeta.droppedContextBlockIds, ["overflow-1"]);
    assert.deepEqual(captured.promptMeta.summarizedContextBlockIds, ["core-1"]);
    assert.equal(result.meta.invocation.repairUsed, true);
    assert.equal(result.meta.invocation.repairAttempts, 2);
    assert.equal(result.meta.invocation.semanticRetryUsed, false);
    assert.equal(result.meta.invocation.semanticRetryAttempts, 0);
    assert.deepEqual(result.meta.invocation.droppedContextBlockIds, ["overflow-1"]);
    assert.deepEqual(result.meta.invocation.summarizedContextBlockIds, ["core-1"]);
  } finally {
    genreTreePrompt.repairPolicy = originalRepairPolicy;
    genreTreePrompt.contextPolicy = originalContextPolicy;
    setPromptRunnerStructuredInvokerForTests();
  }
});

test("runStructuredPrompt retries semantically after postValidate failure", async () => {
  const originalSemanticRetryPolicy = plannerChapterPlanPrompt.semanticRetryPolicy;
  const calls = [];

  plannerChapterPlanPrompt.semanticRetryPolicy = { maxAttempts: 1 };
  setPromptRunnerStructuredInvokerForTests(async (input) => {
    calls.push(input);
    if (calls.length === 1) {
      return {
        data: {
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
        },
        repairUsed: false,
        repairAttempts: 0,
      };
    }
    return {
      data: {
        title: "第 3 章",
        objective: "让主角确认敌人的第一次公开动作",
        participants: ["林焰", "监察队"],
        reveals: ["敌人已经在城内布局"],
        riskNotes: ["不要把调查写成背景复述"],
        hookTarget: "章末留下敌人反制的悬念",
        planRole: "progress",
        phaseLabel: "第一次正面推进",
        mustAdvance: ["锁定敌人动作路径"],
        mustPreserve: ["主角仍处于弱势"],
        scenes: [{
          title: "夜巷追踪",
          objective: "发现异常交易",
          conflict: "监察队阻拦调查",
          reveal: "敌人已经提前渗透",
          emotionBeat: "紧张升级",
        }],
      },
      repairUsed: true,
      repairAttempts: 1,
    };
  });

  try {
    const result = await runStructuredPrompt({
      asset: plannerChapterPlanPrompt,
      promptInput: {
        scopeLabel: "章节规划",
      },
    });

    assert.equal(calls.length, 2);
    assert.equal(calls[0].promptMeta.semanticRetryUsed, false);
    assert.equal(calls[0].promptMeta.semanticRetryAttempts, 0);
    assert.equal(calls[1].promptMeta.semanticRetryUsed, true);
    assert.equal(calls[1].promptMeta.semanticRetryAttempts, 1);
    assert.match(String(calls[1].messages[calls[1].messages.length - 1].content), /Planner output is missing objective/);
    assert.match(String(calls[1].messages[calls[1].messages.length - 1].content), /上一次的 JSON 输出/);
    assert.equal(result.output.planRole, "progress");
    assert.equal(result.meta.invocation.repairUsed, true);
    assert.equal(result.meta.invocation.repairAttempts, 1);
    assert.equal(result.meta.invocation.semanticRetryUsed, true);
    assert.equal(result.meta.invocation.semanticRetryAttempts, 1);
  } finally {
    plannerChapterPlanPrompt.semanticRetryPolicy = originalSemanticRetryPolicy;
    setPromptRunnerStructuredInvokerForTests();
  }
});

test("streamTextPrompt buffers streamed output and resolves completion metadata", async () => {
  const originalContextPolicy = { ...styleRewritePrompt.contextPolicy };
  styleRewritePrompt.contextPolicy = {
    maxTokensBudget: 8,
    requiredGroups: ["core"],
    dropOrder: ["overflow"],
  };

  setPromptRunnerLLMFactoryForTests(async () => ({
    stream: async () => ({
      async *[Symbol.asyncIterator]() {
        yield { content: "修" };
        yield { content: "订" };
      },
    }),
  }));

  try {
    const handle = await streamTextPrompt({
      asset: styleRewritePrompt,
      promptInput: {
        styleBlock: "叙事紧凑",
        characterBlock: "动作表达情绪",
        antiAiBlock: "禁止解释性心理描写",
        content: "原文",
        issuesBlock: "问题",
      },
      contextBlocks: [
        createContextBlock({
          id: "core-1",
          group: "core",
          priority: 100,
          required: true,
          content: [
            "核心规则：",
            "外显。",
            "动作先于解释，情绪必须通过行为体现。".repeat(20),
          ].join("\n"),
        }),
        createContextBlock({
          id: "overflow-1",
          group: "overflow",
          priority: 10,
          content: "额外补充：".concat("低优先级。".repeat(20)),
        }),
      ],
    });

    const streamedChunks = [];
    for await (const chunk of handle.stream) {
      streamedChunks.push(String(chunk.content));
    }
    const completed = await handle.complete;

    assert.deepEqual(streamedChunks, ["修", "订"]);
    assert.equal(completed.output, "修订");
    assert.deepEqual(completed.meta.invocation.droppedContextBlockIds, ["overflow-1"]);
    assert.deepEqual(completed.meta.invocation.summarizedContextBlockIds, ["core-1"]);
    assert.equal(completed.meta.invocation.repairAttempts, 0);
  } finally {
    styleRewritePrompt.contextPolicy = originalContextPolicy;
    setPromptRunnerLLMFactoryForTests();
  }
});

test("streamStructuredPrompt parses streamed JSON and preserves telemetry", async () => {
  const originalContextPolicy = { ...genreTreePrompt.contextPolicy };
  genreTreePrompt.contextPolicy = {
    maxTokensBudget: 8,
    requiredGroups: ["core"],
    dropOrder: ["overflow"],
  };

  setPromptRunnerLLMFactoryForTests(async () => ({
    stream: async () => ({
      async *[Symbol.asyncIterator]() {
        yield { content: "{\"name\":\"都市\"" };
        yield { content: ",\"description\":\"异能成长\",\"children\":[]}" };
      },
    }),
  }));

  try {
    const handle = await streamStructuredPrompt({
      asset: genreTreePrompt,
      promptInput: {
        prompt: "都市异能",
        retry: false,
        forceJson: true,
      },
      contextBlocks: [
        createContextBlock({
          id: "core-1",
          group: "core",
          priority: 100,
          required: true,
          content: [
            "核心设定：",
            "成长。",
            "都市异能成长，底层主角持续承压。".repeat(20),
          ].join("\n"),
        }),
        createContextBlock({
          id: "overflow-1",
          group: "overflow",
          priority: 10,
          content: "补充：".concat("低优先级。".repeat(20)),
        }),
      ],
    });

    for await (const _chunk of handle.stream) {
      // drain stream
    }
    const completed = await handle.complete;

    assert.equal(completed.output.name, "都市");
    assert.deepEqual(completed.meta.invocation.droppedContextBlockIds, ["overflow-1"]);
    assert.deepEqual(completed.meta.invocation.summarizedContextBlockIds, ["core-1"]);
    assert.equal(completed.meta.invocation.repairAttempts, 0);
  } finally {
    genreTreePrompt.contextPolicy = originalContextPolicy;
    setPromptRunnerLLMFactoryForTests();
  }
});

test("streamStructuredPrompt parses top-level array outputs and ignores trailing text", async () => {
  setPromptRunnerLLMFactoryForTests(async () => ({
    stream: async () => ({
      async *[Symbol.asyncIterator]() {
        yield {
          content: [
            "[",
            "{\"name\":\"经营种田流\",\"description\":\"偏经营与资源积累\",\"template\":\"起步经营 -> 扩张增产\",\"profile\":{\"coreDrive\":\"通过持续经营推进连载\",\"readerReward\":\"看资源积累与生活改善\",\"progressionUnits\":[\"经营节点\"],\"allowedConflictForms\":[\"经营压力\"],\"forbiddenConflictForms\":[\"无缘无故的极端大战\"],\"conflictCeiling\":\"medium\",\"resolutionStyle\":\"靠经营成果化解问题\",\"chapterUnit\":\"每章解决一个经营小问题\",\"volumeReward\":\"完成一次产业升级\",\"mandatorySignals\":[\"稳定改善\"],\"antiSignals\":[\"长期脱离经营主线\"]},\"children\":[]},",
            "{\"name\":\"人情种田流\",\"description\":\"偏邻里互动与关系经营\",\"template\":\"落地安家 -> 人情往来 -> 关系兑现\",\"profile\":{\"coreDrive\":\"通过人情关系与生活改善推进故事\",\"readerReward\":\"看关系升温与日常兑现\",\"progressionUnits\":[\"关系节点\"],\"allowedConflictForms\":[\"邻里摩擦\"],\"forbiddenConflictForms\":[\"无端灭门大战\"],\"conflictCeiling\":\"medium\",\"resolutionStyle\":\"靠关系修复与生活改善收束\",\"chapterUnit\":\"每章推进一个人情或生活小目标\",\"volumeReward\":\"形成稳定社群或生活圈\",\"mandatorySignals\":[\"生活感\",\"关系升温\"],\"antiSignals\":[\"长期偏离日常主线\"]},\"children\":[]}",
            "]\n以上为候选。",
          ].join(""),
        };
      },
    }),
  }));

  try {
    const handle = await streamStructuredPrompt({
      asset: storyModeChildPrompt,
      promptInput: {
        prompt: "",
        count: 2,
        parentName: "种田流",
        parentDescription: "围绕经营和生活改善。",
        parentTemplate: "安家落地 -> 经营改善 -> 阶段升级",
        parentProfile: {
          coreDrive: "通过稳定改善推动连载体验。",
          readerReward: "看到生活持续变好。",
          progressionUnits: ["经营节点"],
          allowedConflictForms: ["经营摩擦"],
          forbiddenConflictForms: ["极端大战"],
          conflictCeiling: "medium",
          resolutionStyle: "靠经营和关系修复问题。",
          chapterUnit: "每章一个小改善。",
          volumeReward: "一卷完成一次阶段升级。",
          mandatorySignals: ["持续改善"],
          antiSignals: ["长期偏离经营主线"],
        },
        existingSiblingNames: [],
      },
    });

    for await (const _chunk of handle.stream) {
      // drain stream
    }
    const completed = await handle.complete;

    assert.equal(completed.output.length, 2);
    assert.equal(completed.output[0].name, "经营种田流");
    assert.equal(completed.output[1].name, "人情种田流");
  } finally {
    setPromptRunnerLLMFactoryForTests();
  }
});

test("streamStructuredPrompt can recover with semantic retry after streamed output fails post validation", async () => {
  const originalSemanticRetryPolicy = plannerChapterPlanPrompt.semanticRetryPolicy;
  let retryCall = null;

  plannerChapterPlanPrompt.semanticRetryPolicy = { maxAttempts: 1 };
  setPromptRunnerLLMFactoryForTests(async () => ({
    stream: async () => ({
      async *[Symbol.asyncIterator]() {
        yield { content: "{\"title\":\"第 3 章\",\"objective\":\"\",\"participants\":[],\"reveals\":[],\"riskNotes\":[]," };
        yield { content: "\"hookTarget\":\"\",\"planRole\":null,\"phaseLabel\":\"\",\"mustAdvance\":[],\"mustPreserve\":[],\"scenes\":[]}" };
      },
    }),
  }));
  setPromptRunnerStructuredInvokerForTests(async (input) => {
    retryCall = input;
    return {
      data: {
        title: "第 3 章",
        objective: "主角确认敌方试探已经开始",
        participants: ["林焰", "敌方探子"],
        reveals: ["敌人已经渗入城防"],
        riskNotes: ["不要只写调查结果，要保留冲突推进"],
        hookTarget: "章末抛出更大威胁",
        planRole: "progress",
        phaseLabel: "威胁显形",
        mustAdvance: ["确认敌方布局"],
        mustPreserve: ["主角仍然缺乏资源"],
        scenes: [{
          title: "暗巷截获",
          objective: "拿到敌方信号",
          conflict: "探子准备灭口",
          reveal: "城防内部已有内应",
          emotionBeat: "危机升级",
        }],
      },
      repairUsed: false,
      repairAttempts: 0,
    };
  });

  try {
    const handle = await streamStructuredPrompt({
      asset: plannerChapterPlanPrompt,
      promptInput: {
        scopeLabel: "章节规划",
      },
    });

    for await (const _chunk of handle.stream) {
      // drain stream
    }
    const completed = await handle.complete;

    assert.ok(retryCall);
    assert.equal(retryCall.promptMeta.semanticRetryUsed, true);
    assert.equal(retryCall.promptMeta.semanticRetryAttempts, 1);
    assert.match(String(retryCall.messages[retryCall.messages.length - 1].content), /Planner output is missing objective/);
    assert.equal(completed.output.planRole, "progress");
    assert.equal(completed.meta.invocation.semanticRetryUsed, true);
    assert.equal(completed.meta.invocation.semanticRetryAttempts, 1);
    assert.equal(completed.meta.invocation.repairAttempts, 0);
  } finally {
    plannerChapterPlanPrompt.semanticRetryPolicy = originalSemanticRetryPolicy;
    setPromptRunnerLLMFactoryForTests();
    setPromptRunnerStructuredInvokerForTests();
  }
});
