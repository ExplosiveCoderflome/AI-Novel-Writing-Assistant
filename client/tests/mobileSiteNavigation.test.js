import test from "node:test";
import assert from "node:assert/strict";
import {
  MOBILE_ROUTE_PATTERNS,
  getMobileNavGroupForPath,
  getMobilePageTitle,
  getMobilePrimaryNavItems,
  getMobileMoreNavGroups,
  getMobileRouteClassName,
} from "../src/components/layout/mobile/mobileSiteNavigation.ts";

const routedPaths = [
  "/",
  "/novels",
  "/novels/create",
  "/novels/demo/edit",
  "/novels/demo/chapters/chapter-1",
  "/creative-hub",
  "/chat-legacy",
  "/book-analysis",
  "/tasks",
  "/auto-director/follow-ups",
  "/knowledge",
  "/genres",
  "/story-modes",
  "/titles",
  "/settings/model-routes",
  "/settings",
  "/worlds",
  "/worlds/generator",
  "/worlds/world-1/workspace",
  "/style-engine",
  "/base-characters",
];

test("mobile route metadata covers every registered page", () => {
  assert.equal(MOBILE_ROUTE_PATTERNS.length, routedPaths.length);

  for (const path of routedPaths) {
    assert.notEqual(getMobilePageTitle(path), "更多功能");
    assert.match(getMobileNavGroupForPath(path), /^(home|novels|creation|tasks|more)$/);
    assert.match(getMobileRouteClassName(path), /^mobile-route-[a-z0-9-]+$/);
  }
});

test("mobile primary nav keeps core beginner actions visible", () => {
  assert.deepEqual(
    getMobilePrimaryNavItems().map((item) => [item.key, item.to, item.label]),
    [
      ["home", "/", "首页"],
      ["novels", "/novels", "小说"],
      ["creation", "/creative-hub", "创作"],
      ["tasks", "/tasks", "任务"],
      ["more", "", "更多"],
    ],
  );
});

test("mobile more menu contains all non-primary registered pages", () => {
  const morePaths = getMobileMoreNavGroups().flatMap((group) => group.items.map((item) => item.to));

  assert.deepEqual(
    morePaths,
    [
      "/book-analysis",
      "/auto-director/follow-ups",
      "/chat-legacy",
      "/knowledge",
      "/genres",
      "/story-modes",
      "/titles",
      "/style-engine",
      "/base-characters",
      "/worlds",
      "/worlds/generator",
      "/settings/model-routes",
      "/settings",
    ],
  );
});
