import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const shelfSource = fs.readFileSync(
  new URL("../src/pages/novels/simpleCreation/SimpleNovelShelfPage.tsx", import.meta.url),
  "utf8",
);
const panelSource = fs.readFileSync(
  new URL("../src/pages/novels/simpleCreation/SimpleCreationIssueGovernancePanel.tsx", import.meta.url),
  "utf8",
);
const globalPolicySource = fs.readFileSync(
  new URL("../src/pages/settings/AutoDirectorIssuePolicyCard.tsx", import.meta.url),
  "utf8",
);
const issuePolicySource = fs.readFileSync(
  new URL("../../shared/types/directorIssue.ts", import.meta.url),
  "utf8",
);
const novelPolicySource = fs.readFileSync(
  new URL("../src/pages/novels/components/NovelDirectorIssuePolicyCard.tsx", import.meta.url),
  "utf8",
);

test("simple creation shelf exposes issue governance without professional conversion", () => {
  assert.match(shelfSource, /SimpleCreationIssueGovernancePanel/);
  assert.match(panelSource, /getNovelDirectorIssuePolicy/);
  assert.match(panelSource, /recentIssues/);
  assert.match(panelSource, /AI 问题处理/);
  assert.match(panelSource, /问题管理/);
  assert.match(panelSource, /NovelDirectorIssuePolicyCard/);
  assert.doesNotMatch(panelSource, /convertNovelToProfessional/);
});

test("simple creation shelf provides a preview shortcut for the current chapter", () => {
  assert.match(shelfSource, /进入预览模式/);
  assert.match(shelfSource, /\/novels\/\$\{id\}\/preview/);
  assert.match(shelfSource, /chapterId=\$\{encodeURIComponent\(selectedChapter\.id\)\}/);
});

test("simple creation shelf switches to professional mode without an irreversible conversion dialog", () => {
  assert.match(shelfSource, /setNovelCreationExperience\(id, "professional"\)/);
  assert.match(shelfSource, /专业模式/);
  assert.doesNotMatch(shelfSource, /此操作不能切回简易创作/);
});

test("all issue actions remain editable and changed rules show a safety warning", () => {
  assert.match(globalPolicySource, /DIRECTOR_ISSUE_ACTIONS\.map/);
  assert.doesNotMatch(globalPolicySource, /disabled=\{entry\.allowedActions\.length === 1\}/);
  assert.match(novelPolicySource, /const CONFIGURABLE_ISSUES = DIRECTOR_ISSUE_CATALOG;/);
  assert.doesNotMatch(novelPolicySource, /DIRECTOR_ISSUE_CATALOG\.filter/);
  for (const source of [globalPolicySource, novelPolicySource]) {
    assert.match(source, /你修改了/);
    assert.match(source, /hasChanges \? \(/);
    assert.match(source, /role="status"/);
    assert.match(source, /安全保护/);
  }
});

test("issue management exposes the two production presets with a single retry ceiling", () => {
  for (const source of [globalPolicySource, novelPolicySource]) {
    assert.match(source, /DIRECTOR_ISSUE_POLICY_PRESETS/);
    assert.match(source, /maxAutomaticRetries/);
    assert.match(source, /最多 1 次/);
  }
  assert.match(issuePolicySource, /优先完成整本书/);
  assert.match(issuePolicySource, /质量优先/);
  assert.match(novelPolicySource, /hasCompleteActionMap/);
  assert.match(novelPolicySource, /!hasCompleteActionMap \? <option value="">继承全局<\/option> : null/);
});
