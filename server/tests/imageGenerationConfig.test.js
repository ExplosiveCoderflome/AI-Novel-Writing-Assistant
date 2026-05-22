const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const modulePath = path.join(__dirname, "../dist/config/imageGeneration.js");

function clearModule() {
  delete require.cache[modulePath];
}

function loadModule() {
  clearModule();
  return require(modulePath);
}

function withEnv(overrides, run) {
  const previous = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }
  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const key of Object.keys(overrides)) {
        if (previous[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = previous[key];
        }
      }
      clearModule();
    });
}

test("image generation timeout defaults to 300 seconds", { concurrency: false }, async () => {
  await withEnv({
    LLM_REQUEST_TIMEOUT_MS: undefined,
    IMAGE_GENERATION_HTTP_TIMEOUT_MS: undefined,
  }, async () => {
    const { imageGenerationConfig } = loadModule();
    assert.equal(imageGenerationConfig.httpTimeoutMs, 300_000);
  });
});

test("image generation timeout honors explicit env override", { concurrency: false }, async () => {
  await withEnv({
    LLM_REQUEST_TIMEOUT_MS: undefined,
    IMAGE_GENERATION_HTTP_TIMEOUT_MS: "240000",
  }, async () => {
    const { imageGenerationConfig } = loadModule();
    assert.equal(imageGenerationConfig.httpTimeoutMs, 240_000);
  });
});

test("image generation timeout uses larger global timeout fallback when image override is unset", { concurrency: false }, async () => {
  await withEnv({
    LLM_REQUEST_TIMEOUT_MS: "300000",
    IMAGE_GENERATION_HTTP_TIMEOUT_MS: undefined,
  }, async () => {
    const { imageGenerationConfig } = loadModule();
    assert.equal(imageGenerationConfig.httpTimeoutMs, 300_000);
  });
});

test("image generation timeout clamps low explicit overrides", { concurrency: false }, async () => {
  await withEnv({
    LLM_REQUEST_TIMEOUT_MS: "300000",
    IMAGE_GENERATION_HTTP_TIMEOUT_MS: "1000",
  }, async () => {
    const { imageGenerationConfig } = loadModule();
    assert.equal(imageGenerationConfig.httpTimeoutMs, 30_000);
  });
});
