import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appLayout = readFileSync("client/src/components/layout/AppLayout.tsx", "utf8");
const css = readFileSync("client/src/index.css", "utf8");
const mobileSiteNavigation = readFileSync("client/src/components/layout/mobile/mobileSiteNavigation.ts", "utf8");
const novelEditView = readFileSync("client/src/pages/novels/components/NovelEditView.tsx", "utf8");
const homePage = readFileSync("client/src/pages/Home.tsx", "utf8");
const taskCenterPage = readFileSync("client/src/pages/tasks/TaskCenterPage.tsx", "utf8");
const structuredOutlineWorkspace = readFileSync("client/src/pages/novels/components/StructuredOutlineWorkspace.tsx", "utf8");
const structuredChapterListCard = readFileSync("client/src/pages/novels/components/StructuredChapterListCard.tsx", "utf8");
const mobileNovelEditView = readFileSync("client/src/pages/novels/mobile/MobileNovelEditView.tsx", "utf8");
const mobileNovelStepNav = readFileSync("client/src/pages/novels/mobile/MobileNovelStepNav.tsx", "utf8");
const mobileAutoDirectorStatusCard = readFileSync("client/src/pages/novels/mobile/MobileAutoDirectorStatusCard.tsx", "utf8");
const mobileFloatingSaveButton = readFileSync("client/src/pages/novels/mobile/MobileFloatingSaveButton.tsx", "utf8");

function getMobileRouteKeys() {
  const routeBlock = mobileSiteNavigation.match(/export const MOBILE_ROUTE_PATTERNS[\s\S]*?\n\];/)?.[0] ?? "";
  return Array.from(routeBlock.matchAll(/key: "([^"]+)"/g), (match) => match[1]);
}

test("mobile AppLayout uses the site shell for phone entry routes", () => {
  assert.match(appLayout, /useIsMobileViewport/);
  assert.match(appLayout, /MobileSiteShell/);
  assert.match(appLayout, /useMobileSiteLayout/);
  assert.match(appLayout, /useMobileNovelWorkspaceLayout/);
});

test("every routed page has a route-specific mobile CSS landing point", () => {
  for (const routeKey of getMobileRouteKeys()) {
    assert.match(
      css,
      new RegExp(`\\.mobile-route-${routeKey}(?:[\\s,.>{:#\\[])`),
      `${routeKey} should have a mobile route selector`,
    );
  }
});

test("mobile home status metrics stay compact in a single four-column row", () => {
  assert.match(homePage, /home-status-summary-grid/);
  assert.match(
    css,
    /mobile-route-home \.home-status-summary-grid[\s\S]+grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/,
    "home status metrics should use one compact four-column grid on phone width",
  );
  assert.match(
    css,
    /mobile-route-home \.home-status-summary-grid \.text-xs[\s\S]+display: none;/,
    "home status metric hints should be hidden on phone width",
  );
  assert.match(
    css,
    /mobile-route-home \.home-status-summary-grid h3[\s\S]+font-size: 1rem;/,
    "home status metric values should be reduced for a four-column mobile row",
  );
  assert.match(
    css,
    /mobile-route-home \.home-status-summary-grid > \.rounded-xl[\s\S]+box-shadow: none;/,
    "home status cards should read as compact status partitions instead of heavy mobile cards",
  );
});

test("mobile task status metrics use follow-up style compact partitions", () => {
  assert.match(taskCenterPage, /task-status-summary-grid/);
  assert.match(
    css,
    /mobile-route-tasks \.task-status-summary-grid[\s\S]+grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/,
    "task status metrics should share one compact four-column grid on phone width",
  );
  assert.match(
    css,
    /mobile-route-tasks \.task-status-summary-grid > \.rounded-xl[\s\S]+box-shadow: none;/,
    "task status cards should read as compact status partitions instead of separate tall cards",
  );
  assert.match(
    css,
    /mobile-route-tasks \.task-status-summary-grid h3[\s\S]+font-size: 1rem;/,
    "task status metric labels should be reduced for a compact mobile row",
  );
  assert.match(
    css,
    /mobile-route-tasks \.task-status-summary-grid \.text-2xl[\s\S]+font-size: 1rem;/,
    "task status metric values should be reduced for a compact mobile row",
  );
});

test("mobile follow-up overview combines summary and section filters in one compact card", () => {
  assert.match(
    css,
    /mobile-route-auto-director-follow-ups \.auto-director-follow-up-overview-card[\s\S]+padding: 0.75rem;/,
    "follow-up overview card should use compact mobile padding",
  );
  assert.match(
    css,
    /mobile-route-auto-director-follow-ups \.auto-director-follow-up-section-grid\.grid[\s\S]+grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/,
    "follow-up section filters should share one compact grid on phone width",
  );
  assert.match(
    css,
    /mobile-route-auto-director-follow-ups \.auto-director-follow-up-section-grid \.text-xs[\s\S]+display: none;/,
    "follow-up section descriptions should not consume mobile vertical space",
  );
});

