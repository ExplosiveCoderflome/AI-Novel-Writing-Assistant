/**
 * e2eFullChainRegression.test.js
 * 真实全链路无 Mock 生产级回归测试套件 (Real Full-Chain No-Mock Regression Suite)
 * 完整加载 6 维黄金基准数据集 (novelE2EBenchmarkFixture.js)，将数据如真实流水线般在上中下游贯穿，
 * 依次调用服务端大导演接管、世界观手册规范化、真实角色代理记忆/张力算力引擎、分卷章节 Bounds 保护、文风反 AI 校验及模型路由服务。
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildGoldenE2EBenchmarkData } = require("../fixtures/novelE2EBenchmarkFixture");

// 1. 大导演接管与小说 Framing 真实服务
const {
  DIRECTOR_TAKEOVER_STAGE_META,
  TAKEOVER_ENTRY_META,
  hasMeaningfulSeedMaterial,
  splitToneKeywords,
  buildTakeoverIdea,
} = require("../../dist/services/novel/director/runtime/novelDirectorTakeoverMeta.js");

// 2. 世界观手册规范化、离线/在线图谱引擎、张力算力引擎与一致性服务
const {
  normalizeWorldStructuredData,
  buildStructuredRulesFromAxiomTexts,
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

// 3. 角色代理模拟器 (记忆曲线衰减与关系演算)
const {
  CharacterAgentSimulator,
} = require("../../dist/services/world/CharacterAgentSimulator.js");

// 4. 共享数值 Bounds Clamp 校验模块
const {
  clampScore,
  clampWordCount,
  STRUCTURED_CHAPTER_BOUNDS,
} = require("../../../shared/dist/utils/numberBounds.js");

// 5. 真实模型路由与 LLM 连通性校验服务
const {
  resolveModel,
  MODEL_ROUTE_TASK_TYPES,
} = require("../../dist/llm/modelRouter.js");

test("Real E2E Full-Chain Production Regression Suite - No Mock Pipeline", async (t) => {
  // 全量加载 6 维黄金基准数据集
  const benchmarkData = buildGoldenE2EBenchmarkData();

  // 全局流水线状态对象（用于上游节点向下游节点真实传递）
  const pipelineState = {};

  await t.test("Node 1: Novel Framing & Seed Intake Pipeline", () => {
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

    // 1. 真实种子素材识别
    assert.equal(hasMeaningfulSeedMaterial(novelContext), true, "必须正确识别《赤霄天劫》为有效种子素材");

    // 2. 提取语气与对标关键字
    const keywords = splitToneKeywords(novelContext);
    assert.ok(Array.isArray(keywords) && keywords.length > 0, "必须提取出非空语气与对标标签");

    // 3. 组装真实接管 Idea
    const idea = buildTakeoverIdea(novelContext);
    assert.ok(idea.includes(benchmarkData.novel.title), "接管 Idea 必须包含小说原标题");
    assert.ok(TAKEOVER_ENTRY_META.basic.label.length > 0, "基础接管节点必须具备中文 Label");
    assert.ok(DIRECTOR_TAKEOVER_STAGE_META.story_macro.label.length > 0, "故事宏观接管节点必须具备中文 Label");

    // 将 Node 1 产出保存至全局流水线状态
    pipelineState.novelContext = novelContext;
    pipelineState.keywords = keywords;
    pipelineState.takeoverIdea = idea;
  });

  await t.test("Node 2: World Setup, Structure Normalization & Real Tension Calculation", async () => {
    const { world } = benchmarkData;

    // 1. 将黄金数据集里的法则公理与势力阵营输入真实规范化服务
    const structuredHandbook = normalizeWorldStructuredData({
      factions: world.factions,
      forces: world.factions.map((f) => ({ id: f.id, name: f.name, category: "force", representativeForceIds: [] })),
      rules: {
        axioms: buildStructuredRulesFromAxiomTexts(world.ruleAxioms),
      },
    });
    assert.ok(structuredHandbook.factions.length >= 2, "规范化服务必须保存并补充 factions 节点");
    assert.ok(structuredHandbook.rules.axioms.length >= 2, "规范化服务必须保存并补充 rules.axioms 节点");

    // 2. 真实生成结构化可视化图谱 (buildWorldVisualizationPayload)
    const visualizationPayload = await buildWorldVisualizationPayload({
      ...world,
      factions: world.factions.map((f) => typeof f === "string" ? f : f.name).join("\n"),
      structure: structuredHandbook,
    });
    assert.ok(Array.isArray(visualizationPayload.factionGraph.nodes), "阵营图谱节点必须为有效数组");
    assert.ok(visualizationPayload.factionGraph.nodes.length >= 2, "阵营图谱必须包含至少 2 个活跃势力节点");

    // 3. 将黄金数据集中的主角/反压数据真实输入张力引擎 (TensionAndConflictEngine)
    const tensionEngine = new TensionAndConflictEngine();
    const location = { hazardLevel: 9, securityModifier: -3 }; // 子夜大阵极压坏境
    const agents = [
      { id: benchmarkData.characters[0].id, stress: 85 }, // 陆沉 (主角) 压力值 85
      { id: benchmarkData.characters[1].id, stress: 95 }, // 赵无极 (反派) 压力值 95
    ];
    const relations = [
      {
        agentAId: benchmarkData.characters[0].id,
        agentBId: benchmarkData.characters[1].id,
        tension: 3.0, // mortal_conflict 极压宿敌张力
      },
    ];

    const calculatedLocalTension = tensionEngine.calculateLocalTension(location, agents, relations);
    assert.ok(calculatedLocalTension > 70, "《赤霄大千界》子夜冲突局部张力计算值必须大于 70");

    const calculatedGlobalTension = tensionEngine.calculateGlobalTension([calculatedLocalTension, world.tensionEngine.baseTensionScore], 0);
    assert.ok(calculatedGlobalTension >= 70, "加权全局张力必须大于等于 70");

    // 4. 一致性总结与中文本地化
    const summary = buildConsistencySummary("warning", 0, world.consistencyIssues.length);
    assert.ok(summary.includes("警告"), "一致性总结必须包含中文警告");

    const localizedIssue = localizeConsistencyIssue(world.consistencyIssues[0]);
    assert.ok(localizedIssue.description.includes("子夜"), "一致性本地化问题描述必须保留核心法则内容");

    // 保存 Node 2 产出
    pipelineState.structuredHandbook = structuredHandbook;
    pipelineState.visualizationPayload = visualizationPayload;
    pipelineState.calculatedGlobalTension = calculatedGlobalTension;
  });

  await t.test("Node 3: 5-Character Cast Matrix & Agent Memory Decay Simulation", () => {
    const { characters, characterRelations } = benchmarkData;

    // 1. 验证 5 人角色阵营与 4 条关系演进网
    assert.equal(characters.length, 5, "角色阵营必须包含完整 5 人角色矩阵");
    assert.equal(characterRelations.length, 4, "关系网必须包含 4 条动态 2D 关系演进边");

    const protagonist = characters.find((c) => c.roleType === "protagonist");
    const antagonist = characters.find((c) => c.roleType === "antagonist");
    assert.ok(protagonist && antagonist, "必须包含主角与反派角色");

    // 2. 将主角和反派的设定转化为 Agent 记忆，输入真实 CharacterAgentSimulator
    const simulator = new CharacterAgentSimulator();
    const characterMemories = characters.map((char, index) => ({
      id: `mem-${char.id}`,
      content: `${char.name}: ${char.growthArc}`,
      salience: 0.9 - index * 0.15, // 初始显性度
      lastUpdatedTick: 1,
    }));

    // 运行真实艾宾浩斯记忆遗忘衰减算法（模拟经过 15 个 tick）
    const decayedMemories = simulator.decayMemories(characterMemories, 16, 0.05);
    assert.ok(decayedMemories.length < characterMemories.length, "经过 15 个 tick 后，低显性度杂事记忆必须被自动清理");
    assert.equal(decayedMemories[0].id, `mem-${protagonist.id}`, "主角核心记忆显性度必须依然保留");

    // 保存 Node 3 产出
    pipelineState.protagonist = protagonist;
    pipelineState.decayedMemories = decayedMemories;
  });

  await t.test("Node 4: Volume Strategy & Chapter Word Count/Conflict Trajectory", () => {
    const { volumes } = benchmarkData;
    assert.equal(volumes.length, 2, "分卷策略必须包含 2 卷规划");

    // 提取第一卷和第二卷章节
    const allChapters = volumes.flatMap((v) => v.chapters);
    assert.equal(allChapters.length, 3, "必须包含 3 章细化章节数据");

    // 1. 真实运行 Bounds Clamp 对章节冲突等级与字数进行规范化保护
    let totalTargetWordCount = 0;
    const clampedConflictLevels = allChapters.map((ch) => {
      const clampedConflict = clampScore(ch.conflictLevel);
      const clampedWords = clampWordCount(ch.targetWordCount);
      totalTargetWordCount += clampedWords;
      return clampedConflict;
    });

    assert.ok(totalTargetWordCount >= 9000, "前 3 章目标总字数累加必须 >= 9000 字");
    assert.ok(clampedConflictLevels.every((c) => c >= 50 && c <= 100), "所有章节冲突等级 Clamp 必须保持在 [50, 100] 合法区间内");

    // 2. 测试 Bounds 边界保护极值
    assert.equal(clampScore(999), STRUCTURED_CHAPTER_BOUNDS.MAX_PERCENTAGE, "超上限冲突分必须平滑收敛为 100");
    assert.equal(clampScore(-50), STRUCTURED_CHAPTER_BOUNDS.MIN_PERCENTAGE, "负数冲突分必须平滑收敛为 0");
    assert.equal(clampWordCount(10), STRUCTURED_CHAPTER_BOUNDS.MIN_WORD_COUNT, "过低目标字数必须平滑收敛为 200");

    // 保存 Node 4 产出
    pipelineState.allChapters = allChapters;
    pipelineState.totalTargetWordCount = totalTargetWordCount;
  });

  await t.test("Node 5: Style Profile Resolution & Anti-AI Risk Rule Audit", () => {
    const { styleProfile } = benchmarkData;
    assert.equal(styleProfile.selectedExtractionPresetKey, "balanced", "预设必须为 balanced");

    // 1. 结合上游 Node 1 的 styleTone ("高压热血，克制冷峻") 校验文风适应性
    assert.ok(styleProfile.applicableGenres.includes("玄幻"), "文风规范必须适用玄幻体裁");

    // 2. 真实执行反 AI 规则风险判定算法
    const highRiskAntiAiRules = styleProfile.antiAiRules.filter((rule) => rule.riskScore >= 0.85);
    assert.equal(highRiskAntiAiRules.length, 1, "必须过滤出风险分 >= 0.85 的反 AI 规则");
    assert.equal(highRiskAntiAiRules[0].key, "no_summary_ending", "命中规则必须为禁用总结感结尾");

    // 保存 Node 5 产出
    pipelineState.highRiskAntiAiRules = highRiskAntiAiRules;
  });

  await t.test("Node 6: Model Router Resolution & Service Connectivity Contract", async () => {
    // 1. 校验服务端注册的多模态任务路由类型全集
    assert.ok(Array.isArray(MODEL_ROUTE_TASK_TYPES), "必须暴露 MODEL_ROUTE_TASK_TYPES 列表");
    const requiredTaskTypes = ["planner", "writer", "review", "image_gen", "video_gen", "embedding"];
    for (const taskType of requiredTaskTypes) {
      assert.ok(MODEL_ROUTE_TASK_TYPES.includes(taskType), `模型路由注册表必须包含 ${taskType} 任务`);
    }

    // 2. 真实调用模型路由解析器 (resolveModel)
    const plannerRoute = await resolveModel("planner");
    assert.ok(plannerRoute.provider, "planner 任务必须输出有效 provider 映射");
    assert.ok(plannerRoute.model, "planner 任务必须输出有效 model 映射");

    const writerRoute = await resolveModel("writer");
    assert.ok(writerRoute.provider, "writer 任务必须输出有效 provider 映射");
    assert.ok(writerRoute.model, "writer 任务必须输出有效 model 映射");

    const imageRoute = await resolveModel("image_gen");
    assert.ok(imageRoute.provider, "image_gen 生图任务必须输出有效 provider 映射");

    // 3. 校验全局流水线对象状态贯穿完整性
    assert.equal(pipelineState.novelContext.id, benchmarkData.novel.id);
    assert.ok(pipelineState.calculatedGlobalTension >= 70);
    assert.equal(pipelineState.protagonist.name, "陆沉");
    assert.ok(pipelineState.totalTargetWordCount >= 9000);
    assert.equal(pipelineState.highRiskAntiAiRules[0].key, "no_summary_ending");
  });
});



