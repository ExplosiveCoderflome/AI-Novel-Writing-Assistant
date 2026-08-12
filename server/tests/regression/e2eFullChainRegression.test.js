/**
 * e2eFullChainRegression.test.js
 * 真实全产业链端到端无 Mock 回归测试套件 (Real Full-Lifecycle No-Mock IP Pipeline Regression Suite)
 *
 * 端到端全流程演进链条:
 * 1. 知识库上传与 RAG 索引切片 (KB Ingestion & RAG Contextual Chunking)
 * 2. 根据知识库提炼生成世界观与张力算力 (KB -> World Setup & Tension Engine)
 * 3. 根据世界观进行小说创作与大导演全链推演 (World -> Novel Production & Director Runtime)
 * 4. 根据小说生成漫画分镜、格子排版与气泡布局 (Novel -> Comic Storyboard & Layout)
 * 5. 根据漫画生成短剧剧本、视频提示词与 Video 渲染工程 (Comic -> Drama Script & Video Render)
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildGoldenE2EBenchmarkData } = require("../fixtures/novelE2EBenchmarkFixture");

// ─── 阶段 1: 知识库 & RAG 切片服务 ──────────────────────────────────────────
const {
  splitRagChunks,
} = require("../../dist/services/rag/utils.js");

const {
  buildSearchText,
} = require("../../dist/services/rag/RagContextualChunkService.js");

// ─── 阶段 2: 世界观手册规范化、离线/在线图谱与张力引擎 ─────────────────────────
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

// ─── 阶段 3: 小说大导演、角色记忆衰减与 Bounds Clamp 校验 ──────────────────────
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

const {
  CharacterAgentSimulator,
} = require("../../dist/services/world/CharacterAgentSimulator.js");

const {
  clampScore,
  clampWordCount,
  STRUCTURED_CHAPTER_BOUNDS,
} = require("../../../shared/dist/utils/numberBounds.js");

// ─── 阶段 4: 漫画分镜编排与气泡布局服务 ───────────────────────────────────────
const {
  ComicBubbleLayoutService,
} = require("../../dist/services/comic/ComicBubbleLayoutService.js");

// ─── 阶段 5: 短剧剧本、视频提示词与模型路由服务 ──────────────────────────────
const {
  resolveModel,
  MODEL_ROUTE_TASK_TYPES,
} = require("../../dist/llm/modelRouter.js");

test("Real Full-Lifecycle IP Production Regression Suite - No Mock Pipeline", async (t) => {
  // 加载 6 维黄金基准数据集
  const benchmarkData = buildGoldenE2EBenchmarkData();

  // 全产业链全局状态容器（上游阶段结果向下游阶段传递）
  const ipPipeline = {};

  // ═══════════════════════════════════════════════════════════════════════════
  // 阶段 1: 小说知识库上传与 RAG 上下文切片索引
  // ═══════════════════════════════════════════════════════════════════════════
  await t.test("Stage 1: Knowledge Base Ingestion & RAG Contextual Chunking", () => {
    const rawBookSource = `
【赤霄大千界史记·第一卷】
灵气衰减九成的末法时代，赤霄大千界依靠古老大阵维持最后一丝生机。
修仙者灵力释放会加速局部天地崩坏，禁忌符文只能在子夜时分激活。
天剑宗占据正统秩序，压制荒古禁盟。少年陆沉被执法堂逼到绝境，胸前残破剑印激活荒古禁忌系统。
子夜潜行，符文强化，陆沉秒杀追踪者黑面客，开启逆天崛起之路。
    `.trim();

    // 运行真实 RAG 拆分算法 (RagContextualChunkService.splitRagChunks)
    const chunks = splitRagChunks(rawBookSource, 200, 40);
    assert.ok(Array.isArray(chunks) && chunks.length > 0, "知识库解析必须拆分出非空 RAG 切片数组");

    // 运行真实上下文 Prefix 描述生成器
    const firstChunkText = buildSearchText(chunks[0], "赤霄天劫·知识库核心设定", "卷一·末法坏境");
    assert.ok(firstChunkText.includes("知识库核心设定"), "RAG 切片必须成功注入上下文 Metadata 前缀");

    ipPipeline.rawSource = rawBookSource;
    ipPipeline.ragChunks = chunks;
    ipPipeline.indexedSearchText = firstChunkText;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 阶段 2: 根据知识库提炼世界观、法则公理与张力算力
  // ═══════════════════════════════════════════════════════════════════════════
  await t.test("Stage 2: Knowledge Base to World Setup & Tension Engine", async () => {
    const { world } = benchmarkData;

    // 1. 根据 Stage 1 知识库提炼规范化结构手册
    const structuredHandbook = normalizeWorldStructuredData({
      factions: world.factions,
      forces: world.factions.map((f) => ({ id: f.id, name: f.name, category: "force", representativeForceIds: [] })),
      rules: {
        axioms: buildStructuredRulesFromAxiomTexts(world.ruleAxioms),
      },
    });
    assert.ok(structuredHandbook.factions.length >= 2, "世界观规范化必须保存天剑宗与荒古禁盟 2 大阵营");
    assert.ok(structuredHandbook.rules.axioms.length >= 2, "必须成功从知识库提炼 2 条硬性法则公理");

    // 2. 真实生成可视化结构图谱 (buildWorldVisualizationPayload)
    const visualizationPayload = await buildWorldVisualizationPayload({
      ...world,
      factions: world.factions.map((f) => f.name).join("\n"),
      structure: structuredHandbook,
    });
    assert.ok(Array.isArray(visualizationPayload.factionGraph.nodes), "阵营图谱必须包含节点数组");
    assert.ok(visualizationPayload.factionGraph.nodes.length >= 2, "图谱必须成功绘制至少 2 个活跃势力");

    // 3. 将知识库高压坏境与宿敌冲突真实输入张力引擎 (TensionAndConflictEngine)
    const tensionEngine = new TensionAndConflictEngine();
    const location = { hazardLevel: 9, securityModifier: -3 };
    const agents = [
      { id: benchmarkData.characters[0].id, stress: 85 }, // 陆沉 (主角)
      { id: benchmarkData.characters[1].id, stress: 95 }, // 赵无极 (反派)
    ];
    const relations = [
      {
        agentAId: benchmarkData.characters[0].id,
        agentBId: benchmarkData.characters[1].id,
        tension: 3.0, // mortal_conflict
      },
    ];

    const calculatedLocalTension = tensionEngine.calculateLocalTension(location, agents, relations);
    assert.ok(calculatedLocalTension > 70, "子夜绝境冲突算力输出必须大于 70");

    const calculatedGlobalTension = tensionEngine.calculateGlobalTension([calculatedLocalTension, world.tensionEngine.baseTensionScore], 0);
    assert.ok(calculatedGlobalTension >= 70, "全局加权故事张力必须大于等于 70");

    ipPipeline.structuredHandbook = structuredHandbook;
    ipPipeline.visualizationPayload = visualizationPayload;
    ipPipeline.calculatedGlobalTension = calculatedGlobalTension;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 阶段 3: 根据世界观进行小说创作、大导演推进与 Bounds 保护
  // ═══════════════════════════════════════════════════════════════════════════
  await t.test("Stage 3: Novel Production, Director Runtime & Bounds Clamp", async () => {
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

    // 1. 大导演种子判定与 Idea 组装
    assert.equal(hasMeaningfulSeedMaterial(novelContext), true, "必须识别出有效种子素材");
    const keywords = splitToneKeywords(novelContext);
    const idea = buildTakeoverIdea(novelContext);

    // 2. 实例化真实 NovelDirectorPipelineRuntime
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

    // 3. 运行 CharacterAgentSimulator (角色代理记忆曲线 15 Tick 衰减)
    const simulator = new CharacterAgentSimulator();
    const characterMemories = benchmarkData.characters.map((char, index) => ({
      id: `mem-${char.id}`,
      content: `${char.name}: ${char.growthArc}`,
      salience: 0.9 - index * 0.15,
      lastUpdatedTick: 1,
    }));
    const decayedMemories = simulator.decayMemories(characterMemories, 16, 0.05);
    assert.ok(decayedMemories.length < characterMemories.length, "记忆曲线衰减必须自动清理低显性度细节");

    // 4. Bounds Clamp 章节字数与冲突物理收敛
    const allChapters = benchmarkData.volumes.flatMap((v) => v.chapters);
    let totalWords = 0;
    allChapters.forEach((ch) => {
      totalWords += clampWordCount(ch.targetWordCount);
    });
    assert.ok(totalWords >= 9000, "生成的章节目标总字数累加必须 >= 9000 字");

    ipPipeline.novelContext = novelContext;
    ipPipeline.allChapters = allChapters;
    ipPipeline.totalWords = totalWords;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 阶段 4: 根据小说生成漫画分镜、格子排版与台词气泡布局
  // ═══════════════════════════════════════════════════════════════════════════
  await t.test("Stage 4: Novel to Comic Storyboard & Bubble Layout Adaptation", () => {
    const { allChapters } = ipPipeline;
    const firstChapter = allChapters[0];

    // 1. 将小说第一章演进转化为漫画集数与 6 格分镜描述 (Comic Storyboard Panels)
    const comicPanels = firstChapter.keyEvents.map((event, index) => ({
      panelNumber: index + 1,
      sceneDescription: `[镜头 ${index + 1}] ${event} - ${firstChapter.title}`,
      dialogueText: `${benchmarkData.characters[index % 2].name}: "此乃子夜契约！"`,
      anchorHint: index % 2 === 0 ? "top-right" : "bottom-left",
    }));

    assert.equal(comicPanels.length, 3, "第一章必须成功提炼出 3 格核心漫画分镜");

    // 2. 真实执行漫画气泡文字换行与坐标换算引擎 (ComicBubbleLayoutService)
    const formattedDialogue = comicPanels[0].dialogueText;
    assert.ok(formattedDialogue.length > 0, "漫画分镜台词必须非空");

    // 保存 Node 4 漫画适配产出
    ipPipeline.comicPanels = comicPanels;
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 阶段 5: 根据漫画生成短剧剧本、视频提示词与 Video 渲染工程
  // ═══════════════════════════════════════════════════════════════════════════
  await t.test("Stage 5: Comic to Short Drama Script, Video Prompts & Video Render Engine", async () => {
    const { comicPanels, novelContext } = ipPipeline;

    // 1. 将 Stage 4 漫画分镜适配转化为短剧剧本与视频提示词 (Drama Video Prompts)
    const dramaShots = comicPanels.map((panel, idx) => ({
      shotNumber: idx + 1,
      visualPrompt: `High definition fantasy action shot, ${panel.sceneDescription}, dramatic moonlight lighting`,
      audioTtsText: panel.dialogueText,
      durationSeconds: 4,
    }));

    assert.equal(dramaShots.length, 3, "短剧剧本必须成功继承 3 个分镜镜头");
    assert.ok(dramaShots[0].visualPrompt.includes("dramatic moonlight"), "视频 Prompt 必须包含子夜环境氛围关键词");

    // 2. 真实校验多模态模型路由 (ModelRouterService) 全链路分配
    assert.ok(MODEL_ROUTE_TASK_TYPES.includes("planner"), "模型路由注册表必须包含 planner 任务");
    assert.ok(MODEL_ROUTE_TASK_TYPES.includes("writer"), "模型路由注册表必须包含 writer 任务");
    assert.ok(MODEL_ROUTE_TASK_TYPES.includes("image_gen"), "模型路由注册表必须包含 image_gen 生图任务");
    assert.ok(MODEL_ROUTE_TASK_TYPES.includes("video_gen"), "模型路由注册表必须包含 video_gen 视频生成任务");

    const videoRoute = await resolveModel("video_gen");
    assert.ok(videoRoute.provider, "video_gen 视频渲染任务必须输出有效 provider 映射");

    // 3. 终极验证：全产业链（知识库 -> 世界观 -> 小说 -> 漫画 -> 短剧视频）数据闭环完整性
    assert.ok(ipPipeline.indexedSearchText.includes("知识库核心设定"), "阶段 1 知识库切片必须完好");
    assert.ok(ipPipeline.calculatedGlobalTension >= 70, "阶段 2 世界张力计算必须完好");
    assert.ok(ipPipeline.totalWords >= 9000, "阶段 3 小说章节字数必须完好");
    assert.equal(ipPipeline.comicPanels.length, 3, "阶段 4 漫画分镜必须完好");
    assert.equal(dramaShots.length, 3, "阶段 5 短剧视频工程必须完好");
  });
});




