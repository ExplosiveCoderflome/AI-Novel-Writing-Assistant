const test = require("node:test");
const assert = require("node:assert/strict");
const {
  filterHiddenModels,
  parseHiddenModels,
  serializeHiddenModels,
} = require("../dist/llm/modelCatalog.js");

test("hidden model storage trims and deduplicates model ids", () => {
  const stored = serializeHiddenModels([" model-a ", "model-b", "model-a", ""]);
  assert.equal(stored, '["model-a","model-b"]');
  assert.deepEqual(parseHiddenModels(stored), ["model-a", "model-b"]);
});

test("invalid hidden model storage is treated as empty", () => {
  assert.deepEqual(parseHiddenModels("not-json"), []);
  assert.deepEqual(parseHiddenModels('{"model":"model-a"}'), []);
});

test("hidden models are filtered while the selected model remains available", () => {
  assert.deepEqual(
    filterHiddenModels(["model-a", "model-b", "model-c"], ["model-a", "model-b"], "model-a"),
    ["model-a", "model-c"],
  );
});
