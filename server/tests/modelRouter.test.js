const test = require("node:test");
const assert = require("node:assert/strict");

const prismaModulePath = require.resolve("../dist/db/prisma.js");
require.cache[prismaModulePath] = {
  id: prismaModulePath,
  filename: prismaModulePath,
  loaded: true,
  exports: {
    prisma: {
      modelRouteConfig: {
        findUnique: async () => null,
        upsert: async () => null,
      },
    },
  },
};

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

test("resolveModel constrains true Anthropic provider routes to prompt JSON", async () => {
  const originalFindUnique = prisma.modelRouteConfig.findUnique;

  prisma.modelRouteConfig.findUnique = async () => ({
    taskType: "planner",
    provider: "anthropic",
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

test("resolveModel marks strict routes degraded when only default route is available", async () => {
  const originalFindUnique = prisma.modelRouteConfig.findUnique;

  prisma.modelRouteConfig.findUnique = async () => null;

  try {
    const resolved = await resolveModel("critical_review");
    assert.equal(resolved.routeKey, "critical_review");
    assert.equal(resolved.routeDegraded, true);
    assert.equal(resolved.temperature, 0.1);
  } finally {
    prisma.modelRouteConfig.findUnique = originalFindUnique;
  }
});

test("resolveModel keeps strict routes non-degraded when explicitly configured", async () => {
  const originalFindUnique = prisma.modelRouteConfig.findUnique;

  prisma.modelRouteConfig.findUnique = async () => ({
    taskType: "state_resolution",
    provider: "deepseek",
    model: "deepseek-reasoner",
    temperature: 0.1,
    maxTokens: null,
    requestProtocol: "auto",
    structuredResponseFormat: "auto",
  });

  try {
    const resolved = await resolveModel("state_resolution");
    assert.equal(resolved.routeKey, "state_resolution");
    assert.equal(resolved.routeDegraded, false);
    assert.equal(resolved.model, "deepseek-reasoner");
  } finally {
    prisma.modelRouteConfig.findUnique = originalFindUnique;
  }
});


test("resolveModel returns requestHeadersText and allows user override", async () => {
  const originalFindUnique = prisma.modelRouteConfig.findUnique;

  prisma.modelRouteConfig.findUnique = async () => ({
    taskType: "planner",
    provider: "openai",
    model: "glm-5",
    temperature: 0.3,
    maxTokens: null,
    requestProtocol: "openai_compatible",
    structuredResponseFormat: "json_object",
    requestHeadersText: "X-Test: 1",
  });

  try {
    const resolved = await resolveModel("planner");
    assert.equal(resolved.requestHeadersText, "X-Test: 1");

    const overrideKeeps = await resolveModel("planner", { provider: "openai" });
    assert.equal(overrideKeeps.requestHeadersText, "X-Test: 1");

    const overrideReplaces = await resolveModel("planner", { requestHeadersText: "X-Test: 2" });
    assert.equal(overrideReplaces.requestHeadersText, "X-Test: 2");
  } finally {
    prisma.modelRouteConfig.findUnique = originalFindUnique;
  }
});

test("resolveModel normalizes openai-compatible providers away from anthropic protocol", async () => {
  const originalFindUnique = prisma.modelRouteConfig.findUnique;

  prisma.modelRouteConfig.findUnique = async () => ({
    taskType: "planner",
    provider: "openai",
    model: "gpt-5.4",
    temperature: 0.7,
    maxTokens: null,
    requestProtocol: "anthropic",
    structuredResponseFormat: "prompt_json",
  });

  try {
    const resolved = await resolveModel("planner");
    assert.equal(resolved.provider, "openai");
    assert.equal(resolved.requestProtocol, "openai_compatible");
  } finally {
    prisma.modelRouteConfig.findUnique = originalFindUnique;
  }
});

test("resolveModel normalizes custom openai-compatible providers away from anthropic protocol", async () => {
  const originalFindUnique = prisma.modelRouteConfig.findUnique;

  prisma.modelRouteConfig.findUnique = async () => ({
    taskType: "planner",
    provider: "custom-openai-like",
    model: "gpt-5.4",
    temperature: 0.7,
    maxTokens: null,
    requestProtocol: "anthropic",
    structuredResponseFormat: "prompt_json",
  });

  try {
    const resolved = await resolveModel("planner");
    assert.equal(resolved.provider, "custom-openai-like");
    assert.equal(resolved.requestProtocol, "openai_compatible");
  } finally {
    prisma.modelRouteConfig.findUnique = originalFindUnique;
  }
});
