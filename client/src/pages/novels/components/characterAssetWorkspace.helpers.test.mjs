import test from "node:test";
import assert from "node:assert/strict";

import { isProtagonistCharacter } from "./characterAssetWorkspace.helpers.ts";

test("structured cast roles override ambiguous role names when identifying the protagonist", () => {
  assert.equal(isProtagonistCharacter({ role: "女主", castRole: "protagonist" }), true);
  assert.equal(isProtagonistCharacter({ role: "男主", castRole: "love_interest" }), false);
  assert.equal(isProtagonistCharacter({ role: "原女主", castRole: "pressure_source" }), false);
  assert.equal(isProtagonistCharacter({ role: "女主丫鬟", castRole: "ally" }), false);
});

test("legacy characters without a cast role retain the textual protagonist fallback", () => {
  assert.equal(isProtagonistCharacter({ role: "女主", castRole: null }), true);
});
