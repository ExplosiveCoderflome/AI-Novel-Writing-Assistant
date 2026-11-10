import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { QueryClient } from "@tanstack/react-query";
import { BOOK_ANALYSIS_PRESETS, BOOK_ANALYSIS_SECTIONS } from "@ai-novel/shared/types/bookAnalysis";
import { isReadableBookAnalysisSection } from "../src/pages/bookAnalysis/bookAnalysisWorkspaceViewModel.ts";

const routerSource = fs.readFileSync(new URL("../src/router/index.tsx", import.meta.url), "utf8");
const createSource = fs.readFileSync(
  new URL("../src/pages/creationStudio/CreationStudioPage.tsx", import.meta.url),
  "utf8",
);
const storySource = fs.readFileSync(
  new URL("../src/pages/shortStory/ShortStoryStudioPage.tsx", import.meta.url),
  "utf8",
);
const novelListHeaderSource = fs.readFileSync(
  new URL("../src/pages/novels/components/list/NovelListHeader.tsx", import.meta.url),
  "utf8",
);
const homeStarterSource = fs.readFileSync(
  new URL("../src/pages/home/components/HomeNextActionPanel.tsx", import.meta.url),
  "utf8",
);

test("creation and continuous story routes are public application routes", () => {
  assert.match(routerSource, /path: "create"/);
  assert.match(routerSource, /path: "novels\/:id\/story"/);
});

test("direction confirmation reuses a stable idempotency key", () => {
  assert.match(createSource, /idempotencyKey: `creation:\$\{taskId\}:\$\{selectedDirection\.id\}`/);
  assert.doesNotMatch(createSource, /randomUUID|Math\.random/);
});

test("short story entry sits beside auto director and explicitly prefers short form", () => {
  assert.match(novelListHeaderSource, /AI 自动导演开书|PRIMARY_CREATE_LABEL/);
  assert.match(novelListHeaderSource, /创作短篇/);
  assert.match(homeStarterSource, /自动导演写长篇/);
  assert.match(homeStarterSource, /创作一篇短篇/);
  assert.match(createSource, /preferredNarrativeForm: shortStoryEntry \? "short_story" : undefined/);
});

test("creation entry uses a focused editorial canvas instead of a stacked form card", () => {
  assert.match(createSource, /从一个念头，抵达完整短篇/);
  assert.match(createSource, /故事从哪里开始？/);
  assert.match(createSource, /生成创作方向/);
  assert.match(createSource, /aria-labelledby="creation-idea-heading"/);
  assert.match(createSource, /max-w-4xl/);
  assert.match(createSource, /min-h-\[180px\]/);
  assert.match(createSource, /目标平台/);
  assert.match(createSource, /writingPlatformPreference: initialPlatformPreference/);
  assert.match(createSource, /from "@\/components\/ui\/select"/);
  assert.match(createSource, /<SelectTrigger aria-label="选择目标平台"/);
  assert.doesNotMatch(createSource, /CardHeader|CardTitle/);
});

