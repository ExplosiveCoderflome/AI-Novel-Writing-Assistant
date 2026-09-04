const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildProviderModelHeaders,
  filterHiddenModels,
  parseHiddenModels,
  resolveModelsEndpoint,
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

test("model catalog does not append a duplicate models path", () => {
  assert.equal(
    resolveModelsEndpoint("https://generativelanguage.googleapis.com/v1beta/openai"),
    "https://generativelanguage.googleapis.com/v1beta/openai/models",
  );
  assert.equal(
    resolveModelsEndpoint("https://generativelanguage.googleapis.com/v1beta/openai/models"),
    "https://generativelanguage.googleapis.com/v1beta/openai/models",
  );
  assert.equal(
    resolveModelsEndpoint("http://127.0.0.1:11434/v1/models/"),
    "http://127.0.0.1:11434/v1/models",
  );
});

test("custom model catalog uses the configured authentication header", () => {
  assert.deepEqual(buildProviderModelHeaders("custom_gateway", "secret", "bearer"), {
    Accept: "application/json",
    Authorization: "Bearer secret",
  });
  assert.deepEqual(buildProviderModelHeaders("custom_gateway", "secret", "x-api-key"), {
    Accept: "application/json",
    "x-api-key": "secret",
  });
  assert.deepEqual(buildProviderModelHeaders("custom_gateway", "secret", "none"), {
    Accept: "application/json",
  });
});
