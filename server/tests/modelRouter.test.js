const test = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../dist/db/prisma.js");
const { resolveModel } = require("../dist/llm/modelRouter.js");

test("resolveModel clamps DeepSeek route maxTokens to the provider limit", async () => {
  const originalFindUnique = prisma.modelRouteConfig.findUnique;

  prisma.modelRouteConfig.findUnique = async () => ({
    taskType: "planner",
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.3,
    maxTokens: 32768,
  });

  try {
    const resolved = await resolveModel("planner");
    assert.equal(resolved.provider, "deepseek");
    assert.equal(resolved.model, "deepseek-chat");
    assert.equal(resolved.temperature, 0.3);
    assert.equal(resolved.maxTokens, 8192);
  } finally {
    prisma.modelRouteConfig.findUnique = originalFindUnique;
  }
});

test("resolveModel clamps explicit DeepSeek overrides as well", async () => {
  const originalFindUnique = prisma.modelRouteConfig.findUnique;

  prisma.modelRouteConfig.findUnique = async () => null;

  try {
    const resolved = await resolveModel("planner", {
      provider: "deepseek",
      model: "deepseek-chat",
      maxTokens: 12000,
    });
    assert.equal(resolved.provider, "deepseek");
    assert.equal(resolved.model, "deepseek-chat");
    assert.equal(resolved.maxTokens, 8192);
  } finally {
    prisma.modelRouteConfig.findUnique = originalFindUnique;
  }
});

test("resolveModel treats legacy 4096 maxTokens as unset", async () => {
  const originalFindUnique = prisma.modelRouteConfig.findUnique;

  prisma.modelRouteConfig.findUnique = async () => ({
    taskType: "planner",
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.3,
    maxTokens: 4096,
  });

  try {
    const resolved = await resolveModel("planner");
    assert.equal(resolved.provider, "deepseek");
    assert.equal(resolved.model, "deepseek-chat");
    assert.equal(resolved.temperature, 0.3);
    assert.equal(resolved.maxTokens, undefined);
  } finally {
    prisma.modelRouteConfig.findUnique = originalFindUnique;
  }
});
