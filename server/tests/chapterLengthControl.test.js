const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeChapterScenePlan,
  parseChapterScenePlan,
  resolveLengthBudgetContract,
  serializeChapterScenePlan,
  generatedChapterScenePlanSchema,
} = require("../../shared/dist/types/chapterLengthControl.js");
const {
  EMPTY_READER_EXPERIENCE_CONTRACT,
  generatedReaderExperienceContractSchema,
} = require("../../shared/dist/types/novel/readerExperience.js");

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
  assert.deepEqual(plan.readerExperience, EMPTY_READER_EXPERIENCE_CONTRACT);
  assert.equal(plan.scenes[0].resistance, "");
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
    readerExperience: {
      readerQuestion: "主角能否把维修通道变成反击入口？",
      promisedReward: "主角完成第一次可见反压。",
      rewardLevel: "partial",
      protagonistWant: "抢回局面主动权。",
      primaryResistance: "敌方封锁维修通道并逼迫主角后退。",
      keyTurn: "主角利用错误封锁记录反向锁定内应。",
      emotionalShift: "从被压制转为看见破局希望。",
      informationReveal: "维修通道封锁记录被人为修改。",
      netChange: "主角拿到反压入口，敌方被迫调整封锁。",
      inheritedHookResponsibilities: ["回应上一章留下的维修通道钥匙"],
      endingHook: "内应发现记录暴露并准备灭口。",
    },
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
        resistance: "入口被封锁。",
        turn: "主角发现封锁记录有误。",
        emotionalShift: "谨慎转为确定。",
        readerValue: "确认钥匙并非无效道具。",
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
        resistance: "敌方追查修改记录的人。",
        turn: "主角反向锁定内应。",
        emotionalShift: "压迫转为反击快感。",
        readerValue: "第一次反压形成可见收益。",
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
        resistance: "内应准备清除证据。",
        turn: "主角意识到证据即将消失。",
        emotionalShift: "短暂轻松转为紧迫。",
        readerValue: "本章收益落地后出现新的具体压力。",
      },
    ],
  });

  const parsed = JSON.parse(serialized);
  assert.equal(parsed.targetWordCount, 3000);
  assert.equal(parsed.lengthBudget.softMaxWordCount, 3450);
  assert.equal(parsed.scenes.length, 3);
  assert.equal(parsed.readerExperience.promisedReward, "主角完成第一次可见反压。");
  assert.equal(parsed.scenes[1].turn, "主角反向锁定内应。");
});

test("new reader experience generation schema rejects incomplete AI contracts", () => {
  assert.equal(generatedReaderExperienceContractSchema.safeParse({
    readerQuestion: "读者问题",
  }).success, false);

  const legacyPlan = normalizeChapterScenePlan({
    scenes: [
      { title: "一", purpose: "推进一", entryState: "A", exitState: "B", targetWordCount: 800 },
      { title: "二", purpose: "推进二", entryState: "B", exitState: "C", targetWordCount: 800 },
      { title: "三", purpose: "推进三", entryState: "C", exitState: "D", targetWordCount: 800 },
    ],
  }, 2400);
  assert.equal(generatedChapterScenePlanSchema.safeParse(legacyPlan).success, false);
});

test("chapter length control filters system audit labels from mustAdvance", () => {
  const plan = normalizeChapterScenePlan([
    {
      title: "开局",
      objective: "主角进入现场",
      mustAdvance: ["acceptance_gate_unavailable", "发现真正线索"],
      entryState: "主角到达",
      exitState: "线索出现",
      targetWordCount: 800,
    },
    {
      title: "追问",
      objective: "冲突升级",
      mustAdvanceItems: ["plot/missing_must_hit", "逼问证人"],
      entryState: "线索出现",
      exitState: "证人松口",
      targetWordCount: 800,
    },
    {
      title: "钩子",
      objective: "留下危机",
      mustAdvance: ["mode_fit/acceptance_gate_unavailable", "敌人现身"],
      entryState: "证人松口",
      exitState: "敌人现身",
      targetWordCount: 800,
    },
  ], 2400);

  assert.deepEqual(plan.scenes.map((scene) => scene.mustAdvance), [
    ["发现真正线索"],
    ["逼问证人"],
    ["敌人现身"],
  ]);
});
