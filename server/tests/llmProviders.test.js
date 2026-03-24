const test = require("node:test");
const assert = require("node:assert/strict");
const { PROVIDERS, SUPPORTED_PROVIDERS } = require("../dist/llm/providers.js");
const { getJsonCapability } = require("../dist/llm/capabilities.js");

test("supported providers include kimi, glm, qwen and gemini", () => {
  for (const provider of ["kimi", "glm", "qwen", "gemini"]) {
    assert.ok(SUPPORTED_PROVIDERS.includes(provider), `${provider} should be available`);
  }
});

test("new provider defaults are present in their model fallback lists", () => {
  for (const provider of ["kimi", "glm", "qwen", "gemini"]) {
    assert.ok(
      PROVIDERS[provider].models.includes(PROVIDERS[provider].defaultModel),
      `${provider} default model should exist in fallback models`,
    );
  }
});

test("kimi thinking models do not enable forced json mode", () => {
  const stableCapability = getJsonCapability("kimi", "moonshot-v1-32k");
  assert.equal(stableCapability.supportsJsonObject, true);

  const thinkingCapability = getJsonCapability("kimi", "kimi-k2-thinking-turbo");
  assert.equal(thinkingCapability.supportsJsonObject, false);
});
