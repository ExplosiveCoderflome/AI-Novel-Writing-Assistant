const test = require("node:test");
const assert = require("node:assert/strict");
const { createProviderModelLimiter } = require("../dist/llm/requestLimiter.js");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("provider model limiter serializes calls when concurrency limit is one", async () => {
  const limiter = createProviderModelLimiter({
    provider: "openai",
    model: "glm-5",
    concurrencyLimit: 1,
    requestIntervalMs: 0,
  });
  let active = 0;
  let maxActive = 0;

  await Promise.all([
    limiter.run(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await wait(20);
      active -= 1;
    }),
    limiter.run(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await wait(20);
      active -= 1;
    }),
  ]);

  assert.equal(maxActive, 1);
});

test("provider model limiter spaces starts by the configured interval", async () => {
  const limiter = createProviderModelLimiter({
    provider: "openai",
    model: "glm-5",
    concurrencyLimit: 0,
    requestIntervalMs: 30,
  });
  const starts = [];

  await Promise.all([
    limiter.run(async () => {
      starts.push(Date.now());
    }),
    limiter.run(async () => {
      starts.push(Date.now());
    }),
  ]);

  starts.sort((a, b) => a - b);
  assert.ok(starts[1] - starts[0] >= 25, `expected >=25ms gap, got ${starts[1] - starts[0]}ms`);
});
