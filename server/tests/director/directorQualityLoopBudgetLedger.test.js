const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildDirectorQualityLoopBudgetWindow,
  buildDirectorQualityLoopIssueSignature,
  findDirectorQualityLoopBudgetEntry,
  recordDirectorQualityLoopBudgetAttempt,
  resolveDirectorQualityLoopBudgetNextAction,
} = require("../../dist/services/novel/director/runtime/DirectorQualityLoopBudgetLedgerService.js");

function buildState(overrides = {}) {
  return {
    enabled: true,
    mode: "book",
    autoReview: true,
    autoRepair: true,
    startOrder: 1,
    endOrder: 10,
    totalChapterCount: 10,
    nextChapterId: "chapter-6",
    nextChapterOrder: 6,
    remainingChapterIds: ["chapter-6", "chapter-7", "chapter-8"],
    remainingChapterOrders: [6, 7, 8],
    ...overrides,
  };
}

test("quality loop budget shares the same signature across chapters in the same affected window", () => {
  let state = buildState();
  const issueSignature = buildDirectorQualityLoopIssueSignature({
    noticeCode: "PIPELINE_REPLAN_REQUIRED",
    riskLevel: "replan",
    repairMode: "heavy_repair",
    reason: "State-driven replan is required before continuing: 第 6 章关系状态冲突",
  });
  const firstWindow = buildDirectorQualityLoopBudgetWindow({
    autoExecution: state,
    chapterId: "chapter-6",
    chapterOrder: 6,
  });

  let result = recordDirectorQualityLoopBudgetAttempt({
    state,
    novelId: "novel-1",
    taskId: "task-1",
    issueSignature,
    affectedChapterWindow: firstWindow,
    action: "window_replan",
    reason: "第 6 章关系状态冲突",
    chapterId: "chapter-6",
    chapterOrder: 6,
    occurredAt: "2026-05-02T00:00:00.000Z",
  });
  state = buildState({
    ...result.state,
    nextChapterId: "chapter-7",
    nextChapterOrder: 7,
    remainingChapterIds: ["chapter-7", "chapter-8"],
    remainingChapterOrders: [7, 8],
  });
  const secondWindow = buildDirectorQualityLoopBudgetWindow({
    autoExecution: state,
    chapterId: "chapter-7",
    chapterOrder: 7,
  });
  const secondSignature = buildDirectorQualityLoopIssueSignature({
    noticeCode: "PIPELINE_REPLAN_REQUIRED",
    riskLevel: "replan",
    repairMode: "heavy_repair",
    reason: "State-driven replan is required before continuing: 第 7 章关系状态冲突",
  });
  const entry = findDirectorQualityLoopBudgetEntry({
    state,
    novelId: "novel-1",
    taskId: "task-1",
    issueSignature: secondSignature,
    affectedChapterWindow: secondWindow,
  });

  assert.equal(entry?.windowReplanCount, 1);
  assert.equal(resolveDirectorQualityLoopBudgetNextAction(entry), "defer_and_continue");
});

test("quality loop budget keeps different issue signatures independent", () => {
  const state = buildState();
  const window = buildDirectorQualityLoopBudgetWindow({
    autoExecution: state,
    chapterId: "chapter-6",
    chapterOrder: 6,
  });
  const first = recordDirectorQualityLoopBudgetAttempt({
    state,
    novelId: "novel-1",
    taskId: "task-1",
    issueSignature: buildDirectorQualityLoopIssueSignature({
      noticeCode: "PIPELINE_QUALITY_REVIEW",
      riskLevel: "low",
      repairMode: "light_repair",
      reason: "第 6 章局部重复",
    }),
    affectedChapterWindow: window,
    action: "patch_repair",
    reason: "第 6 章局部重复",
  });
  const differentEntry = findDirectorQualityLoopBudgetEntry({
    state: first.state,
    novelId: "novel-1",
    taskId: "task-1",
    issueSignature: buildDirectorQualityLoopIssueSignature({
      noticeCode: "PIPELINE_QUALITY_REVIEW",
      riskLevel: "low",
      repairMode: "light_repair",
      reason: "第 6 章角色动机不足",
    }),
    affectedChapterWindow: window,
  });

  assert.equal(differentEntry, null);
});

