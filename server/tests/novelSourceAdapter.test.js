const test = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../dist/db/prisma.js");
const { novelSourceAdapter } = require("../dist/services/adaptation/source/NovelSourceAdapter.js");
const { ComicPanelScriptService } = require("../dist/services/comic/ComicPanelScriptService.js");
const { runStructuredPrompt } = require("../dist/prompting/core/promptRunner.js");

// Mock runStructuredPrompt
const originalRunStructuredPrompt = require("../dist/prompting/core/promptRunner.js").runStructuredPrompt;

test("NovelSourceAdapter.loadBundle reads structuredDataJson and formats worldNotes", async () => {
  const originalFindUniqueNovel = prisma.novel.findUnique;
  const originalFindUniqueNovelWorld = prisma.novelWorld.findUnique;
  const originalFindManyChapter = prisma.chapter.findMany;
  const originalFindManyCharacter = prisma.character.findMany;
  const originalFindManyFact = prisma.novelFactEntry.findMany;

  try {
    prisma.novel.findUnique = async () => ({
      id: "novel_123",
      title: "斗破古墓",
      description: "林动闯荡古墓的故事。"
    });

    prisma.novelWorld.findUnique = async () => ({
      structuredDataJson: JSON.stringify({
        profile: {
          summary: "这是一个充满符祖与魔皇的世界",
          identity: "符祖封印世界",
          tone: "热血与诡秘"
        },
        rules: {
          axioms: [
            { name: "生死祖符约束", summary: "祖符持有者无法被寻常死气侵蚀。" }
          ]
        },
        factions: [
          { name: "九天太清宫", doctrine: "仙道出尘", position: "超级大宗门" }
        ],
        locations: [
          { name: "大荒古碑", summary: "封印远古神物的石碑", narrativeFunction: "核心副本" }
        ]
      })
    });

    prisma.chapter.findMany = async () => [
      { order: 1, title: "第一章 闯入古墓", expectation: "林动成功破入古墓", content: "林动身形如电..." }
    ];

    prisma.character.findMany = async () => [
      { id: "char_1", name: "林动", gender: "male", role: "男主角", personality: "坚毅不拔" }
    ];

    prisma.novelFactEntry.findMany = async () => [];

    const bundle = await novelSourceAdapter.loadBundle({ type: "novel_import", ref: "novel_123" });
    
    assert.ok(bundle);
    assert.equal(bundle.synopsis, "林动闯荡古墓的故事。");
    assert.equal(bundle.characters[0].name, "林动");
    
    // 核心断言：校验 worldNotes 正确解析并进行了 markdown 文本格式化
    assert.ok(bundle.worldNotes);
    assert.ok(bundle.worldNotes.includes("世界背景：这是一个充满符祖与魔皇的世界"));
    assert.ok(bundle.worldNotes.includes("核心设定：符祖封印世界"));
    assert.ok(bundle.worldNotes.includes("生死祖符约束"));
    assert.ok(bundle.worldNotes.includes("九天太清宫"));
    assert.ok(bundle.worldNotes.includes("大荒古碑"));
  } finally {
    prisma.novel.findUnique = originalFindUniqueNovel;
    prisma.novelWorld.findUnique = originalFindUniqueNovelWorld;
    prisma.chapter.findMany = originalFindManyChapter;
    prisma.character.findMany = originalFindManyCharacter;
    prisma.novelFactEntry.findMany = originalFindManyFact;
  }
});

test("ComicPanelScriptService passes worldNotes to the LLM prompt runner", async () => {
  const originalFindUniqueEpisode = prisma.comicEpisode.findUnique;
  const originalTransaction = prisma.$transaction;
  const originalUpdate = prisma.comicEpisode.update;
  
  let passedPromptInput = null;
  require("../dist/prompting/core/promptRunner.js").runStructuredPrompt = async (args) => {
    passedPromptInput = args.promptInput;
    return {
      output: {
        scenes: [],
        panels: []
      }
    };
  };

  prisma.$transaction = async (callback) => {
    const mockTx = {
      comicEpisode: {
        update: async () => ({})
      },
      comicScene: {
        createMany: async () => ({})
      },
      comicPanel: {
        deleteMany: async () => ({}),
        createMany: async () => ({})
      }
    };
    return callback(mockTx);
  };

  prisma.comicEpisode.update = async () => ({});

  try {
    prisma.comicEpisode.findUnique = async () => ({
      id: "ep_1",
      order: 1,
      title: "第1格场景",
      outline: "剧情开始...",
      sourceText: "古墓大开...",
      project: {
        id: "proj_1",
        title: "大荒改编记",
        sourceType: "novel_import",
        sourceRef: "novel_123",
        stylePreset: JSON.stringify({ style: "vibrant" }),
        characters: [],
        characterAssets: [],
        scenes: [],
        facts: [],
        sourceBundle: {
          bundleJson: JSON.stringify({
            synopsis: "林动冒险记",
            beats: [],
            characters: [],
            worldNotes: "【世界规则：雷霆天降】"
          })
        }
      }
    });

    const scriptService = new ComicPanelScriptService();
    await scriptService.generatePanelScript("ep_1");

    assert.ok(passedPromptInput);
    // 核心断言：校验从 SourceBundle 读取的 worldNotes 顺利注入了大模型提示词输入对象中
    assert.equal(passedPromptInput.worldNotes, "【世界规则：雷霆天降】");
  } finally {
    prisma.comicEpisode.findUnique = originalFindUniqueEpisode;
    prisma.$transaction = originalTransaction;
    prisma.comicEpisode.update = originalUpdate;
    require("../dist/prompting/core/promptRunner.js").runStructuredPrompt = originalRunStructuredPrompt;
  }
});
