const test = require("node:test");
const assert = require("node:assert/strict");

const {
  NovelPromptMaterialExporter,
  listNovelMaterialGroupDefinitions,
} = require("../dist/prompting/materials/index.js");

function date() {
  return new Date("2026-05-08T00:00:00.000Z");
}

function buildDb(overrides = {}) {
  const novel = {
    id: "novel-1",
    title: "信号轨道",
    description: "一支打捞小队追逐木星附近漂流的档案站。",
    targetAudience: "男频科幻读者",
    bookSellingPoint: "太空打捞与失落档案",
    first30ChapterPromise: "前三十章揭开档案站真实用途。",
    estimatedChapterCount: 60,
    defaultChapterLength: 3000,
    updatedAt: date(),
    genre: { name: "科幻冒险" },
    primaryStoryMode: { name: "追踪解谜" },
    secondaryStoryMode: null,
    bookContract: {
      id: "contract-1",
      readingPromise: "每章推进一个新线索。",
      coreSellingPoint: "太空遗迹悬疑。",
      protagonistFantasy: "从底层打捞员变成星际真相揭露者。",
      relationshipMainline: "小队互信逐步建立。",
      escalationLadder: "线索、追杀、真相、反击。",
      chapter3Payoff: "找到第一份黑匣子。",
      chapter10Payoff: "确认档案站仍在运行。",
      chapter30Payoff: "揭开幕后势力。",
      absoluteRedLinesJson: JSON.stringify(["不能无铺垫复活关键人物"]),
      updatedAt: date(),
    },
    storyMacroPlan: null,
    world: {
      id: "world-1",
      name: "木星轨道带",
      description: "公司舰队控制外层轨道。",
      axioms: "通讯延迟不可被随意绕过。",
      background: "旧战争留下大量遗迹。",
      magicSystem: null,
      politics: "公司联盟实际掌权。",
      factions: "轨道公司、打捞工会、失踪舰队。",
      conflicts: "资源垄断与真相封锁。",
      updatedAt: date(),
    },
  };
  const chapter = {
    id: "chapter-1",
    novelId: "novel-1",
    title: "旧仓库里的信号",
    order: 3,
    content: "主角走进旧仓库，发现信号记录。",
    expectation: "让主角发现关键线索。",
    taskSheet: "必须推进：发现档案站信号。必须保留：队友仍然怀疑主角。",
    sceneCards: "场景一：旧仓库调查。",
    targetWordCount: 3000,
    mustAvoid: "不要提前揭露幕后黑手。",
    hook: "信号仍在发出。",
    updatedAt: date(),
    chapterSummary: {
      summary: "主角发现旧信号。",
      keyEvents: "进入旧仓库；发现信号。",
      characterStates: "主角开始怀疑公司。",
    },
  };

  return {
    novel: {
      findUnique: async () => novel,
    },
    chapter: {
      findFirst: async () => chapter,
      findMany: async () => ([{
        id: "chapter-0",
        title: "前一章",
        order: 2,
        content: "上一章内容。",
        chapterSummary: { summary: "小队抵达仓库。", keyEvents: "抵达仓库。" },
      }]),
    },
    character: {
      findMany: async () => ([{
        name: "林澈",
        role: "主角",
        currentState: "怀疑公司隐瞒事故。",
        currentGoal: "找到档案站坐标。",
        development: "从被动接单转向主动调查。",
      }]),
    },
    characterResourceLedgerItem: {
      findMany: async () => ([{
        name: "旧式信标",
        status: "available",
        summary: "能定位档案站残留信号。",
      }]),
    },
    styleBinding: {
      findMany: async () => ([{
        styleProfileId: "style-1",
        updatedAt: date(),
        styleProfile: {
          name: "冷硬科幻",
          description: "克制、清晰、少抒情。",
          narrativeRulesJson: JSON.stringify(["多用行动推进"]),
          languageRulesJson: JSON.stringify(["避免空泛感叹"]),
          antiAiBindings: [{
            antiAiRule: {
              promptInstruction: "避免总结式鸡汤句。",
              description: "避免总结式鸡汤句。",
            },
          }],
        },
      }]),
    },
    auditReport: {
      findMany: async () => ([{
        issues: [{
          severity: "medium",
          code: "weak_hook",
          evidence: "结尾缺少新问题。",
          fixSuggestion: "用未解释信号收尾。",
        }],
      }]),
    },
    openConflict: {
      findMany: async () => ([{
        severity: "high",
        title: "公司封锁真相",
        summary: "主角必须绕开公司监控。",
      }]),
    },
    novelWorkflowTask: {
      findUnique: async () => null,
      findFirst: async () => ({
        id: "task-1",
        title: "自动导演推进",
        status: "running",
        progress: 0.4,
        currentStage: "chapter_pipeline",
        currentItemLabel: "第 3 章",
        checkpointSummary: "章节执行中。",
        lastError: null,
        updatedAt: date(),
      }),
    },
    ...overrides,
  };
}

