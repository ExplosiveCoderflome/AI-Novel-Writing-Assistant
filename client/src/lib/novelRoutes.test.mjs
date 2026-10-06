import test from "node:test";
import assert from "node:assert/strict";

import * as routes from "./novelRoutes.ts";

const {
  buildCandidateTaskHref,
  buildStructuredOutlineRoute,
  buildTaskNoticeRoute,
  getDirectorCockpitActionHref,
  getNovelWorkspaceHref,
  readCandidateTaskId,
} = routes;

test("candidate task routes live with novel navigation helpers", () => {
  assert.equal(buildCandidateTaskHref("candidate 1"), "/novels/auto-director?taskId=candidate+1");
  assert.equal(buildCandidateTaskHref("candidate 1", new URLSearchParams("marketBriefId=brief")), "/novels/auto-director?marketBriefId=brief&taskId=candidate+1");
  assert.equal(readCandidateTaskId(new URLSearchParams("taskId=candidate+1")), "candidate 1");
});

test("original opening confirmation enters the new director through its explicit resume route",()=>{
 assert.equal(routes.getCandidateTaskNovelHref({resumeTarget:{novelId:'book 1',route:'/lab/director/:novelId'},sourceResource:null}),'/lab/director/book%201');
});

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

test("workspace navigation keeps stage and task panel intent without task identity", () => {
  assert.equal(routes.getNovelEditHref("book 1", { stage: "chapter", taskPanel: true }), "/novels/book%201/edit?stage=chapter&taskPanel=1");
});

test("task history opens a novel source page without its historical task selector", () => {
  assert.equal(routes.getTaskSourceHref("/novels/book/edit?stage=chapter&directorTaskId=old&taskPanel=1"), "/novels/book/edit?stage=chapter&taskPanel=1");
  assert.equal(routes.getTaskSourceHref("/novels/book/edit/chapter?directorTaskId=old&chapterId=c1"), "/novels/book/edit/chapter?chapterId=c1");
  assert.equal(routes.getTaskSourceHref("/novels/book/chapters/c1?workspaceTaskId=manual"), "/novels/book/chapters/c1");
  assert.equal(routes.getTaskSourceHref("/novels/auto-director?taskId=candidate"), "/novels/auto-director?taskId=candidate");
});

test("a candidate task moves to its novel workspace once the novel exists", () => {
  assert.equal(routes.getCandidateTaskNovelHref({ resumeTarget: { novelId: "book 1" }, sourceResource: null }), "/novels/book%201/edit");
  assert.equal(routes.getCandidateTaskNovelHref({ resumeTarget: null, sourceResource: { type: "novel", id: "book 2" } }), "/novels/book%202/edit");
  assert.equal(routes.getCandidateTaskNovelHref({ resumeTarget: null, sourceResource: null }), null);
});

test("a candidate task stays on the choice page until production experience is selected", () => {
  assert.equal(routes.getCandidateTaskNovelHref({
    checkpointType: "production_experience_required",
    resumeTarget: { novelId: "book awaiting choice" },
    sourceResource: { type: "novel", id: "book awaiting choice" },
  }), null);
});

test("production experience selection keeps its chosen workspace and saved location without task identity", () => {
  assert.equal(routes.getTaskSourceHref("/novels/book%201/simple?taskId=old&chapterId=chapter+1"), "/novels/book%201/simple?chapterId=chapter+1");
  assert.equal(routes.getTaskSourceHref("/novels/book%202/edit?directorTaskId=old&stage=chapter&volumeId=volume+1"), "/novels/book%202/edit?stage=chapter&volumeId=volume+1");
});

test("candidate redirect keeps its saved stage, chapter, and volume without task identity", () => {
  assert.equal(routes.getCandidateTaskNovelHref({
    resumeTarget: {
      route: "/novels/:id/edit",
      novelId: "book 1",
      taskId: "old",
      stage: "chapter",
      chapterId: "chapter A",
      volumeId: "volume + one",
    },
    sourceResource: null,
  }), "/novels/book%201/edit?stage=chapter&chapterId=chapter+A&volumeId=volume+%2B+one");
  assert.equal(routes.getCandidateTaskNovelHref({
    resumeTarget: {
      route: "/novels/:id/simple",
      novelId: "book 2",
      stage: "structured",
      volumeId: "volume 2",
    },
    sourceResource: null,
  }), "/novels/book%202/simple?stage=structured&volumeId=volume+2");
  assert.equal(routes.getCandidateTaskNovelHref({
    resumeTarget: { route: "/novels/:id/story", novelId: "short", stage: "chapter", chapterId: "one" },
    sourceResource: null,
  }), "/novels/short/story");
});

test("task history source follows the novel when an old candidate link belongs to a book", () => {
  assert.equal(routes.getTaskHistorySourceHref({
    sourceRoute: "/novels/auto-director?taskId=old",
    sourceResource: { type: "novel", id: "book" },
    resumeTarget: null,
  }), "/novels/book/edit");
  assert.equal(routes.getTaskHistorySourceHref({
    sourceRoute: "/novels/auto-director?taskId=candidate",
    sourceResource: null,
    resumeTarget: null,
  }), "/novels/auto-director?taskId=candidate");
});
