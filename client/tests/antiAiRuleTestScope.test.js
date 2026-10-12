import test from "node:test";
import assert from "node:assert/strict";
import { countTestRules } from "../src/pages/antiAiRules/antiAiRulesPage.shared.ts";

test("temporarily testing a global or style-bound rule does not double-count it", () => {
  assert.equal(countTestRules(["global", "style"], ["global", "style", "extra"]), 3);
});

test("test counts include distinct preview rules and handle empty scopes", () => {
  assert.equal(countTestRules([], []), 0);
  assert.equal(countTestRules(["global"], []), 1);
  assert.equal(countTestRules([], ["preview", "preview"]), 1);
  assert.equal(countTestRules(["global"], ["preview"]), 2);
});
