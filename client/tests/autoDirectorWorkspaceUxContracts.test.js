import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getNovelWorkspaceHref } from "../src/lib/novelRoutes.ts";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const progressPanel = read("../src/pages/novels/components/NovelAutoDirectorProgressPanel.tsx");
const shelfPage = read("../src/pages/novels/simpleCreation/SimpleNovelShelfPage.tsx");
const journey = read("../src/pages/novels/components/NovelDirectorPreparationJourney.tsx");
const createPage = read("../src/pages/novels/autoDirector/AutoDirectorCreatePage.tsx");
const candidateStage = read("../src/pages/novels/autoDirector/StageCandidates.tsx");
const basicSetupStage = read("../src/pages/novels/autoDirector/StageBasicSetup.tsx");
const basicInfo = read("../src/pages/novels/novelBasicInfo.shared.ts");
const directorRequest = read("../src/pages/novels/components/NovelAutoDirectorDialog.shared.ts");
const experienceHandoff = read("../src/pages/novels/components/NovelProductionExperienceHandoff.tsx");

test("workspace routing follows the persisted novel experience without a redirect bounce", () => {
  assert.equal(getNovelWorkspaceHref({
    id: "book",
    creationExperience: "professional",
    latestAutoDirectorTask: { productionExperience: "simple" },
  }), "/novels/book/edit");
  assert.equal(getNovelWorkspaceHref({
    id: "book",
    creationExperience: "simple",
    latestAutoDirectorTask: { productionExperience: "professional" },
  }), "/novels/book/simple");
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

test("candidate recovery and task changes keep the experience choice on the page until selection succeeds", () => {
  assert.equal((createPage.match(/getCandidateTaskNovelHref\(/g) ?? []).length, 2);
  assert.match(createPage, /const novelHref = getCandidateTaskNovelHref\(task\);[\s\S]*?if \(novelHref\) \{\s*navigate\(novelHref, \{ replace: true \}\);/);
  assert.match(createPage, /const novelHref = getCandidateTaskNovelHref\(controller\.directorTask \?\? restoredWorkflowTask\);[\s\S]*?if \(novelHref\) \{\s*navigate\(novelHref, \{ replace: true \}\);/);
  assert.match(experienceHandoff, /onSuccess: async \(response\) =>/);
  assert.match(experienceHandoff, /navigate\(getTaskSourceHref\(response\.targetRoute\), \{ replace: true \}\)/);
});

test("director basic setup offers an AI-recommended optional power system", () => {
  assert.match(basicSetupStage, />战力体系<\/FieldLabel>/);
  assert.match(basicSetupStage, /POWER_SYSTEM_OPTIONS/);
  assert.match(basicInfo, /powerSystemPreference: "ai_recommend"/);
  assert.match(basicInfo, /value: "none"/);
  assert.match(basicInfo, /value: "soft"/);
  assert.match(basicInfo, /value: "ranked"/);
  assert.match(basicInfo, /不需要时不会生成等级，也不会强行安排升级剧情/);
  assert.match(directorRequest, /powerSystemPreference: basicForm\.powerSystemPreference/);
});
