/**
 * novelE2EBenchmarkFixture.js
 * 黄金全流程测试数据集 (Golden E2E Benchmark Data Factory)
 * 包含 6 大跨领域实体系关联网络 (Interconnected Entity Net)
 */

function buildGoldenE2EBenchmarkData() {
  return {
    // 维度 1: 小说基础契约与 Framing
    novel: {
      id: "benchmark-novel-001",
      title: "赤霄天劫",
      description: "在灵气濒临枯竭的赤霄大陆，少年修饰陆沉意外激活荒古禁忌系统，面对宗门压迫与异族入侵的双重危机，在极压开局中逆天崛起。",
      targetAudience: "喜欢高压开局、爽快反转与强钩子打脸的玄幻读者",
      bookSellingPoint: "双重禁忌身份 + 宗门极压反杀 + 伏笔扣环解密",
      competingFeel: "《遮天》的气势浩瀚 + 《凡人修仙传》的严谨克制",
      first30ChapterPromise: "前30章完成宗门危机解除，揭开赤霄界大阵第一层禁制。",
      commercialTags: ["玄幻", "高压开局", "系统流", "热血爽文"],
      genreId: "xuanhuan_master",
      primaryStoryModeId: "mode_fast_paced",
      secondaryStoryModeId: "mode_secret_unveil",
      worldId: "benchmark-world-001",
      status: "draft",
      writingMode: "original",
      language: "zh-CN",
      projectMode: "ai_led",
      readerChannelPreference: "male_oriented",
      narrativePov: "third_person",
      pacePreference: "fast",
      styleTone: "高压热血，克制冷峻",
      emotionIntensity: "high",
      aiFreedom: "medium",
      postGenerationStyleReviewEnabled: true,
      defaultChapterLength: 3000,
      estimatedChapterCount: 80,
      projectStatus: "in_progress",
      storylineStatus: "in_progress",
      outlineStatus: "in_progress",
      resourceReadyScore: 92,
    },

    // 维度 2: 深度世界观法则与张力矩阵
    world: {
      id: "benchmark-world-001",
      name: "赤霄大千界",
      summary: "灵气衰减九成的末法世界，依靠古老大阵维持最后一丝生机。",
      ruleAxioms: [
        "修仙者灵力释放会加速局部天地崩坏",
        "禁忌符文只能在子夜时分激活",
      ],
      environmentalBounds: {
        auraDensity: 0.15,
        entropyRate: 0.85,
      },
      factions: [
        { id: "f1", name: "天剑宗", alignment: "ORDER_AUTHORITARIAN" },
        { id: "f2", name: "荒古禁盟", alignment: "CHAOTIC_REBEL" },
      ],
      tensionEngine: {
        baseTensionScore: 78,
        conflictDrivers: ["宗门灵脉争夺", "异族界壁突破"],
      },
      consistencyIssues: [
        {
          id: "issue-001",
          severity: "low",
          description: "主角初期禁制激活时间与子夜法则存在 10 分钟偏差",
        },
      ],
    },

    // 维度 3: 5 人角色阵营与动态 2D 关系演进网
    characters: [
      {
        id: "char-001",
        name: "陆沉",
        roleType: "protagonist",
        personalities: ["冷静冷峻", "果决不圣母", "重情重义"],
        growthArc: "从被迫避祸的边缘弟子演变为独当一面的赤霄守望者",
        dialogueStyle: "言简意赅，字字带锋",
        emotionExpression: "情绪压抑至临界点后爆发",
      },
      {
        id: "char-002",
        name: "赵无极",
        roleType: "antagonist",
        personalities: ["阴险狡诈", "利益至上"],
        growthArc: "宗门执法长老，逐步沦为异族傀儡",
        dialogueStyle: "冠冕堂皇，暗藏杀机",
      },
      {
        id: "char-003",
        name: "白阁老",
        roleType: "mentor",
        personalities: ["醉看红尘", "深不可测"],
        growthArc: "隐姓埋名的守阵老人，关键时刻指点迷津",
      },
      {
        id: "char-004",
        name: "柳如烟",
        roleType: "ally",
        personalities: ["聪慧敏锐", "行事果断"],
        growthArc: "商会掌舵人，主角的资源与情报供给者",
      },
      {
        id: "char-005",
        name: "黑面客",
        roleType: "wildcard",
        personalities: ["亦正亦邪", "神秘莫测"],
        growthArc: "游走于各方势力之间的刺客，立场随局势变化",
      },
    ],
    characterRelations: [
      { sourceId: "char-001", targetId: "char-002", relationType: "enemy", stage: "mortal_conflict" },
      { sourceId: "char-001", targetId: "char-003", relationType: "mentor", stage: "trust_built" },
      { sourceId: "char-001", targetId: "char-004", relationType: "ally", stage: "cooperation" },
      { sourceId: "char-002", targetId: "char-005", relationType: "employer", stage: "fragile_deal" },
    ],

    // 维度 4: 2 卷分卷策略与分层章节细化
    volumes: [
      {
        volumeOrder: 1,
        volumeTitle: "第一卷：困兽冲霄",
        chapters: [
          {
            order: 1,
            title: "第一章：废柴与禁忌锁",
            summary: "陆沉在执法堂逼迫下濒临绝境，意外激活体内荒古禁忌系统。",
            purpose: "建立高压开局与主角金手指钩子",
            keyEvents: ["执法堂逼供", "血液激活印记", "系统首次响应"],
            involvedRoles: ["陆沉", "赵无极"],
            conflictLevel: 85,
            revealLevel: 30,
            pacing: "极快",
            foreshadow: "主角胸前的残破剑印",
            mustAvoid: "切忌长篇大段介绍世界观设定",
            targetWordCount: 3000,
          },
          {
            order: 2,
            title: "第二章：夜试锋芒",
            summary: "子夜时分，陆沉初次试用禁忌符文反杀跟踪者。",
            purpose: "兑现金手指首次战斗回报",
            keyEvents: ["子夜潜行", "符文强化", "秒杀追踪者"],
            involvedRoles: ["陆沉", "黑面客"],
            conflictLevel: 75,
            revealLevel: 50,
            pacing: "紧凑",
            foreshadow: "黑面客遗落的令牌",
            mustAvoid: "避免主角心慈手软",
            targetWordCount: 3200,
          },
        ],
      },
      {
        volumeOrder: 2,
        volumeTitle: "第二卷：破阵惊天",
        chapters: [
          {
            order: 21,
            title: "第二十一章：大阵第一层解密",
            summary: "白阁老道出大阵真相，赤霄界危机浮出水面。",
            purpose: "升维世界观大局与宏观使命",
            keyEvents: ["禁地会面", "展示大阵沙盘", "确立主线目标"],
            involvedRoles: ["陆沉", "白阁老", "柳如烟"],
            conflictLevel: 60,
            revealLevel: 90,
            pacing: "稳健揭秘",
            foreshadow: "界壁外的暗黑之眼",
            mustAvoid: "不要让解释破坏悬念感",
            targetWordCount: 3500,
          },
        ],
      },
    ],

    // 维度 5: 文风规则集与写作公式契约
    styleProfile: {
      id: "benchmark-style-001",
      name: "热血高压文风规范",
      category: "玄幻爽文",
      sourceType: "manual",
      narrativeRules: {
        pov: "第三人称限知视角",
        pacingStrategy: "小高潮三章一爆，大高潮十章一结",
      },
      characterRules: {
        dialogueStyle: "坚决不废话，句式简短",
        emotionExpression: "动作强化情绪，减少直抒胸臆",
      },
      languageRules: {
        sentenceLength: "短句为主，长少短多",
        vocabularyBias: "动词优先，少用泛化修饰词",
      },
      rhythmRules: {
        paragraphLength: "每段不超过 4 行",
      },
      antiAiRules: [
        { key: "no_summary_ending", name: "禁用 AI 总结感结尾", riskScore: 0.9 },
        { key: "no_idiom_stacking", name: "禁用成语无意义堆砌", riskScore: 0.8 },
      ],
      selectedExtractionPresetKey: "balanced",
      applicableGenres: ["玄幻", "仙侠", "都市异能"],
    },

    // 维度 6: 模型路由与生图引擎探索配置
    modelRoutes: {
      textRoutes: [
        { taskType: "creative_brainstorm", provider: "deepseek", model: "deepseek-chat" },
        { taskType: "structured_outline", provider: "qwen", model: "qwen-max" },
      ],
      imageProviders: [
        { provider: "comfyui", name: "ComfyUI 引擎", isConfigured: true },
        { provider: "sensenova", name: "SenseNova 引擎", isConfigured: true },
      ],
    },
  };
}

module.exports = {
  buildGoldenE2EBenchmarkData,
};
