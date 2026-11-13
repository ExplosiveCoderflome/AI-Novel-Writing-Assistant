import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

test("A3 产品反馈面板使用既有合同，默认关闭，并在未绑定或移动端隐藏", async () => {
  const [flags, api, panel, workspace, list, wiki] = await Promise.all([
    read("../src/config/featureFlags.ts"),
    read("../src/api/outlines.ts"),
    read("../src/pages/outlines/OutlineFeedbackPanel.tsx"),
    read("../src/pages/outlines/OutlineWorkspacePage.tsx"),
    read("../src/pages/outlines/OutlineListPage.tsx"),
    read("../../docs/wiki/workflows/outline-text-feedback.md"),
  ]);

  assert.match(flags, /outlineFeedbackEnabled:\s*isEnabled\(import\.meta\.env\.VITE_OUTLINE_FEEDBACK_ENABLED,\s*false\)/);
  assert.match(api, /@ai-novel\/shared\/types\/outlineFeedback/);
  assert.match(api, /get\(`\/outlines\/\$\{id\}\/feedback`/);
  assert.match(api, /patch\(`\/outlines\/\$\{id\}\/feedback\/settings`/);
  assert.match(api, /post\(`\/outlines\/\$\{id\}\/feedback\/analyze`/);
  assert.match(api, /post\(`\/outlines\/\$\{id\}\/feedback\/\$\{runId\}\/retry`/);
  assert.match(api, /post\(`\/outlines\/\$\{id\}\/feedback\/\$\{runId\}\/adopt`/);
  assert.match(api, /post\(`\/outlines\/\$\{id\}\/feedback\/\$\{runId\}\/reject`/);
  assert.doesNotMatch(api, /export interface OutlineFeedbackStatus/);

  assert.match(panel, /shouldShowOutlineFeedbackPanel/);
  assert.match(panel, /flagEnabled && options\.bound && !options\.isMobile/);
  assert.match(panel, /adoptOutlineFeedback/);
  assert.match(panel, /rejectOutlineFeedback/);
  assert.match(panel, /getOutlineFeedbackStatus/);
  assert.match(panel, /采纳/);
  assert.match(panel, /拒绝/);
  assert.match(panel, /pending.*completed.*failed|RUN_STATUS_LABEL/);
assert.doesNotMatch(panel, /useEffect\([\s\S]{0,200}analyze\.mutate/);
  assert.doesNotMatch(panel, /useEffect\([\s\S]{0,200}adoptOutlineFeedback/);

  assert.match(workspace, /OutlineFeedbackPanel/);
  assert.match(workspace, /bound=\{\!\!bindingQuery\.data\}/);
  assert.match(list, /outlineFeedbackEnabled && !isMobileViewport && item\.boundNovelId/);
  assert.match(list, /#outline-feedback-panel/);

  assert.match(wiki, /VITE_OUTLINE_FEEDBACK_ENABLED/);
  assert.match(wiki, /默认关闭/);
  assert.doesNotMatch(wiki, /当前 `client\/` \*\*未交付\*\*/);
  assert.match(wiki, /不得用该页截图冒充反馈面板/);
});
