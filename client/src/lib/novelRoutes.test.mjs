import test from "node:test";
import assert from "node:assert/strict";

import {
  buildStructuredOutlineRoute,
  buildTaskNoticeRoute,
  getDirectorCockpitActionHref,
  getNovelWorkspaceHref,
} from "./novelRoutes.ts";

test("novel list links use only novel identity for each writing experience", () => {
  assert.equal(getNovelWorkspaceHref({ id: "book 1", narrativeForm: "novel", creationExperience: "professional", latestAutoDirectorTask: { id: "old" } }), "/novels/book%201/edit");
  assert.equal(getNovelWorkspaceHref({ id: "simple", narrativeForm: "novel", creationExperience: "simple" }), "/novels/simple/simple");
  assert.equal(getNovelWorkspaceHref({ id: "short", narrativeForm: "short_story", creationExperience: "professional" }), "/novels/short/story");
});

test("cockpit action cleans a server-provided novel link but keeps its navigation intent", () => {
  const projection = { novelId: "book", focusNovel: { href: "/novels/book/edit?directorTaskId=old" } };
  const action = { type: "open_details", target: { href: "/novels/book/edit?stage=chapter&directorTaskId=old&taskPanel=1&volumeId=v1" } };

  assert.equal(getDirectorCockpitActionHref(projection, action), "/novels/book/edit?stage=chapter&taskPanel=1&volumeId=v1");
  assert.equal(getDirectorCockpitActionHref(projection, { type: "open_novel", target: {} }), "/novels/book/edit");
});

test("cockpit action preserves candidate selection route before the book page takes over", () => {
  const projection = { novelId: "book", focusNovel: { href: "/novels/book/edit" } };
  const action = { type: "confirm_candidate", target: { href: "/novels/auto-director?taskId=candidate" } };

  assert.equal(getDirectorCockpitActionHref(projection, action), "/novels/auto-director?taskId=candidate");
});

test("cockpit fallback opens requested stage and details without task parameters", () => {
  const projection = { novelId: "book", focusNovel: { href: "/novels/book/edit" } };
  const action = { type: "open_details", target: { tab: "chapter", taskId: "old" } };

  assert.equal(getDirectorCockpitActionHref(projection, action), "/novels/book/edit?stage=chapter&taskPanel=1");
});

test("structured outline task notice links retain volume and stage but omit task identity", () => {
  const task = { id: "old", sourceResource: { type: "novel", id: "book" }, resumeTarget: { volumeId: "volume A" } };
  const notice = { action: { type: "open_structured_outline", volumeId: null } };

  assert.equal(buildStructuredOutlineRoute(task, "volume A"), "/novels/book/edit?stage=structured&volumeId=volume+A");
  assert.equal(buildTaskNoticeRoute(task, notice), "/novels/book/edit?stage=structured&volumeId=volume+A");
  assert.equal(buildTaskNoticeRoute({ ...task, sourceResource: { type: "chapter", id: "chapter" } }, notice), null);
});
