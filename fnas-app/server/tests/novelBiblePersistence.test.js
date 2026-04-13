const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeNovelBiblePayload } = require("../dist/services/novel/novelBiblePersistence.js");

test("normalizeNovelBiblePayload flattens object bible fields into strings", () => {
  const payload = normalizeNovelBiblePayload({
    coreSetting: {
      premise: "抗日背景下的奇侠传奇",
      hook: "民间秘术对抗侵略势力",
    },
    forbiddenRules: ["不能牺牲主线成长", "不能破坏家国主题"],
    mainPromise: {
      summary: "主角在乱世中守护家园并成长为领袖",
    },
    characterArcs: {
      protagonist: "从热血少年成长为抗敌领袖",
      ally: "从怀疑到并肩作战",
    },
    world: {
      history: "20世纪30年代的华夏大地",
      power: "民间奇术与超凡秘法并存",
    },
  }, "抗日奇侠传");

  assert.match(payload.coreSetting ?? "", /premise：抗日背景下的奇侠传奇/);
  assert.equal(payload.forbiddenRules, "不能牺牲主线成长\n不能破坏家国主题");
  assert.equal(payload.mainPromise, "主角在乱世中守护家园并成长为领袖");
  assert.match(payload.characterArcs ?? "", /protagonist：从热血少年成长为抗敌领袖/);
  assert.match(payload.worldRules ?? "", /history：20世纪30年代的华夏大地/);
  assert.doesNotThrow(() => JSON.parse(payload.rawContent));
});
