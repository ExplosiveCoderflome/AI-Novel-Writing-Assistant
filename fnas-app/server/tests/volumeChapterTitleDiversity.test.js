const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assertChapterTitleDiversity,
  detectChapterTitleSurfaceFrame,
  getChapterTitleDiversityIssue,
} = require("../dist/services/novel/volume/chapterTitleDiversity.js");
const {
  createVolumeChapterListPrompt,
} = require("../dist/prompting/prompts/novel/volume/chapterList.prompts.js");
const {
  runStructuredPrompt,
  setPromptRunnerStructuredInvokerForTests,
} = require("../dist/prompting/core/promptRunner.js");

const EMPTY_CONTEXT = {
  blocks: [],
  selectedBlockIds: [],
  droppedBlockIds: [],
  summarizedBlockIds: [],
  estimatedInputTokens: 0,
};

test("chapter title diversity detects repeated X的Y framing", () => {
  const issue = getChapterTitleDiversityIssue([
    "废墟中的发现",
    "第一株灵植的种子",
    "掠夺者的阴影",
    "防御的萌芽",
    "余烬中的脚印",
    "守夜人的来信",
  ]);

  assert.match(issue, /X的Y \/ X中的Y/);
  assert.equal(detectChapterTitleSurfaceFrame("掠夺者的阴影"), "of_phrase");
});

test("chapter title diversity detects repeated A，B framing", () => {
  const issue = getChapterTitleDiversityIssue([
    "签下合同，甜蜜同居",
    "房租超支，紧急筹钱",
    "林晓求职，首战告败",
    "苏雨追梦，画室坚守",
    "四处求助，借钱解围",
    "机会临门，意外落空",
  ]);

  assert.match(issue, /A，B \/ 四字动作，四字结果/);
  assert.equal(detectChapterTitleSurfaceFrame("房租超支，紧急筹钱"), "comma_split");
});

test("chapter title diversity accepts mixed chapter title surfaces", () => {
  assert.doesNotThrow(() => assertChapterTitleDiversity([
    "夜探旧温室",
    "掠夺者逼近",
    "谁在回收种子？",
    "防线第一次成形",
    "第二道呼吸",
    "林青，别回头",
  ]));
});

test("volume chapter list prompt render hardens title diversity rules", () => {
  const messages = createVolumeChapterListPrompt(6).render({
    targetChapterCount: 6,
    retryReason: "章名结构过于集中",
  }, EMPTY_CONTEXT);

  assert.equal(messages.length, 2);
  assert.match(String(messages[0].content), /不能大面积重复“X的Y \/ X中的Y \/ 在X中Y”/);
  assert.match(String(messages[0].content), /A，B \/ 四字动作，四字结果/);
  assert.match(String(messages[0].content), /章名结构过于集中/);
});

test("volume chapter list prompt retries semantically when titles are structurally repetitive", async () => {
  const calls = [];

  setPromptRunnerStructuredInvokerForTests(async (input) => {
    calls.push(input);
    if (calls.length === 1) {
      return {
        data: {
          chapters: [
            { title: "签下合同，甜蜜同居", summary: "主角暂时稳住住处问题，同时把关系线推进到新阶段。" },
            { title: "房租超支，紧急筹钱", summary: "现实压力突然压上来，逼着主角立刻行动。" },
            { title: "林晓求职，首战告败", summary: "主角第一次外出求职受挫，确认局面没有想象中轻松。" },
            { title: "苏雨追梦，画室坚守", summary: "配角线同步抬升，让现实理想冲突进一步显形。" },
          ],
        },
        repairUsed: false,
        repairAttempts: 0,
      };
    }

    return {
      data: {
        chapters: [
          { title: "夜探旧温室", summary: "主角夜探温室，确认异常来源并推动探索线正式启动。" },
          { title: "掠夺者逼近", summary: "外部威胁压到眼前，当前卷的生存压力第一次真正落地。" },
          { title: "谁在回收种子？", summary: "主角发现有人暗中回收灵种，把悬疑线抬到台前。" },
          { title: "防线第一次成形", summary: "主角完成阶段性布防，让当前卷第一次出现可见成果。" },
        ],
      },
      repairUsed: false,
      repairAttempts: 0,
    };
  });

  try {
    const result = await runStructuredPrompt({
      asset: createVolumeChapterListPrompt(4),
      promptInput: {
        targetChapterCount: 4,
      },
    });

    assert.equal(calls.length, 2);
    assert.equal(calls[1].promptMeta.semanticRetryUsed, true);
    assert.equal(calls[1].promptMeta.semanticRetryAttempts, 1);
    assert.match(String(calls[1].messages[calls[1].messages.length - 1].content), /A，B \/ 四字动作，四字结果/);
    assert.equal(result.output.chapters[0].title, "夜探旧温室");
  } finally {
    setPromptRunnerStructuredInvokerForTests();
  }
});
