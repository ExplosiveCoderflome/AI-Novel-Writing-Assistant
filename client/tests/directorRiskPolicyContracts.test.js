import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("director risk policy client uses dedicated global and novel endpoints with safe defaults", () => {
  const api = read("src/api/directorRiskPolicy.ts");
  const keys = read("src/api/queryKeys.ts");

  assert.match(api, /DEFAULT_DIRECTOR_RISK_POLICY/);
  assert.match(api, /SHARED_DEFAULT_DIRECTOR_RISK_POLICY/);
  assert.match(api, /shared\/types\/directorRisk/);
  assert.match(api, /\/settings\/auto-director\/risk-policy/);
  assert.match(api, /\/novels\/\$\{novelId\}\/auto-director\/risk-policy/);
  assert.match(api, /isDirectorRiskPolicyEndpointUnavailable/);
  assert.match(keys, /autoDirectorRiskPolicy/);
  assert.match(keys, /directorRiskPolicy/);
});

test("risk-policy controls are available globally and as a novel-level override", () => {
  const globalCard = read("src/pages/settings/AutoDirectorRiskPolicyCard.tsx");
  const novelCard = read("src/pages/novels/components/NovelDirectorRiskPolicyCard.tsx");
  const basicInfo = read("src/pages/novels/components/BasicInfoTab.tsx");
  const simpleIssuePanel = read("src/pages/novels/simpleCreation/SimpleCreationIssueGovernancePanel.tsx");

  assert.match(globalCard, /提醒分数/);
  assert.match(globalCard, /保护性暂停分数/);
  assert.match(globalCard, /max=\{7\}/);
  assert.match(globalCard, /max=\{8\}/);
  assert.match(novelCard, /为本书单独设置/);
  assert.match(novelCard, /saveNovelDirectorRiskPolicy/);
  assert.match(basicInfo, /NovelDirectorRiskPolicyCard/);
  assert.match(simpleIssuePanel, /问题管理/);
  assert.match(simpleIssuePanel, /NovelDirectorIssuePolicyCard/);
  assert.match(simpleIssuePanel, /recentIssues/);
});

test("new-book and takeover entrypoints disclose the effective risk rule", () => {
  const createPage = read("src/pages/novels/autoDirector/AutoDirectorCreatePage.tsx");
  const takeoverDialog = read("src/pages/novels/components/NovelExistingProjectTakeoverDialog.tsx");
  const summary = read("src/pages/novels/components/DirectorRiskPolicySummary.tsx");

  assert.match(createPage, /DirectorRiskPolicySummary/);
  assert.match(takeoverDialog, /getNovelDirectorRiskPolicy/);
  assert.match(takeoverDialog, /DirectorRiskPolicySummary/);
  assert.match(summary, /当前安全节点后暂停/);
});
