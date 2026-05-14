const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyChapterPatchRepairPlan,
} = require("../../shared/dist/types/chapterPatchRepair.js");
const {
  ChapterPatchRepairFailedError,
  ChapterPatchRepairService,
} = require("../dist/services/novel/chapterPatchRepairService.js");
const promptRunner = require("../dist/prompting/core/promptRunner.js");

test("applyChapterPatchRepairPlan applies exact single-location patches", () => {
  const result = applyChapterPatchRepairPlan("第一段承接断裂。第二段继续推进。", {
    strategy: "patch_first",
    summary: "补足承接。",
    patches: [{
      id: "patch-1",
      targetExcerpt: "第一段承接断裂。",
      replacement: "第一段补上前因后果，承接自然。",
      reason: "修复承接问题。",
      issueIds: ["issue-1"],
    }],
    requiresFullRewrite: false,
    escalationReason: null,
  });

  assert.equal(result.success, true);
  assert.equal(result.content, "第一段补上前因后果，承接自然。第二段继续推进。");
  assert.deepEqual(result.appliedPatchIds, ["patch-1"]);
  assert.deepEqual(result.failures, []);
});

test("applyChapterPatchRepairPlan allows deleting unique target excerpts", () => {
  const result = applyChapterPatchRepairPlan("开头重复段落。正文继续推进。", {
    strategy: "patch_first",
    summary: "删除重复段落。",
    patches: [{
      id: "patch-delete",
      targetExcerpt: "开头重复段落。",
      replacement: "",
      reason: "删除重复内容。",
      issueIds: [],
    }],
    requiresFullRewrite: false,
    escalationReason: null,
  });

  assert.equal(result.success, true);
  assert.equal(result.content, "正文继续推进。");
  assert.deepEqual(result.appliedPatchIds, ["patch-delete"]);
  assert.deepEqual(result.failures, []);
});

test("applyChapterPatchRepairPlan rejects ambiguous target excerpts", () => {
  const result = applyChapterPatchRepairPlan("重复承接片段。重复承接片段。", {
    strategy: "patch_first",
    summary: "尝试修复重复。",
    patches: [{
      id: "patch-dup",
      targetExcerpt: "重复承接片段。",
      replacement: "替换后的片段。",
      reason: "目标片段重复。",
      issueIds: [],
    }],
    requiresFullRewrite: false,
    escalationReason: null,
  });

  assert.equal(result.success, false);
  assert.equal(result.content, "重复承接片段。重复承接片段。");
  assert.equal(result.failures[0].patchId, "patch-dup");
  assert.equal(result.failures[0].failureType, "ambiguous_target");
});

test("applyChapterPatchRepairPlan applies unique whitespace-normalized patches", () => {
  const result = applyChapterPatchRepairPlan("殿下？\n\n苏哲猛地抬头，目光扫过屋内陈设。", {
    strategy: "patch_first",
    summary: "修复跨段补丁。",
    patches: [{
      id: "patch-space",
      targetExcerpt: "殿下？苏哲猛地抬头，目光扫过屋内陈设。",
      replacement: "殿下？\n\n苏哲猛地抬头，终于意识到这具身体的身份不简单。",
      reason: "目标片段只存在换行差异。",
      issueIds: [],
    }],
    requiresFullRewrite: false,
    escalationReason: null,
  });

  assert.equal(result.success, true);
  assert.equal(result.content, "殿下？\n\n苏哲猛地抬头，终于意识到这具身体的身份不简单。");
  assert.deepEqual(result.appliedPatchIds, ["patch-space"]);
  assert.equal(result.appliedPatches[0].matchedBy, "normalized_whitespace");
});

test("applyChapterPatchRepairPlan rejects ambiguous whitespace-normalized matches", () => {
  const result = applyChapterPatchRepairPlan("殿下？\n\n苏哲醒来。殿下？ 苏哲醒来。", {
    strategy: "patch_first",
    summary: "尝试修复重复跨段。",
    patches: [{
      id: "patch-space-dup",
      targetExcerpt: "殿下？苏哲醒来。",
      replacement: "殿下？苏哲彻底醒来。",
      reason: "目标片段去除空白后重复。",
      issueIds: [],
    }],
    requiresFullRewrite: false,
    escalationReason: null,
  });

  assert.equal(result.success, false);
  assert.equal(result.content, "殿下？\n\n苏哲醒来。殿下？ 苏哲醒来。");
  assert.equal(result.failures[0].failureType, "ambiguous_target");
  assert.equal(result.failures[0].matchedBy, "normalized_whitespace");
});

test("applyChapterPatchRepairPlan reports no_effect when replacement keeps content unchanged", () => {
  const result = applyChapterPatchRepairPlan("正文保持不变。", {
    strategy: "patch_first",
    summary: "无变化补丁。",
    patches: [{
      id: "patch-no-effect",
      targetExcerpt: "正文保持不变。",
      replacement: "正文保持不变。",
      reason: "替换后无变化。",
      issueIds: [],
    }],
    requiresFullRewrite: false,
    escalationReason: null,
  });

  assert.equal(result.success, false);
  assert.equal(result.failures[0].failureType, "no_effect");
});

test("applyChapterPatchRepairPlan rejects full rewrite plans", () => {
  const result = applyChapterPatchRepairPlan("正文。", {
    strategy: "full_rewrite",
    summary: "需要重写。",
    patches: [],
    requiresFullRewrite: true,
    escalationReason: "结构性缺章。",
  });

  assert.equal(result.success, false);
  assert.equal(result.content, "正文。");
  assert.equal(result.failures[0].patchId, "plan");
});

test("ChapterPatchRepairService does not run local repair in rewrite-only modes", async () => {
  const service = new ChapterPatchRepairService();

  await assert.rejects(
    () => service.repair({
      novelTitle: "测试小说",
      chapterTitle: "第一章",
      content: "已有正文。",
      issues: [],
      repairMode: "heavy_repair",
    }),
    ChapterPatchRepairFailedError,
  );

  await assert.rejects(
    () => service.repair({
      novelTitle: "测试小说",
      chapterTitle: "第一章",
      content: "已有正文。",
      issues: [],
      repairMode: "detect_only",
    }),
    ChapterPatchRepairFailedError,
  );
});

test("ChapterPatchRepairService reports structured patch schema failures as recoverable", async () => {
  const originalRunStructuredPrompt = promptRunner.runStructuredPrompt;
  promptRunner.runStructuredPrompt = async () => {
    throw new Error("patches.1.targetExcerpt: Too small");
  };

  try {
    await assert.rejects(
      () => new ChapterPatchRepairService().repair({
        novelTitle: "测试小说",
        chapterTitle: "第一章",
        content: "已有正文足够执行修复。",
        issues: [],
        repairMode: "light_repair",
      }),
      (error) => {
        assert.equal(error instanceof ChapterPatchRepairFailedError, true);
        assert.match(error.message, /局部补丁计划未通过结构校验/);
        assert.match(error.message, /targetExcerpt/);
        return true;
      },
    );
  } finally {
    promptRunner.runStructuredPrompt = originalRunStructuredPrompt;
  }
});
