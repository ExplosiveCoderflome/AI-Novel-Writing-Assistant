import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appLayout = readFileSync("client/src/components/layout/AppLayout.tsx", "utf8");
const css = readFileSync("client/src/index.css", "utf8");
const mobileSiteNavigation = readFileSync("client/src/components/layout/mobile/mobileSiteNavigation.ts", "utf8");

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

test("mobile CSS enforces the no deep card nesting rule", () => {
  assert.match(css, /mobile-site-main[\s\S]+rounded-xl\.border\.bg-card \.rounded-xl\.border\.bg-card \.rounded-xl\.border\.bg-card/);
  assert.match(css, /border-width: 0;/);
});
