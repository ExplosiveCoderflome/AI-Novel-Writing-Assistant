import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCreativeHubBindingPatch,
  applyCreativeHubBindingsToSearch,
  areCreativeHubBindingsEqual,
  buildCreativeHubAutoCreateKey,
  buildCreativeHubBindingsFromSearch,
  findCreativeHubInitialThread,
} from "../src/pages/creativeHub/routing/creativeHubRouteBindings.ts";
import { resolveCreativeHubWorkspacePresentation } from "../src/pages/creativeHub/presentation/creativeHubWorkspaceViewModel.ts";

test("Creative Hub route bindings preserve multi-value knowledge documents", () => {
  const search = new URLSearchParams("novelId=n1&knowledgeDocumentId=k2&knowledgeDocumentId=k1");
  const bindings = buildCreativeHubBindingsFromSearch(search);
  assert.deepEqual(bindings.knowledgeDocumentIds, ["k2", "k1"]);
  const next = applyCreativeHubBindingsToSearch(new URLSearchParams("threadId=t1&taskId=old"), bindings);
  assert.equal(next.get("threadId"), "t1");
  assert.equal(next.get("taskId"), null);
  assert.deepEqual(next.getAll("knowledgeDocumentId"), ["k2", "k1"]);
  assert.equal(areCreativeHubBindingsEqual(bindings, { ...bindings, knowledgeDocumentIds: ["k1", "k2"] }), true);
  assert.equal(buildCreativeHubAutoCreateKey(bindings, true), buildCreativeHubAutoCreateKey({ ...bindings, knowledgeDocumentIds: ["k1", "k2"] }, true));
});

test("switching novels clears chapter and world bindings from the previous novel", () => {
  const current = {
    novelId: "novel-a",
    chapterId: "chapter-a",
    worldId: "world-a",
    taskId: "task-1",
  };
  assert.deepEqual(applyCreativeHubBindingPatch(current, { novelId: "novel-b" }), {
    novelId: "novel-b",
    chapterId: null,
    worldId: null,
    taskId: "task-1",
  });
  assert.deepEqual(applyCreativeHubBindingPatch(current, { novelId: "novel-a" }), current);
});

test("a bound deep link never falls back to an unrelated existing thread", () => {
  const requested = { novelId: "novel-b", bookAnalysisId: "analysis-b" };
  const unrelated = { id: "thread-a", resourceBindings: { novelId: "novel-a" } };
  const matching = { id: "thread-b", resourceBindings: requested };
  assert.equal(findCreativeHubInitialThread([unrelated], requested, true), null);
  assert.equal(findCreativeHubInitialThread([unrelated, matching], requested, true), matching);
  assert.equal(findCreativeHubInitialThread([unrelated], requested, false), unrelated);
});

test("workspace recommendation prioritizes loading errors before other state", () => {
  const result = resolveCreativeHubWorkspacePresentation({
    isRunning: true,
    threadsError: new Error("network unavailable"),
    interrupt: { id: "i1", title: "确认", summary: "等待确认" },
  });
  assert.equal(result.recommendation.action, "retry_threads");
  assert.equal(result.recommendation.tone, "danger");
});

test("workspace recommendation prioritizes interrupt and running state", () => {
  const interrupted = resolveCreativeHubWorkspacePresentation({
    isRunning: false,
    currentNovelTitle: "测试小说",
    interrupt: { id: "i1", title: "确认角色变化", summary: "确认后继续" },
  });
  const running = resolveCreativeHubWorkspacePresentation({
    isRunning: true,
    currentNovelTitle: "测试小说",
    productionStatus: { title: "测试小说", currentStage: "章节执行" },
  });
  assert.equal(interrupted.recommendation.action, "review_interrupt");
  assert.equal(running.recommendation.action, "view_activity");
});

test("structured recovery, setup and next-suggestion states keep their priority", () => {
  const recovery = resolveCreativeHubWorkspacePresentation({
    isRunning: false,
    diagnostics: { failureSummary: "任务失败", recoveryHint: "从检查点恢复" },
  });
  const setup = resolveCreativeHubWorkspacePresentation({
    isRunning: false,
    novelSetup: {
      title: "新书",
      stage: "setup_in_progress",
      nextQuestion: "主角最想得到什么？",
      recommendedAction: "继续补齐主角目标",
    },
    latestTurnSummary: { nextSuggestion: "先写第一章" },
  });
  assert.equal(recovery.recommendation.prompt, "从检查点恢复");
  assert.equal(setup.recommendation.prompt, "继续补齐主角目标");
});

test("structured thread and turn failures remain recovery actions", () => {
  const failedTurn = resolveCreativeHubWorkspacePresentation({
    isRunning: false,
    thread: { status: "error", latestError: "模型连接已中断" },
    latestTurnSummary: {
      status: "failed",
      currentStage: "执行失败",
      impactSummary: "本轮正文没有生成",
      nextSuggestion: "检查模型配置后重试",
    },
  });
  assert.equal(failedTurn.recommendation.tone, "danger");
  assert.equal(failedTurn.recommendation.action, "send_prompt");
  assert.equal(failedTurn.recommendation.prompt, "检查模型配置后重试");
  assert.match(failedTurn.recommendation.description, /模型连接已中断/);
});

test("backend busy and interrupted thread states keep operational priority", () => {
  const busy = resolveCreativeHubWorkspacePresentation({
    isRunning: false,
    thread: { status: "busy" },
  });
  const interrupted = resolveCreativeHubWorkspacePresentation({
    isRunning: false,
    thread: { status: "interrupted", latestError: "审批前留下的旧错误" },
    latestTurnSummary: {
      status: "interrupted",
      nextSuggestion: "先确认角色改动",
    },
  });
  assert.equal(busy.recommendation.action, "view_activity");
  assert.equal(interrupted.recommendation.action, "view_activity");
  assert.equal(interrupted.recommendation.tone, "warning");
});

test("automatic thread creation failure exposes a persistent retry action", () => {
  const result = resolveCreativeHubWorkspacePresentation({
    isRunning: false,
    createThreadError: new Error("service unavailable"),
  });
  assert.equal(result.recommendation.action, "retry_create_thread");
  assert.equal(result.recommendation.tone, "danger");
});

test("an unbound workspace recommends choosing a novel", () => {
  const result = resolveCreativeHubWorkspacePresentation({ isRunning: false });
  assert.equal(result.objectTitle, "未绑定小说");
  assert.equal(result.recommendation.action, "select_novel");
});
