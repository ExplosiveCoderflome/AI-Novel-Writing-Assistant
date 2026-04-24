const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizePlannerOutput } = require("../dist/services/planner/PlannerService.js");

test("normalizePlannerOutput coerces object-like planner fields into safe strings", () => {
  const normalized = normalizePlannerOutput({
    title: { main: "章节规划" },
    objective: ["推进主线", "强化冲突"],
    participants: ["主角", { alias: "同伴" }],
    reveals: { first: "隐藏线索" },
    riskNotes: [{ item: "避免重复开场" }],
    hookTarget: { summary: "结尾留下悬念" },
    scenes: [
      {
        title: { text: "冲突爆发" },
        objective: { detail: "逼主角做选择" },
        conflict: ["误解升级", "利益对撞"],
        reveal: { fact: "真相露出一角" },
        emotionBeat: 7,
      },
    ],
  });

  assert.equal(normalized.title, "章节规划");
  assert.equal(normalized.objective, "推进主线；强化冲突");
  assert.deepEqual(normalized.participants, ["主角", "同伴"]);
  assert.deepEqual(normalized.reveals, ["隐藏线索"]);
  assert.deepEqual(normalized.riskNotes, ["避免重复开场"]);
  assert.equal(normalized.hookTarget, "结尾留下悬念");
  assert.equal(normalized.scenes[0].title, "冲突爆发");
  assert.equal(normalized.scenes[0].objective, "逼主角做选择");
  assert.equal(normalized.scenes[0].conflict, "误解升级；利益对撞");
  assert.equal(normalized.scenes[0].reveal, "真相露出一角");
  assert.equal(normalized.scenes[0].emotionBeat, "7");
});

test("normalizePlannerOutput maps common planner goal aliases to objective", () => {
  const normalized = normalizePlannerOutput({
    title: "第 3 章",
    chapterGoal: "接到鬼宅委托并决定前往现场",
    scenes: [
      {
        title: "陌生来电",
        sceneGoal: "让委托人说出鬼宅地址",
        conflict: "电话断续且信息不完整",
        reveal: "城南旧宅出现异常阴气",
        emotionBeat: "疑虑升高",
      },
    ],
  });

  assert.equal(normalized.objective, "接到鬼宅委托并决定前往现场");
  assert.equal(normalized.scenes[0].objective, "让委托人说出鬼宅地址");
});