test("novel material exporter returns first-phase core blocks", async () => {
  const exporter = new NovelPromptMaterialExporter(buildDb());
  const result = await exporter.export({
    novelId: "novel-1",
    chapterId: "chapter-1",
    groups: [
      "novel_basics",
      "chapter_mission",
      "current_chapter",
      "recent_chapters",
      "character_state",
      "world_rules",
      "style_contract",
      "open_issues",
      "director_workspace",
    ],
  });

  assert.deepEqual(result.missingGroups, []);
  assert.deepEqual(result.missingInputs, []);
  assert.ok(result.blocks.some((item) => item.group === "novel_basics" && item.content.includes("信号轨道")));
  assert.ok(result.blocks.some((item) => item.group === "chapter_mission" && item.required));
  assert.ok(result.blocks.some((item) => item.group === "character_state" && item.importance === "high"));
  assert.ok(result.blocks.some((item) => item.group === "world_rules" && item.content.includes("通讯延迟")));
  assert.ok(result.blocks.some((item) => item.group === "style_contract" && item.content.includes("避免总结式鸡汤句")));
});

test("novel material exporter reports missing chapter inputs without blocking novel-level blocks", async () => {
  const exporter = new NovelPromptMaterialExporter(buildDb());
  const result = await exporter.export({
    novelId: "novel-1",
    groups: ["novel_basics", "chapter_mission", "current_chapter"],
  });

  assert.ok(result.blocks.some((item) => item.group === "novel_basics"));
  assert.ok(result.missingInputs.includes("chapter_mission: chapterId"));
  assert.ok(result.missingInputs.includes("current_chapter: chapterId"));
});

test("novel material exporter reports unknown groups and trims over-budget content", async () => {
  const exporter = new NovelPromptMaterialExporter(buildDb({
    novel: {
      findUnique: async () => ({
        id: "novel-1",
        title: "长资料",
        description: "资料".repeat(600),
        targetAudience: null,
        bookSellingPoint: null,
        first30ChapterPromise: null,
        estimatedChapterCount: null,
        defaultChapterLength: null,
        updatedAt: date(),
        genre: null,
        primaryStoryMode: null,
        secondaryStoryMode: null,
      }),
    },
  }));
  const result = await exporter.export({
    novelId: "novel-1",
    groups: ["novel_basics", "unknown_group"],
    maxTokens: 20,
  });

  assert.ok(result.missingGroups.includes("unknown_group"));
  assert.ok(result.warnings.some((item) => item.includes("已裁剪")));
  assert.ok(result.blocks[0].content.includes("已裁剪"));
});

test("novel material group registry has no duplicate public names or aliases", () => {
  const seen = new Set();
  const duplicates = [];
  for (const definition of listNovelMaterialGroupDefinitions()) {
    for (const name of [definition.group, ...(definition.aliases ?? [])]) {
      if (seen.has(name)) {
        duplicates.push(name);
      }
      seen.add(name);
    }
  }
  assert.deepEqual(duplicates, []);
});
