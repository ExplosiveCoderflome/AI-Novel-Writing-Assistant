const test = require("node:test");
const assert = require("node:assert/strict");

const {
  mergeProjectionAssignments,
} = require("../dist/services/novel/dynamics/characterDynamicsUtils.js");

test("mergeProjectionAssignments merges duplicate character-volume assignments deterministically", () => {
  const merged = mergeProjectionAssignments([
    {
      characterName: "赵高",
      volumeSortOrder: 2,
      roleLabel: "主角",
      responsibility: "在朝局中站稳脚跟。",
      appearanceExpectation: "",
      plannedChapterOrders: [4, 6],
      isCore: false,
      absenceWarningThreshold: 5,
      absenceHighRiskThreshold: 8,
    },
    {
      characterName: " 赵高 ",
      volumeSortOrder: 2,
      roleLabel: "",
      responsibility: "在朝局中站稳脚跟，并主动布局下一轮反压。",
      appearanceExpectation: "中高频持续出场",
      plannedChapterOrders: [6, 8, -1],
      isCore: true,
      absenceWarningThreshold: 3,
      absenceHighRiskThreshold: 5,
    },
    {
      characterName: "李斯",
      volumeSortOrder: 2,
      roleLabel: "政敌",
      responsibility: "施加制度与朝堂压力。",
      appearanceExpectation: "关键节点出场",
      plannedChapterOrders: [5],
      isCore: true,
      absenceWarningThreshold: 4,
      absenceHighRiskThreshold: 6,
    },
  ]);

  assert.equal(merged.length, 2);

  const zhaoGao = merged.find((item) => item.characterName.trim() === "赵高");
  assert.ok(zhaoGao);
  assert.equal(zhaoGao.roleLabel, "主角");
  assert.equal(zhaoGao.responsibility, "在朝局中站稳脚跟，并主动布局下一轮反压。");
  assert.equal(zhaoGao.appearanceExpectation, "中高频持续出场");
  assert.deepEqual(zhaoGao.plannedChapterOrders, [4, 6, 8]);
  assert.equal(zhaoGao.isCore, true);
  assert.equal(zhaoGao.absenceWarningThreshold, 3);
  assert.equal(zhaoGao.absenceHighRiskThreshold, 5);
});