test("a ready reference can generate directions without an idea but original creation cannot", () => {
  assert.match(createSource, /const canGenerateWithoutIdea = referenceRequested && referenceSelectionReady/);
  assert.match(createSource, /disabled=\{\(!idea\.trim\(\) && !canGenerateWithoutIdea\)/);
  assert.match(createSource, /!referenceUnavailable && Boolean\(referenceGoal\.trim\(\)\) && referenceSections\.length > 0/);
  assert.match(createSource, /可不填脑洞，AI 会按参考目标生成原创短篇方向/);
});

test("short story studio keeps internal production language out of the primary reading surface", () => {
  assert.match(storySource, /完整成稿/);
  assert.match(storySource, /直接编辑/);
  assert.match(storySource, /继续生成/);
  assert.doesNotMatch(storySource, />checkpoint<|>replan_required<|>short_story_draft</);
});

function referenceSectionPredicate() {
  const match = createSource.match(/const availableReferenceSections = sourceAnalysis\?\.sections\.filter\(([\s\S]*?)\n  \) \?\? \[\];/);
  assert.ok(match, "reference options must share one availability predicate");
  return vm.runInNewContext(`(${match[1]})`, { isReadableBookAnalysisSection });
}

function interpretCallback(name, context) {
  const mutationStart = createSource.indexOf("const interpretMutation");
  const start = createSource.indexOf(`    ${name}:`, mutationStart);
  const end = createSource.indexOf(name === "onSuccess" ? "\n    onError:" : "\n  });", start);
  assert.ok(start >= 0 && end > start, `missing interpret ${name} callback`);
  const callback = createSource.slice(start, end)
    .replace(new RegExp(`^\\s*${name}: `), "")
    .replace(/,\s*$/, "");
  return vm.runInNewContext(`(${callback})`, context);
}

test("quick, standard and complete analyses default to exactly their readable generated sections", () => {
  const predicate = referenceSectionPredicate();
  for (const preset of BOOK_ANALYSIS_PRESETS) {
    const sections = BOOK_ANALYSIS_SECTIONS.map((section) => {
      const generated = preset.sectionKeys.includes(section.key);
      return {
        sectionKey: section.key,
        status: generated ? "succeeded" : "idle",
        frozen: !generated,
        aiContent: generated ? `${section.title}内容` : null,
        editedContent: null,
        structuredData: null,
      };
    });
    assert.deepEqual(
      sections.filter(predicate).map((section) => section.sectionKey),
      preset.sectionKeys,
      preset.key,
    );
  }
});

test("reference options retain readable frozen sections and reject empty or unavailable ones", () => {
  const predicate = referenceSectionPredicate();
  const base = { sectionKey: "timeline", editedContent: null, aiContent: null, structuredData: null };
  assert.equal(predicate({ ...base, status: "idle", frozen: true, editedContent: "保留的时间线" }), true);
  assert.equal(predicate({ ...base, status: "idle", frozen: true, structuredData: { timeNodes: [{ label: "开端" }] } }), true);
  assert.equal(predicate({ ...base, status: "idle", frozen: true }), false);
  assert.equal(predicate({ ...base, status: "failed", frozen: false, aiContent: "失败状态的内容" }), false);
  assert.match(createSource, /selectedKeys\.filter\(\(key\) => availableKeys\.has\(key\)\)/);
});

test("a successful same-task retry replaces the failed ApiResponse cache with readable directions", () => {
  const queryClient = new QueryClient();
  const queryKey = ["creation-studio", "task-1"];
  queryClient.setQueryData(queryKey, { success: true, data: { taskId: "task-1", status: "failed", interpretation: null } });
  const response = {
    success: true,
    data: {
      taskId: "task-1",
      status: "waiting_approval",
      interpretation: { directions: [{ id: "direction-1" }, { id: "direction-2" }] },
    },
  };
  let route;
  const onSuccess = interpretCallback("onSuccess", {
    queryClient,
    referenceRequested: true,
    setSearchParams: (params) => { route = params; },
    toast: { success() {}, error() {} },
  });
  onSuccess(response);
  assert.deepEqual(queryClient.getQueryData(queryKey), response);
  assert.equal(queryClient.getQueryData(queryKey).data.interpretation.directions[0].id, "direction-1");
  assert.equal(route.taskId, "task-1");
  queryClient.clear();
});

test("a failed same-task retry invalidates the existing task query", async () => {
  let invalidatedKey;
  const onError = interpretCallback("onError", {
    taskId: "task-1",
    queryClient: { invalidateQueries: async ({ queryKey }) => { invalidatedKey = queryKey; } },
    toast: { error() {} },
  });
  await onError(new Error("network unavailable"));
  assert.deepEqual(Array.from(invalidatedKey), ["creation-studio", "task-1"]);
});
