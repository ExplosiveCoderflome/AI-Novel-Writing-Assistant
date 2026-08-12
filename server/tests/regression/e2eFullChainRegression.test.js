/**
 * e2eFullChainRegression.test.js
 * 全链路真实回归测试套件 (E2E Full-Chain Real Production Regression Suite)
 * 基于 6 维黄金基准数据集 (novelE2EBenchmarkFixture.js) 完整调用服务端真实领域服务、状态演进、张力引擎与模型路由。
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildGoldenE2EBenchmarkData } = require("../fixtures/novelE2EBenchmarkFixture");

// 1. 引入真实大导演接管模块与 Pipeline 运行时
const {
  DIRECTOR_TAKEOVER_STAGE_META,
  TAKEOVER_ENTRY_META,
  hasMeaningfulSeedMaterial,
  splitToneKeywords,
  buildTakeoverIdea,
} = require("../../dist/services/novel/director/runtime/novelDirectorTakeoverMeta.js");

const {
  NovelDirectorPipelineRuntime,
} = require("../../dist/services/novel/director/novelDirectorPipelineRuntime.js");

// 2. 引入真实世界观处理服务、可视化图谱、张力引擎与一致性服务
const {
  normalizeWorldStructuredData,
} = require("../../dist/services/world/structure/worldStructureNormalizers.js");

const {
  buildFallbackWorldVisualizationPayload,
  buildWorldVisualizationPayload,
} = require("../../dist/services/world/worldVisualization.js");

const {
  buildConsistencySummary,
  localizeConsistencyIssue,
} = require("../../dist/services/world/worldConsistency.js");

const {
  TensionAndConflictEngine,
} = require("../../dist/services/world/TensionAndConflictEngine.js");

// 3. 引入真实角色代理模拟引擎
const {
  CharacterAgentSimulator,
} = require("../../dist/services/world/CharacterAgentSimulator.js");

// 4. 引入共享数值 Bounds Clamp 校验模块
const {
  clampScore,
  clampWordCount,
  STRUCTURED_CHAPTER_BOUNDS,
} = require("../../../shared/dist/utils/numberBounds.js");

// 5. 引入真实模型路由服务
const {
  resolveModel,
  MODEL_ROUTE_TASK_TYPES,
} = require("../../dist/llm/modelRouter.js");

test("E2E Regression Benchmark Suite - 6-Node Real Service Validation", async (t) => {
  const benchmarkData = buildGoldenE2EBenchmarkData();

  await t.test("Node 1: Novel Framing & Real Director Pipeline Intake Analysis", async () => {
    const novelContext = {
      id: benchmarkData.novel.id,
      title: benchmarkData.novel.title,
      description: benchmarkData.novel.description,
      targetAudience: benchmarkData.novel.targetAudience,
      bookSellingPoint: benchmarkData.novel.bookSellingPoint,
      competingFeel: benchmarkData.novel.competingFeel,
      first30ChapterPromise: benchmarkData.novel.first30ChapterPromise,
      commercialTags: benchmarkData.novel.commercialTags,
      genreId: benchmarkData.novel.genreId,
      worldId: benchmarkData.novel.worldId,
      styleTone: benchmarkData.novel.styleTone,
    };

    // 运行真实种子素材分析与 Idea 组装
    assert.equal(hasMeaningfulSeedMaterial(novelContext), true, "必须识别出有效种子素材");
    const keywords = splitToneKeywords(novelContext);
    assert.equal(Array.isArray(keywords), true);
    assert.ok(keywords.length > 0, "必须提取出语气与对标标签");
    const idea = buildTakeoverIdea(novelContext);
    assert.ok(idea.includes(benchmarkData.novel.title), "接管 Idea 必须包含小说标题");
    assert.ok(TAKEOVER_ENTRY_META.basic.label.length > 0, "必须具备基础接管节点 Label");
    assert.ok(DIRECTOR_TAKEOVER_STAGE_META.story_macro.label.length > 0, "必须具备宏观规划节点 Label");

    // 实例化真实 NovelDirectorPipelineRuntime 并校验阶段定位与指令接收
    const mockDeps = {
      workflowService: {},
      novelContextService: { async listCharacters() { return []; } },
      characterDynamicsService: {},
      characterPreparationService: { async listCharacterCastOptions() { return []; } },
      storyMacroService: { async getPlan() { return null; } },
      bookContractService: { async getByNovelId() { return null; } },
      volumeService: { async getVolumes() { return null; } },
      chapterLifecycleService: { async listChapters() { return []; } },
      runtimeOrchestrator: { async runStepModule() { return { status: "completed" }; } },
    };
    const pipelineRuntime = new NovelDirectorPipelineRuntime(mockDeps);
    const safeStartPhase = await pipelineRuntime.resolveSafePipelineStartPhase({
      novelId: benchmarkData.novel.id,
      requestedPhase: "story_macro",
      request: { input: idea },
    });
    assert.equal(safeStartPhase, "story_macro", "Pipeline 初始阶段解析必须为 story_macro");
  });

  await t.test("Node 2: Real World Structure, Tension Engine & Consistency Pipeline", async () => {
    const { world } = benchmarkData;

    // 1. 调用真实结构规范化服务
    const structuredHandbook = normalizeWorldStructuredData({
      factions: world.factions,
      rules: world.ruleAxioms.map((text, idx) => ({ id: `rule_${idx}`, name: text, category: "axiom" })),
    });
    assert.ok(structuredHandbook.factions, "规范化服务必须输出 factions 结构节点");
    assert.ok(structuredHandbook.rules, "规范化服务必须输出 rules 结构节点");

    // 2. 调用真实离线降级与线上可视化图谱引擎
    const fallbackPayload = buildFallbackWorldVisualizationPayload({
      ...world,
      structure: structuredHandbook,
    });
    assert.ok(Array.isArray(fallbackPayload.factionGraph.nodes), "离线可视化 Payload 必须包含阵营图谱节点数组");
    assert.ok(fallbackPayload.factionGraph.nodes.length > 0, "离线可视化引擎必须提取出非空节点");

    // 3. 调用真实张力引擎 (TensionAndConflictEngine) 计算
    const tensionEngine = new TensionAndConflictEngine();
    const location = { hazardLevel: 8, securityModifier: -2 };
    const agents = [
      { id: "char-001", stress: 80 },
      { id: "char-002", stress: 90 },
    ];
    const relations = [{ agentAId: "char-001", agentBId: "char-002", tension: 2.5 }];
    const calculatedLocalTension = tensionEngine.calculateLocalTension(location, agents, relations);
    assert.ok(calculatedLocalTension > 50, "张力引擎高冲突算力输出必须大于 50");

    const calculatedGlobalTension = tensionEngine.calculateGlobalTension([calculatedLocalTension, 65, 40], 5);
    assert.ok(calculatedGlobalTension >= 60, "全局故事张力加权计算必须 >= 60");

    // 4. 调用真实一致性总结与本地化服务
    const summary = buildConsistencySummary("warning", 0, 1);
    assert.ok(summary.includes("警告"), "一致性总结必须包含中文警告标识");

    const localizedIssue = localizeConsistencyIssue(world.consistencyIssues[0]);
    assert.ok(localizedIssue.description.length > 0, "一致性问题描述必须合法归一化");
  });

  await t.test("Node 3: 5-Character Cast & Real Agent Memory Decay Simulation", () => {
    const { characters, characterRelations } = benchmarkData;
    assert.equal(characters.length, 5, "必须包含 5 人完整角色阵营");
    assert.equal(characterRelations.length, 4, "必须包含 4 条动态 2D 关系演进边");

    // 运行真实角色代理记忆衰减算法 (CharacterAgentSimulator)
    const simulator = new CharacterAgentSimulator();
    const memories = [
      { id: "mem-1", content: "遭受执法堂酷刑逼供", salience: 0.95, lastUpdatedTick: 1 },
      { id: "mem-2", content: "琐碎杂事记忆", salience: 0.18, lastUpdatedTick: 1 },
    ];
    // 模拟 10 个 tick 后的记忆遗忘衰减
    const decayed = simulator.decayMemories(memories, 11, 0.05);
    assert.ok(decayed.length < memories.length || decayed[1].salience < 0.18, "艾宾浩斯记忆衰减后显性分必须降低或低分被清除");

    const protagonist = characters.find((c) => c.roleType === "protagonist");
    assert.ok(protagonist && protagonist.personalities.length === 3, "主角必须具备 3 条个性特征");
  });

  await t.test("Node 4: Volume Strategy & Real Number Bounds Clamp Protection", () => {
    const { volumes } = benchmarkData;
    assert.equal(volumes.length, 2, "必须包含 2 卷规划");
    const firstChapter = volumes[0].chapters[0];

    // 执行真实 Bound Clamp 计算
    const clampedConflict = clampScore(firstChapter.conflictLevel);
    assert.equal(clampedConflict, 85, "冲突等级 Clamp 必须收敛为 85");

    const clampedWordCount = clampWordCount(firstChapter.targetWordCount);
    assert.equal(clampedWordCount, 3000, "目标字数 Clamp 必须收敛为 3000");

    // 边界极值测试
    assert.equal(clampScore(150), STRUCTURED_CHAPTER_BOUNDS.MAX_PERCENTAGE, "超上限 Clamp 应收敛为 100");
    assert.equal(clampScore(-20), STRUCTURED_CHAPTER_BOUNDS.MIN_PERCENTAGE, "超下限 Clamp 应收敛为 0");
    assert.equal(clampWordCount(50), STRUCTURED_CHAPTER_BOUNDS.MIN_WORD_COUNT, "超低字数 Clamp 应收敛为 200");
  });

  await t.test("Node 5: Style Profile Resolution & Anti-AI Risk Assessment", () => {
    const { styleProfile } = benchmarkData;
    assert.equal(styleProfile.selectedExtractionPresetKey, "balanced");

    // 评估反 AI 规则风险分值过滤器逻辑
    const highRiskRules = styleProfile.antiAiRules.filter((r) => r.riskScore >= 0.85);
    assert.equal(highRiskRules.length, 1, "必须准确过滤出风险分 >= 0.85 的反 AI 规则 (禁用总结感结尾)");
    assert.equal(highRiskRules[0].key, "no_summary_ending");
  });

  await t.test("Node 6: Multi-Modal Model Route & Task Provider Resolution", async () => {
    // 校验真实模型路由任务类型覆盖率
    assert.ok(Array.isArray(MODEL_ROUTE_TASK_TYPES), "必须暴露 MODEL_ROUTE_TASK_TYPES 数组");
    assert.ok(MODEL_ROUTE_TASK_TYPES.includes("planner"), "必须包含 planner 任务路由");
    assert.ok(MODEL_ROUTE_TASK_TYPES.includes("writer"), "必须包含 writer 任务路由");
    assert.ok(MODEL_ROUTE_TASK_TYPES.includes("image_gen"), "必须包含 image_gen 任务路由");

    // 执行真实模型路由解析 (resolveModel)
    const plannerRoute = await resolveModel("planner");
    assert.ok(plannerRoute.provider, "模型路由解析器必须成功返回有效 planner provider");
    assert.ok(plannerRoute.model, "模型路由解析器必须成功返回有效 planner model");

    const imageRoute = await resolveModel("image_gen");
    assert.ok(imageRoute.provider, "生图任务模型路由必须输出有效 provider");
  });
});


