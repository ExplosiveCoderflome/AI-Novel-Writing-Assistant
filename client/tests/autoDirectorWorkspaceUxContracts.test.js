import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const listViewModel = read("../src/pages/novels/components/list/novelListViewModel.ts");
const progressPanel = read("../src/pages/novels/components/NovelAutoDirectorProgressPanel.tsx");
const shelfPage = read("../src/pages/novels/simpleCreation/SimpleNovelShelfPage.tsx");
const journey = read("../src/pages/novels/components/NovelDirectorPreparationJourney.tsx");
const createPage = read("../src/pages/novels/autoDirector/AutoDirectorCreatePage.tsx");
const candidateStage = read("../src/pages/novels/autoDirector/StageCandidates.tsx");

test("workspace routing follows the persisted novel experience without a redirect bounce", () => {
  assert.match(listViewModel, /novel\.creationExperience === "simple"/);
  assert.doesNotMatch(listViewModel, /latestAutoDirectorTask\?\.productionExperience === "simple"/);
});

test("director pages use the global live view and omit passive task-center actions", () => {
  assert.doesNotMatch(progressPanel, /LiveExecutionDialog/);
  assert.doesNotMatch(shelfPage, /LiveExecutionDialog/);
  assert.doesNotMatch(progressPanel, /稍后回来查看|查看执行详情|查看运行详情/);
});

test("preparation journey only reports viewable resources instead of decorative mode choices", () => {
  assert.match(journey, /已完成的成果可以直接查看/);
  assert.match(journey, /正文已生成 \$\{chapterProgress\.completed\}\/\$\{chapterProgress\.total\} 章/);
  assert.match(progressPanel, /director-preparation-\$\{onboardingNovelId\}/);
  assert.doesNotMatch(journey, /正文尚未开始生成|简易创作 · AI 写完整本书|专业创作 · 进入完整工作台/);
});

test("created projects offer both switchable creation modes", () => {
  assert.match(createPage, /简易模式/);
  assert.match(createPage, /专业模式/);
  assert.match(createPage, /setNovelCreationExperience\(createdNovelId, "simple"\)/);
  assert.match(createPage, /setNovelCreationExperience\(createdNovelId, "professional"\)/);
  assert.doesNotMatch(createPage, /selectNovelProductionExperience/);
});

test("a failed director task cannot be shown as a running dashboard", () => {
  assert.match(progressPanel, /const taskHasTerminalFailure = task\?\.status === "failed" \|\| task\?\.status === "cancelled"/);
  assert.match(progressPanel, /const dashboardViewForDisplay = taskHasTerminalFailure \? null : dashboardView/);
  assert.match(progressPanel, /const displayStateForDisplay = taskHasTerminalFailure \? null : displayState/);
  assert.match(progressPanel, /task\?\.checkpointSummary\?\.trim\(\)/);
});

test("candidate generation failures expose a quick retry on the current page", () => {
  assert.match(candidateStage, /quickRetryLabel="快速重试"/);
  assert.match(candidateStage, /controller\.continueMutation\.mutate\(\)/);
  assert.match(progressPanel, /visualMode === "execution_failed" \|\| task\?\.pendingManualRecovery/);
  assert.match(progressPanel, /isConfirmingAndContinuing \? "重试中\.\.\."/);
});
