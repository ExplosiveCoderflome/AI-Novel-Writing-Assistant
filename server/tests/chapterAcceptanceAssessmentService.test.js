const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeAssessment,
} = require("../dist/services/novel/runtime/ChapterAcceptanceAssessmentService.js");
const { chapterAcceptanceAssessmentPrompt } = require("../dist/prompting/prompts/novel/chapterAcceptance.prompts.js");
const { chapterWriterPrompt } = require("../dist/prompting/prompts/novel/chapterWriter.prompts.js");

function createAssessment(overrides = {}) {
  return {
    status: "accepted",
    score: {
      coherence: 82,
      pacing: 82,
      repetition: 82,
      engagement: 82,
      voice: 82,
      overall: 82,
    },
    summary: "chapter accepted",
    blockingIssues: [],
    repairDirectives: [],
    riskTags: [],
    assetSyncRecommendation: {
      priority: "normal",
      reason: "normal sync",
      requiresFullPayoffReconcile: false,
    },
    continuePolicy: "continue",
    ...overrides,
  };
}

test("normalizeAssessment drops stale under-length issue when actual content satisfies target range", () => {
  const content = "字".repeat(6025);
  const normalized = normalizeAssessment(createAssessment({
    status: "needs_manual_review",
    blockingIssues: [{
      severity: "high",
      category: "plot",
      code: "length_insufficient",
      evidence: "正文估算约2000-3000字，远低于目标长度5100-6900字范围。",
      fixSuggestion: "扩写到目标字数。",
    }, {
      severity: "medium",
      category: "plot",
      code: "payoff_missing_progress",
      evidence: "赵明相关线索缺失。",
      fixSuggestion: "补充赵明微笑暗示的真正游戏。",
    }],
    repairDirectives: [{
      mode: "rewrite",
      target: "plot",
      instruction: "扩写正文到目标长度。",
    }, {
      mode: "patch",
      target: "plot",
      instruction: "补充赵明微笑暗示的真正游戏。",
    }],
    riskTags: ["length_insufficient", "payoff_missing_progress"],
    continuePolicy: "pause",
  }), content, 6000);

  assert.equal(normalized.status, "repairable");
  assert.equal(normalized.continuePolicy, "repair_once");
  assert.deepEqual(normalized.blockingIssues.map((issue) => issue.code), ["payoff_missing_progress"]);
  assert.deepEqual(normalized.repairDirectives.map((directive) => directive.instruction), ["补充赵明微笑暗示的真正游戏。"]);
  assert.deepEqual(normalized.riskTags, ["payoff_missing_progress"]);
});

test("normalizeAssessment keeps under-length issue when actual content is still below target range", () => {
  const normalized = normalizeAssessment(createAssessment({
    status: "repairable",
    blockingIssues: [{
      severity: "high",
      category: "plot",
      code: "length_insufficient",
      evidence: "正文估算远低于目标长度。",
      fixSuggestion: "扩写到目标字数。",
    }],
    repairDirectives: [{
      mode: "rewrite",
      target: "plot",
      instruction: "扩写正文到目标长度。",
    }],
    riskTags: ["length_insufficient"],
    continuePolicy: "repair_once",
  }), "字".repeat(3000), 6000);

  assert.equal(normalized.status, "repairable");
  assert.equal(normalized.continuePolicy, "repair_once");
  assert.deepEqual(normalized.blockingIssues.map((issue) => issue.code), ["length_insufficient"]);
});

test("normalizeAssessment routes missing obligations to repairable draft obligation gaps", () => {
  const normalized = normalizeAssessment(createAssessment({
    status: "accepted",
    missingObligations: [{
      kind: "payoff_touch",
      summary: "补出截信计划的可见行动。",
      evidence: "正文只回忆了计划，没有发生行动。",
    }],
    repairability: "patchable_obligation_gap",
    decisionReason: "只需局部补写即可兑现本章义务。",
  }), "字".repeat(3600), 3000);

  assert.equal(normalized.status, "repairable");
  assert.equal(normalized.continuePolicy, "repair_once");
  assert.equal(normalized.missingObligations[0].kind, "payoff_touch");
});

test("writer and acceptance prompts share the prose quality boundary", () => {
  const writerText = chapterWriterPrompt.render({
    novelTitle: "测试书",
    chapterOrder: 1,
    chapterTitle: "测试章",
  }, { slots: null, blocks: [], selectedBlockIds: [], droppedBlockIds: [], summarizedBlockIds: [], estimatedInputTokens: 0 }).map((message) => message.content).join("\n");
  const acceptanceText = chapterAcceptanceAssessmentPrompt.render({
    novelTitle: "测试书",
    chapterOrder: 1,
    chapterTitle: "测试章",
    content: "测试正文",
  }, { slots: null, blocks: [], selectedBlockIds: [], droppedBlockIds: [], summarizedBlockIds: [], estimatedInputTokens: 0 }).map((message) => message.content).join("\n");

  assert.match(writerText, /破折号、省略号或连续连字符/);
  assert.match(writerText, /否定翻转句/);
  assert.match(acceptanceText, /必须检查破折号、省略号/);
  assert.match(acceptanceText, /否定翻转句/);
});
