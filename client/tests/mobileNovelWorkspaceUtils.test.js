import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMobileNovelWorkspaceSteps,
  getMobileNovelWorkspaceStatusText,
} from "../src/pages/novels/mobile/mobileNovelWorkspaceUtils.ts";

const stepDefinitions = [
  { key: "basic", label: "项目设定" },
  { key: "structured", label: "节奏 / 拆章" },
  { key: "chapter", label: "章节执行" },
  { key: "history", label: "版本历史" },
];

test("buildMobileNovelWorkspaceSteps marks active and recommended steps", () => {
  const steps = buildMobileNovelWorkspaceSteps({
    activeTab: "chapter",
    workflowCurrentTab: "structured",
    steps: stepDefinitions,
  });

  const activeStep = steps.find((step) => step.key === "chapter");
  const recommendedStep = steps.find((step) => step.key === "structured");
  const historyStep = steps.find((step) => step.key === "history");

  assert.equal(activeStep?.isActive, true);
  assert.equal(activeStep?.isRecommended, false);
  assert.equal(recommendedStep?.isRecommended, true);
  assert.equal(historyStep?.label, "版本历史");
});

test("getMobileNovelWorkspaceStatusText explains current and recommended steps", () => {
  assert.equal(
    getMobileNovelWorkspaceStatusText({ activeLabel: "章节执行", workflowLabel: "节奏 / 拆章" }),
    "当前在章节执行，AI 建议继续节奏 / 拆章。",
  );
  assert.equal(
    getMobileNovelWorkspaceStatusText({ activeLabel: "章节执行", workflowLabel: "章节执行" }),
    "当前在章节执行。",
  );
});
