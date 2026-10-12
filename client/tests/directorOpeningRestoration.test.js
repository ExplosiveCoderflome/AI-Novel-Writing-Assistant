import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getCandidateTaskNovelHref } from "../src/lib/novelRoutes.ts";

const page = fs.readFileSync(new URL("../src/pages/novels/autoDirector/AutoDirectorCreatePage.tsx", import.meta.url), "utf8");

test("reopening an opening record reads its saved task without starting the frozen workflow", () => {
  const restore = page.slice(page.indexOf("const restoreWorkflowMutation ="), page.indexOf("const controller ="));
  assert.match(restore, /mutationFn: \(\) => getTaskDetail\("novel_workflow", normalizedTaskId\)/);
  assert.doesNotMatch(restore, /bootstrapNovelWorkflow/);
  assert.match(restore, /navigate\(novelHref, \{ replace: true \}\)/);
});

test("a handed-off opening record navigates to its new director even when it retains candidate history", () => {
  assert.equal(getCandidateTaskNovelHref({
    checkpointType: null,
    sourceResource: { type: "novel", id: "book" },
    resumeTarget: { route: "/lab/director/:novelId", novelId: "book" },
    meta: { seedPayload: { novelId: null }, candidateStage: "candidate_selection" },
  }), "/lab/director/book");
  assert.equal(getCandidateTaskNovelHref({ sourceResource: null, resumeTarget: null }), null);
});
