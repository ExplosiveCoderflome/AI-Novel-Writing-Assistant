const test = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../dist/db/prisma.js");
const { resolveModel } = require("../dist/llm/modelRouter.js");

test("resolveModel preserves the user configured output allowance instead of a provider default ceiling", async () => {
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
    assert.equal(resolved.maxTokens, 32768);
  } finally {
    prisma.modelRouteConfig.findUnique = originalFindUnique;
  }
});

test("resolveModel honors an explicit per-request output allowance", async () => {
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
    assert.equal(resolved.maxTokens, 12000);
  } finally {
    prisma.modelRouteConfig.findUnique = originalFindUnique;
  }
});

test("resolveModel treats a saved 4096 value as the user's chosen allowance", async () => {
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
    assert.equal(resolved.maxTokens, 4096);
  } finally {
    prisma.modelRouteConfig.findUnique = originalFindUnique;
  }
});

test('empty output allowance has an editable 8192 default in execution and settings without writing',async()=>{
 const router=require('../dist/llm/modelRouter.js');
 const original={one:prisma.modelRouteConfig.findUnique,many:prisma.modelRouteConfig.findMany};
 const row={taskType:'writer',provider:'deepseek',model:'deepseek-flash',temperature:.7,maxTokens:null};
 prisma.modelRouteConfig.findUnique=async()=>row;prisma.modelRouteConfig.findMany=async()=>[row];
 try{
  assert.equal((await resolveModel('writer')).maxTokens,8192);
  assert.equal((await router.listModelRouteConfigs())[0].maxTokens,8192);
  prisma.modelRouteConfig.findUnique=async()=>null;assert.equal((await resolveModel('writer')).maxTokens,8192);
 }finally{prisma.modelRouteConfig.findUnique=original.one;prisma.modelRouteConfig.findMany=original.many;}
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
