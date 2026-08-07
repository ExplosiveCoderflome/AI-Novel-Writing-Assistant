import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

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

test("short story studio keeps internal production language out of the primary reading surface", () => {
  assert.match(storySource, /完整成稿/);
  assert.match(storySource, /直接编辑/);
  assert.match(storySource, /继续生成/);
  assert.doesNotMatch(storySource, />checkpoint<|>replan_required<|>short_story_draft</);
});
