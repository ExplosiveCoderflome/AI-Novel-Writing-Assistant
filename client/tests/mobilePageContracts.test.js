import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MOBILE_ROUTE_PATTERNS } from "../src/components/layout/mobile/mobileSiteNavigation.ts";

const css = readFileSync("client/src/index.css", "utf8");

test("every routed page has a route-specific mobile CSS landing point", () => {
  for (const route of MOBILE_ROUTE_PATTERNS) {
    assert.match(
      css,
      new RegExp(`\\.mobile-route-${route.key}(?:[\\s,.>{:#\\[])`),
      `${route.key} should have a mobile route selector`,
    );
  }
});

test("mobile CSS enforces the no deep card nesting rule", () => {
  assert.match(css, /mobile-site-main[\s\S]+rounded-xl\.border\.bg-card \.rounded-xl\.border\.bg-card \.rounded-xl\.border\.bg-card/);
  assert.match(css, /border-width: 0;/);
});
