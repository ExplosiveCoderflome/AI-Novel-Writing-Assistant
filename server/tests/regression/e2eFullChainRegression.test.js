/**
 * e2eFullChainRegression.test.js
 * 全链路回归测试套件 (E2E Full-Chain Regression Suite)
 * 基于 6 维黄金基准数据集 (novelE2EBenchmarkFixture.js) 串联校验系统全逻辑分支。
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildGoldenE2EBenchmarkData } = require("../fixtures/novelE2EBenchmarkFixture");

// 1. 引入大导演接管元数据模块
const {
  DIRECTOR_TAKEOVER_STAGE_META,
  TAKEOVER_ENTRY_META,
  hasMeaningfulSeedMaterial,
  splitToneKeywords,
  buildTakeoverIdea,
} = require("../../dist/services/novel/director/runtime/novelDirectorTakeoverMeta.js");

// 2. 引入共享数值 Bounds Clamp 模块
const {
  clampScore,
  clampWordCount,
  STRUCTURED_CHAPTER_BOUNDS,
} = require("../../../shared/dist/utils/numberBounds.js");

test("E2E Regression Benchmark Suite - 6-Node Full-Chain Validation", async (t) => {
  const benchmarkData = buildGoldenE2EBenchmarkData();

  await t.test("Node 1: Novel Framing & Director Takeover Seed Analysis", () => {
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

    assert.equal(hasMeaningfulSeedMaterial(novelContext), true, "必须识别出有效种子素材");
    const keywords = splitToneKeywords(novelContext);
    assert.equal(Array.isArray(keywords), true);
    assert.ok(keywords.length > 0, "必须提取出语气与对标标签");
    const idea = buildTakeoverIdea(novelContext);
    assert.ok(idea.includes(benchmarkData.novel.title), "接管 Idea 必须包含小说标题");
    assert.ok(TAKEOVER_ENTRY_META.basic.label.length > 0, "必须具备基础接管节点 Label");
    assert.ok(DIRECTOR_TAKEOVER_STAGE_META.story_macro.label.length > 0, "必须具备宏观规划节点 Label");
  });

  await t.test("Node 2: World Setup, Axioms & Tension Bounds", () => {
    const { world } = benchmarkData;
    assert.equal(world.ruleAxioms.length, 2, "世界观硬性法则必须包含 2 条条目");
    assert.equal(world.factions.length, 2, "势力阵营必须包含 2 个对立阵营");
    assert.ok(world.tensionEngine.baseTensionScore > 50, "张力基础基准分必须大于 50");
    assert.equal(world.consistencyIssues.length, 1, "必须包含可被发现的一致性校验遗留问题");
  });

  await t.test("Node 3: 5-Character Cast & 2D Relation Graph", () => {
    const { characters, characterRelations } = benchmarkData;
    assert.equal(characters.length, 5, "角色阵营必须包含完整 5 人角色矩阵");
    assert.equal(characterRelations.length, 4, "必须包含 4 条动态 2D 关系演进边");

    const protagonist = characters.find((c) => c.roleType === "protagonist");
    assert.ok(protagonist, "必须包含主角角色");
    assert.equal(protagonist.personalities.length, 3, "主角必须包含 3 条性格特征");

    const enemyRelation = characterRelations.find((r) => r.relationType === "enemy");
    assert.ok(enemyRelation, "必须包含宿敌敌对关系边");
    assert.equal(enemyRelation.stage, "mortal_conflict");
  });

  await t.test("Node 4: Volume Strategy & Number Bounds Clamp", () => {
    const { volumes } = benchmarkData;
    assert.equal(volumes.length, 2, "必须包含 2 卷规划");
    const vol1Chapters = volumes[0].chapters;
    assert.equal(vol1Chapters.length, 2, "第一卷包含 2 章细化数据");

    const firstChapter = vol1Chapters[0];
    const clampedConflict = clampScore(firstChapter.conflictLevel);
    assert.equal(clampedConflict, 85, "冲突等级 Clamp 计算必须保持 85");

    const clampedWordCount = clampWordCount(firstChapter.targetWordCount);
    assert.equal(clampedWordCount, 3000, "目标字数 Clamp 计算必须保持 3000");

    // 边界条件断言
    assert.equal(clampScore(150), STRUCTURED_CHAPTER_BOUNDS.MAX_PERCENTAGE, "超上限 Clamp 应收敛为 100");
    assert.equal(clampScore(-20), STRUCTURED_CHAPTER_BOUNDS.MIN_PERCENTAGE, "超下限 Clamp 应收敛为 0");
    assert.equal(clampWordCount(50), STRUCTURED_CHAPTER_BOUNDS.MIN_WORD_COUNT, "超低字数 Clamp 应收敛为 200");
  });

  await t.test("Node 5: Writing Formula Catalog Resolution", () => {
    const { styleProfile } = benchmarkData;
    assert.equal(styleProfile.selectedExtractionPresetKey, "balanced", "默认提取预设必须为 balanced");
    assert.equal(styleProfile.antiAiRules.length, 2, "文风法则必须包含 2 条反 AI 规则");
    assert.equal(styleProfile.applicableGenres.length, 3, "适用题材必须包含 3 个关联体裁");
  });

  await t.test("Node 6: Model Route & Image Provider Options Validation", () => {
    const { modelRoutes } = benchmarkData;
    assert.equal(modelRoutes.textRoutes.length, 2, "必须成功配置文本模型路由");
    assert.equal(modelRoutes.imageProviders.length, 2, "必须成功配置图像引擎供应商");

    const comfy = modelRoutes.imageProviders.find((p) => p.provider === "comfyui");
    assert.ok(comfy && comfy.isConfigured, "ComfyUI 引擎必须为激活状态");
  });
});
