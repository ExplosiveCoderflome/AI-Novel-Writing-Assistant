import test from "node:test";
import assert from "node:assert/strict";
import {
  getPreferredBookAnalysisSection,
  isUnselectedBookAnalysisSection,
  resolveBookAnalysisNextAction,
  summarizeBookAnalysisSections,
} from "../src/pages/bookAnalysis/bookAnalysisWorkspaceViewModel.ts";

function section(overrides = {}) {
  return {
    sectionKey: "overview",
    status: "idle",
    aiContent: null,
    editedContent: null,
    structuredData: null,
    ...overrides,
  };
}

function analysis(overrides = {}) {
  return {
    status: "succeeded",
    progress: 1,
    lastError: null,
    sections: [],
    ...overrides,
  };
}

test("successful analyses point directly to readable results", () => {
  const result = resolveBookAnalysisNextAction({
    analysis: analysis({ sections: [section({ status: "succeeded", aiContent: "结果" })] }),
    analysesCount: 1,
  });
  assert.equal(result.action, "view_results");
  assert.equal(result.tone, "success");
});

test("successful analyses without sections expose the ghost-result recovery", () => {
  const result = resolveBookAnalysisNextAction({
    analysis: analysis(),
    analysesCount: 1,
  });
  assert.equal(result.action, "rebuild");
  assert.equal(result.tone, "danger");
  assert.match(result.title, /没有可展示/);
});

test("partial and failed analyses preserve readable sections", () => {
  const partial = analysis({
    status: "failed",
    lastError: "provider unavailable",
    sections: [
      section({ status: "succeeded", aiContent: "已完成内容" }),
      section({ sectionKey: "timeline", status: "failed" }),
    ],
  });
  const summary = summarizeBookAnalysisSections(partial);
  const result = resolveBookAnalysisNextAction({ analysis: partial, analysesCount: 1 });
  assert.deepEqual(summary, {
    total: 2,
    expected: 2,
    frozen: 0,
    unselected: 0,
    frozenReadable: 0,
    readable: 1,
    readableExpected: 1,
    missingExpected: 1,
    failedExpected: 1,
    succeeded: 1,
    running: 0,
    failed: 1,
  });
  assert.equal(result.action, "view_results");
  assert.match(result.description, /已保留/);
  assert.match(result.description, /仍有 1 个计划小节缺少可读结果/);
});

test("running analyses keep an entry to every readable partial result", () => {
  const result = resolveBookAnalysisNextAction({
    analysis: analysis({
      status: "running",
      progress: 0.45,
      sections: [
        section({ status: "succeeded", aiContent: "先完成的结果" }),
        section({ sectionKey: "plot_structure", status: "running" }),
      ],
    }),
    analysesCount: 1,
  });
  assert.equal(result.action, "view_results");
  assert.equal(result.actionLabel, "查看已有结果");
  assert.match(result.description, /已有 1 个小节可阅读/);
});

test("cancelled analyses state how many planned sections are still missing", () => {
  const result = resolveBookAnalysisNextAction({
    analysis: analysis({
      status: "cancelled",
      sections: [
        section({ status: "succeeded", aiContent: "保留内容" }),
        section({ sectionKey: "plot_structure", status: "idle" }),
        section({ sectionKey: "timeline", status: "failed" }),
      ],
    }),
    analysesCount: 1,
  });
  assert.equal(result.action, "view_results");
  assert.match(result.description, /仍有 2 个计划小节缺少可读结果/);
});

test("budget failures recommend resuming without discarding completed sections", () => {
  const result = resolveBookAnalysisNextAction({
    analysis: analysis({
      status: "failed",
      lastError: "budget_exceeded",
      sections: [section({ status: "succeeded", structuredData: { oneLinePositioning: "定位" } })],
    }),
    analysesCount: 1,
  });
  assert.equal(result.action, "resume_budget");
  assert.equal(result.tone, "warning");
  assert.match(result.description, /计划范围内没有缺失小节/);
});

test("archived analyses with readable content remain inspectable", () => {
  const result = resolveBookAnalysisNextAction({
    analysis: analysis({
      status: "archived",
      sections: [section({ status: "succeeded", editedContent: "归档结果" })],
    }),
    analysesCount: 1,
  });
  assert.equal(result.action, "view_results");
  assert.equal(result.actionLabel, "查看归档结果");
});

test("archived analyses without readable content can be copied for regeneration", () => {
  const result = resolveBookAnalysisNextAction({
    analysis: analysis({ status: "archived" }),
    analysesCount: 1,
  });
  assert.equal(result.action, "copy");
  assert.equal(result.actionLabel, "复制为新分析");
});

test("the preferred section is the first section with actual content", () => {
  const emptyOverview = section({ sectionKey: "overview", status: "failed" });
  const readablePlot = section({ sectionKey: "plot_structure", status: "succeeded", editedContent: "结构结果" });
  assert.equal(getPreferredBookAnalysisSection([emptyOverview, readablePlot]), readablePlot);
});

test("a frozen unselected section is not treated as a missing result", () => {
  const completeStandard = analysis({
    sections: [
      section({ status: "succeeded", aiContent: "总览", frozen: false }),
      section({ sectionKey: "plot_structure", status: "succeeded", aiContent: "结构", frozen: false }),
      section({ sectionKey: "timeline", status: "idle", frozen: true }),
    ],
  });
  const summary = summarizeBookAnalysisSections(completeStandard);
  const result = resolveBookAnalysisNextAction({ analysis: completeStandard, analysesCount: 1 });
  assert.equal(summary.expected, 2);
  assert.equal(summary.missingExpected, 0);
  assert.equal(summary.unselected, 1);
  assert.equal(summary.frozenReadable, 0);
  assert.equal(isUnselectedBookAnalysisSection(completeStandard.sections[2]), true);
  assert.equal(result.tone, "success");
});

test("readable frozen content cannot hide a missing planned section", () => {
  const mixed = analysis({
    sections: [
      section({ status: "succeeded", aiContent: "历史冻结结果", frozen: true }),
      section({ sectionKey: "plot_structure", status: "idle", frozen: false }),
    ],
  });
  const summary = summarizeBookAnalysisSections(mixed);
  const result = resolveBookAnalysisNextAction({ analysis: mixed, analysesCount: 1 });
  assert.equal(summary.readable, 1);
  assert.equal(summary.readableExpected, 0);
  assert.equal(summary.missingExpected, 1);
  assert.equal(summary.unselected, 0);
  assert.equal(summary.frozenReadable, 1);
  assert.equal(isUnselectedBookAnalysisSection(mixed.sections[0]), false);
  assert.equal(result.tone, "warning");
});

test("a failed section with retained content is not described as a zero-size gap", () => {
  const retained = analysis({
    sections: [section({ status: "failed", aiContent: "上一次保留的结果", frozen: false })],
  });
  const result = resolveBookAnalysisNextAction({ analysis: retained, analysesCount: 1 });
  assert.equal(result.action, "view_results");
  assert.match(result.description, /1 个小节最近一次生成失败/);
  assert.doesNotMatch(result.description, /仍有 0 个|0 个小节可通过重新生成补齐/);
});
