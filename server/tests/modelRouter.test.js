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
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
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
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
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

test("resolveModel preserves route protocol and structured response format preferences", async () => {
  const originalFindUnique = prisma.modelRouteConfig.findUnique;

  prisma.modelRouteConfig.findUnique = async () => ({
    taskType: "planner",
    provider: "openai",
    model: "glm-5",
    temperature: 0.3,
    maxTokens: null,
    requestProtocol: "openai_compatible",
    structuredResponseFormat: "json_object",
  });

  try {
    const resolved = await resolveModel("planner");
    assert.equal(resolved.provider, "openai");
    assert.equal(resolved.model, "glm-5");
    assert.equal(resolved.requestProtocol, "openai_compatible");
    assert.equal(resolved.structuredResponseFormat, "json_object");
  } finally {
    prisma.modelRouteConfig.findUnique = originalFindUnique;
  }
});

test("resolveModel normalizes invalid protocol and structured response preferences to auto", async () => {
  const originalFindUnique = prisma.modelRouteConfig.findUnique;

  prisma.modelRouteConfig.findUnique = async () => ({
    taskType: "planner",
    provider: "openai",
    model: "glm-5",
    temperature: 0.3,
    maxTokens: null,
    requestProtocol: "bad-protocol",
    structuredResponseFormat: "bad-format",
  });

  try {
    const resolved = await resolveModel("planner");
    assert.equal(resolved.requestProtocol, "auto");
    assert.equal(resolved.structuredResponseFormat, "auto");
  } finally {
    prisma.modelRouteConfig.findUnique = originalFindUnique;
  }
});

test("resolveModel constrains Anthropic protocol routes to prompt JSON", async () => {
  const originalFindUnique = prisma.modelRouteConfig.findUnique;

  prisma.modelRouteConfig.findUnique = async () => ({
    taskType: "planner",
    provider: "openai",
    model: "claude-sonnet-4-5",
    temperature: 0.3,
    maxTokens: null,
    requestProtocol: "anthropic",
    structuredResponseFormat: "json_schema",
  });

  try {
    const resolved = await resolveModel("planner");
    assert.equal(resolved.requestProtocol, "anthropic");
    assert.equal(resolved.structuredResponseFormat, "prompt_json");
  } finally {
    prisma.modelRouteConfig.findUnique = originalFindUnique;
  }
});