test("mobile CSS enforces the no deep card nesting rule", () => {
  assert.match(css, /mobile-site-main[\s\S]+rounded-xl\.border\.bg-card \.rounded-xl\.border\.bg-card \.rounded-xl\.border\.bg-card/);
  assert.match(css, /border-width: 0;/);
});

test("novel edit page uses a dedicated mobile workspace instead of the desktop shell", () => {
  assert.match(novelEditView, /useIsMobileViewport/);
  assert.match(novelEditView, /<MobileNovelEditView \{\.\.\.props\} \/>/);
  assert.match(mobileNovelEditView, /mobile-page-novel-edit/);
  assert.match(mobileNovelEditView, /mobile-novel-workspace-header/);
  assert.match(mobileNovelEditView, /MobileNovelStepNav/);
  assert.match(mobileNovelEditView, /MobileAutoDirectorStatusCard/);
});

test("mobile novel workspace keeps step navigation horizontal and recommendation-aware", () => {
  assert.match(mobileNovelStepNav, /NOVEL_WORKSPACE_FLOW_STEPS/);
  assert.match(mobileNovelStepNav, /NOVEL_WORKSPACE_TOOL_TABS/);
  assert.match(mobileNovelStepNav, /mobile-novel-step-nav/);
  assert.match(mobileNovelStepNav, /overflow-x-auto/);
  assert.match(mobileNovelStepNav, /流程推荐/);
  assert.match(mobileNovelStepNav, /aria-current/);
});

test("mobile novel workspace collapses secondary tools behind one compact entry", () => {
  assert.match(mobileNovelEditView, /MoreHorizontal/);
  assert.match(mobileNovelEditView, /创作工具/);
  assert.match(mobileNovelEditView, /查看任务进度/);
  assert.match(mobileNovelEditView, /导出当前步骤/);
  assert.match(mobileNovelEditView, /导出整本书/);
  assert.doesNotMatch(mobileNovelEditView, /<AITakeoverContainer/);
});

test("mobile novel workspace has compact takeover status and reachable save action", () => {
  assert.match(mobileAutoDirectorStatusCard, /mobile-auto-director-status-card/);
  assert.match(mobileAutoDirectorStatusCard, /WorkflowProgressBar/);
  assert.match(mobileAutoDirectorStatusCard, /takeover\.actions/);
  assert.match(mobileFloatingSaveButton, /mobile-floating-save-button/);
  assert.match(mobileFloatingSaveButton, /bottom:\s*"max\(1rem, env\(safe-area-inset-bottom\)\)"/);
  assert.match(mobileNovelEditView, /MobileFloatingSaveButton/);
});

test("mobile novel edit CSS prevents overflow and keeps the workspace compact", () => {
  assert.match(css, /mobile-page-novel-edit \*/);
  assert.match(css, /mobile-novel-step-nav/);
  assert.match(css, /scrollbar-width: none;/);
  assert.match(css, /mobile-auto-director-status-card[\s\S]+padding: 0.75rem;/);
  assert.match(css, /mobile-floating-save-button/);
  assert.match(css, /mobile-novel-workspace-panel[\s\S]+overflow-x: hidden;/);
});

test("mobile structured outline avoids nested scroll inside volume and sync cards", () => {
  assert.match(structuredOutlineWorkspace, /structured-volume-picker/);
  assert.match(structuredOutlineWorkspace, /md:overflow-x-auto/);
  assert.doesNotMatch(
    structuredOutlineWorkspace,
    /className=\{cn\(\s*"min-w-\[220px\] shrink-0/,
    "volume cards should not force wide shrink-free cards on mobile",
  );
  assert.doesNotMatch(
    structuredOutlineWorkspace,
    /className="flex gap-3 overflow-x-auto/,
    "volume picker should not create unqualified horizontal card scrolling",
  );
  assert.match(structuredOutlineWorkspace, /structured-sync-preview-list/);
  assert.match(structuredOutlineWorkspace, /md:max-h-64/);
  assert.doesNotMatch(
    structuredOutlineWorkspace,
    /className="max-h-64[^"]*overflow-auto/,
    "sync preview should leave vertical scrolling to the mobile page",
  );
});

test("mobile structured chapter navigation leaves scrolling to the page", () => {
  assert.match(structuredChapterListCard, /structured-chapter-navigation-list/);
  assert.match(structuredChapterListCard, /xl:max-h-\[calc\(100vh-12rem\)\]/);
  assert.doesNotMatch(
    structuredChapterListCard,
    /className="max-h-\[560px\][^"]*overflow-y-auto/,
    "chapter navigation should not create a mobile-only internal scroll area",
  );
  assert.match(
    structuredChapterListCard,
    /className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"/,
    "beat group headers should stack on phone width before using horizontal layout",
  );
});
