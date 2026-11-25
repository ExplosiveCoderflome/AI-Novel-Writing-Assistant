const test = require("node:test");
const assert = require("node:assert/strict");
const { buildRollingExpressionEchoHint } = require("../dist/services/novel/runtime/context/rollingExpressionEchoes.js");

test("buildRollingExpressionEchoHint returns empty when no valid chapter content exists", () => {
  assert.equal(buildRollingExpressionEchoHint([]), "");
  assert.equal(buildRollingExpressionEchoHint([{ order: 1, title: "序章", content: "   " }]), "");
});

test("buildRollingExpressionEchoHint summarizes recent closings and recurring transition echoes", () => {
  const chapterOne = [
    "夜风吹过长街，他把账本收进袖中。",
    "不可否认，巷口传来一阵急促的马蹄声。不可否认，门内火光熄灭。",
    "他合上窗棂，转身没入暗巷。",
  ].join("");
  const chapterTwo = [
    "清晨雾气未散，铺子刚卸下门板。",
    "不可否认，柜台后走出一名灰衣账房。不可否认，街角响起铜锣。",
    "他攥紧手里的铜钱，抬头看向门外。",
  ].join("");

  const hint = buildRollingExpressionEchoHint([
    { order: 2, title: "暗流", content: chapterTwo },
    { order: 1, title: "起局", content: chapterOne },
  ]);

  assert.match(hint, /近章表达惯性线索/);
  assert.match(hint, /第 2 章《暗流》收尾/);
  assert.match(hint, /第 1 章《起局》收尾/);
  assert.match(hint, /模板过渡词聚集（近 2 章反复出现）/);
  assert.match(hint, /「不可否认」/);
});
