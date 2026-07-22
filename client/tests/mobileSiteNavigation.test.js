import test from "node:test";
import assert from "node:assert/strict";
import i18next from "i18next";

// Initialize i18next directly for test context with required zh translations
i18next.init({
  lng: "zh",
  resources: {
    zh: {
      translation: {
        "gen.components.layout.mobile.mobileSiteNavigation.gen_db1c89e0": "首页",
        "gen.components.layout.mobile.mobileSiteNavigation.gen_1fb52965": "小说",
        "gen.components.layout.mobile.mobileSiteNavigation.gen_93d695ff": "创作",
        "gen.components.layout.mobile.mobileSiteNavigation.task": "任务",
        "gen.components.layout.mobile.mobileSiteNavigation.gen_0ec9eaf9": "更多",
      },
    },
  },
});

// Dynamic import ensures i18next is fully initialized before module-level constants translate
const {
  MOBILE_ROUTE_PATTERNS,
  getMobileNavGroupForPath,
  getMobilePageTitle,
  getMobilePrimaryNavItems,
  getMobileMoreNavGroups,
  getMobileRouteClassName,
} = await import("../src/components/layout/mobile/mobileSiteNavigation.ts");

const routedPaths = [
  "/",
  "/help",
  "/novels",
  "/novels/create",
  "/novels/demo/preview",
  "/novels/demo/edit",
  "/novels/demo/chapters/chapter-1",
  "/multimedia",
  "/creative-hub",
  "/chat-legacy",
  "/book-analysis",
  "/tasks",
  "/auto-director/follow-ups",
  "/knowledge",
  "/genres",
  "/story-modes",
  "/titles",
  "/prompt-workbench",
  "/settings/model-routes",
  "/settings",
  "/worlds",
  "/worlds/generator",
  "/worlds/world-1/workspace",
  "/style-engine",
  "/anti-ai-rules",
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
      "/help",
      "/multimedia",
      "/book-analysis",
      "/auto-director/follow-ups",
      "/chat-legacy",
      "/knowledge",
      "/genres",
      "/story-modes",
      "/titles",
      "/style-engine",
      "/anti-ai-rules",
      "/base-characters",
      "/worlds",
      "/worlds/generator",
      "/prompt-workbench",
      "/settings/model-routes",
      "/settings",
    ],
  );
});
