const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeChapterScenePlan,
  parseChapterScenePlan,
  resolveLengthBudgetContract,
  serializeChapterScenePlan,
} = require("../../shared/dist/types/chapterLengthControl.js");

test("chapter length control normalizes scene targets to the chapter target budget", () => {
  const plan = normalizeChapterScenePlan({
    scenes: [
      {
        sceneKey: "s1",
        sceneTitle: "开场抓手",
        objective: "先把当前风险钉死。",
        mustAdvanceItems: ["风险落地"],
        mustPreserveItems: ["压迫感"],
        startState: "主角还在被动。",
        endState: "主角确认危险真实存在。",
        forbidden: ["不要回顾前情"],
        wordCount: 600,
      },
      {
        sceneKey: "s2",
        sceneTitle: "正面对抗",
        objective: "让主角完成第一次明确反压。",
        mustAdvanceItems: ["反压兑现"],
        mustPreserveItems: ["资源差距仍在"],
        startState: "主角拿到反击切口。",
        endState: "敌方被迫应对。",
        forbidden: ["不要提前决战"],
        wordCount: 900,
      },
      {
        sceneKey: "s3",
        sceneTitle: "尾段钩子",
        objective: "用更大威胁接下章。",
        mustAdvanceItems: ["新威胁出现"],
        mustPreserveItems: ["本章收益有效"],
        startState: "主角暂时回到主动。",
        endState: "读者明确知道压力变大。",
        forbidden: ["不要展开下一章战斗"],
        wordCount: 500,
      },
    ],
  }, 3500);

  assert.equal(plan.lengthBudget.softMinWordCount, 2975);
  assert.equal(plan.lengthBudget.softMaxWordCount, 4025);
  assert.equal(plan.lengthBudget.hardMaxWordCount, 4375);
  assert.equal(plan.scenes.reduce((sum, scene) => sum + scene.targetWordCount, 0), 3500);
});

test("chapter length control parser rejects legacy free-text scene cards", () => {
  const parsed = parseChapterScenePlan("场景1：起势\n场景2：升级\n场景3：收尾", {
    targetWordCount: 3000,
  });
  assert.equal(parsed, null);
});

test("chapter length control serializer preserves canonical scene plan shape", () => {
  const budget = resolveLengthBudgetContract(3000);
  const serialized = serializeChapterScenePlan({
    targetWordCount: 3000,
    lengthBudget: budget,
    scenes: [
      {
        key: "scene_1",
        title: "起势",
        purpose: "建立当前局面。",
        mustAdvance: ["局面建立"],
        mustPreserve: ["压迫感"],
        entryState: "主角暂时被动。",
        exitState: "主角确认机会存在。",
        forbiddenExpansion: ["不要跳到结局"],
        targetWordCount: 900,
      },
      {
        key: "scene_2",
        title: "推进",
        purpose: "完成本章关键推进。",
        mustAdvance: ["关键推进"],
        mustPreserve: ["主线方向"],
        entryState: "机会已确认。",
        exitState: "局面完成变化。",
        forbiddenExpansion: ["不要新开支线"],
        targetWordCount: 1200,
      },
      {
        key: "scene_3",
        title: "收尾",
        purpose: "留下下一章钩子。",
        mustAdvance: ["钩子成立"],
        mustPreserve: ["本章收益仍有效"],
        entryState: "变化刚落地。",
        exitState: "新的压力压上来。",
        forbiddenExpansion: ["不要展开下章事件"],
        targetWordCount: 900,
      },
    ],
  });

  const parsed = JSON.parse(serialized);
  assert.equal(parsed.targetWordCount, 3000);
  assert.equal(parsed.lengthBudget.softMaxWordCount, 3450);
  assert.equal(parsed.scenes.length, 3);
});
