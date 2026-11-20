require("./fixtures/compatibilitySettings.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_MODEL_OUTPUT_TOKENS } = require("@ai-novel/shared/types/llm");
const { prisma } = require("../dist/db/prisma.js");
const factory = require("../dist/llm/factory.js");
const modelRouter = require("../dist/llm/modelRouter.js");
const settings = require("../dist/llm/structuredFallbackSettings.js");
const { resolveCapability, saveCapability } = require("../dist/llm/compatibility/store.js");
const { setWorldGenerationTimeoutForTests } = require("../dist/services/settings/worldGeneration/timeoutSettings.js");
const { NovelWorldInstanceService } = require("../dist/services/novel/worldContext/NovelWorldInstanceService.js");
const { runNovelThemeWorldGeneration } = require("../dist/services/novel/worldContext/novelThemeWorldGeneration.js");

const provider = "custom_world_fixture";
const model = "flash-lite-fixture";
const alternateModel = "fallback-fixture";
class APIConnectionTimeoutError extends Error {}

const fullBudget = DEFAULT_MODEL_OUTPUT_TOKENS;
const selected = { provider, model, timeoutMs: 120_000 };
const promptInput = {
  novelTitle: "长夜提灯人", description: "灯塔守夜人寻找真相", targetAudience: "", bookSellingPoint: "",
  first30ChapterPromise: "", commercialTags: [], genreName: "", primaryStoryModeName: "", secondaryStoryModeName: "",
};
const world = {
  title: "雾港灯影", coverSummary: "靠灯塔维持航道的港城", worldType: "奇幻",
  structuredData: {
    profile: { summary: "雾港依靠灯塔维持航道" }, rules: { axioms: [{ id: "lamp", name: "长明灯" }] },
    factions: [], forces: [], locations: [], relations: {},
  },
};

function mockRequests(t, results, { routeMaxTokens, fallback = false, fallbackMaxTokens = null } = {}) {
  const calls = [];
  factory.setProviderSecretCache(provider, { key: "test-key", baseURL: "https://models.invalid/v1", model });
  t.after(() => factory.setProviderSecretCache(provider, null));
  t.mock.method(modelRouter, "resolveModel", async (routeKey, override = {}) => ({
    provider: override.provider ?? provider, model: override.model ?? model, temperature: 0.5,
    maxTokens: override.maxTokens ?? routeMaxTokens ?? DEFAULT_MODEL_OUTPUT_TOKENS, routeMaxTokens,
    requestProtocol: "openai_compatible", structuredResponseFormat: "prompt_json", routeKey,
  }));
  t.mock.method(settings, "getStructuredFallbackSettings", async () => ({
    enabled: fallback, provider, model: alternateModel, temperature: 0.2, maxTokens: fallbackMaxTokens,
    retryCount: 3,
  }));
  t.mock.method(factory, "createLLMFromResolvedOptions", options => ({
    stream: async function* () {
      calls.push(options);
      const result = results[calls.length - 1];
      assert.ok(result, "unexpected model request");
      if (result === "timeout") throw new APIConnectionTimeoutError("Request timed out.");
      if (result === "network") throw Object.assign(new Error("socket reset"), { code: "ECONNRESET" });
      if (result === "rate_limited") throw Object.assign(new Error("429 inference exceeds tpm/rpm limit"), { status: 429 });
      if (result === "success") {
        yield { content: JSON.stringify(world), response_metadata: { finish_reason: "stop" } };
      } else {
        const visibleTokens = result === "thinking" ? 0 : options.maxTokens;
        yield {
          content: result === "thinking" ? "" : '{"title":',
          additional_kwargs: result === "thinking" ? { reasoning_content: "仍在思考" } : {},
          response_metadata: { finish_reason: "length" },
          usage_metadata: { input_tokens: 300, output_tokens: visibleTokens, total_tokens: 300 + visibleTokens },
        };
      }
    },
  }));
  return calls;
}

test("retry after reasoning-only exhaustion saves and binds exactly one complete world", async t => {
  const calls = mockRequests(t, ["thinking", "success"]);
  setWorldGenerationTimeoutForTests(120_000);
  t.after(() => setWorldGenerationTimeoutForTests());
  const novel = await prisma.novel.create({ data: { title: promptInput.novelTitle, description: promptInput.description } });
  const result = await new NovelWorldInstanceService().generateFromNovelTheme({ novelId: novel.id, provider, model });
  assert.deepEqual(calls.map(call => [call.model, call.maxTokens, call.reasoningEnabled]), [
    [model, fullBudget, false], [model, fullBudget * 2, false],
  ]);
  assert.equal(result.novelWorld.title, world.title);
  assert.equal(result.novelWorld.hasStructuredData, true);
  assert.equal(await prisma.world.count({ where: { name: world.title } }), 1);
  const updated = await prisma.novel.findUnique({ where: { id: novel.id } });
  assert.equal(updated.worldId, result.novelWorld.sourceWorldId);
});

test("opening scope starts smaller and retries a timeout once using the configured wait", async t => {
  const calls = mockRequests(t, ["timeout", "success"]);
  const result = await runNovelThemeWorldGeneration({ ...promptInput, openingOnly: true }, selected);
  assert.equal(result.output.title, world.title);
  assert.deepEqual(calls.map(call => [call.maxTokens, call.timeoutMs]), [
    [12_000, selected.timeoutMs], [12_000, selected.timeoutMs],
  ]);
});

test("a timeout after a truncation retry reports the resolved model, wait and raised allowance without a third call", async t => {
  const calls = mockRequests(t, ["truncated", "timeout"]);
  await assert.rejects(runNovelThemeWorldGeneration(promptInput, { timeoutMs: 120_000 }), error => {
    assert.equal(error.statusCode, 504);
    assert.equal(error.category, "transport_error");
    assert.equal(error.details.sourceRoute, "/settings/models");
    assert.match(error.message, /flash-lite-fixture.*本次等待 [\d.]+ 秒.*32,768 Token.*模型与厂商/);
    return true;
  });
  assert.equal(calls.length, 2);
});

test("two timeouts leave the existing world binding unchanged", async t => {
  const calls = mockRequests(t, ["timeout", "timeout"]);
  const original = await prisma.world.create({ data: { name: "原有世界", worldType: "奇幻" } });
  const novel = await prisma.novel.create({ data: { title: "保留现有设定", worldId: original.id } });
  const worldCount = await prisma.world.count();
  await assert.rejects(
    new NovelWorldInstanceService().generateFromNovelTheme({ novelId: novel.id, provider, model }),
    /生成世界设定超时/,
  );
  assert.equal(calls.length, 2);
  assert.equal(await prisma.world.count(), worldCount);
  assert.equal((await prisma.novel.findUnique({ where: { id: novel.id } })).worldId, original.id);
});

test("legacy route settings below the world budget floor do not shrink either attempt", async t => {
  const calls = mockRequests(t, ["thinking", "success"], { routeMaxTokens: 3_200 });
  await runNovelThemeWorldGeneration({ ...promptInput, openingOnly: true }, selected);
  assert.deepEqual(calls.map(call => call.maxTokens), [12_000, 24_000]);
});

test("a route limit above the floor clamps the initial budget", async t => {
  const calls = mockRequests(t, ["success"], { routeMaxTokens: 14_000 });
  await runNovelThemeWorldGeneration(promptInput, selected);
  assert.deepEqual(calls.map(call => call.maxTokens), [14_000]);
});

test("a truncation retry stops at the route cap and reports the cap if it still fails", async t => {
  const calls = mockRequests(t, ["thinking", "thinking"], { routeMaxTokens: 20_000 });
  await assert.rejects(runNovelThemeWorldGeneration(promptInput, selected), error => {
    assert.equal(error.statusCode, 502);
    assert.equal(error.category, "reasoning_budget_exhausted");
    assert.equal(error.details.sourceRoute, "/settings/model-routes");
    assert.match(error.message, /20,000 Token.*大纲策划/);
    return true;
  });
  assert.deepEqual(calls.map(call => call.maxTokens), [fullBudget, 20_000]);
});

test("a configured fallback remains the only retry and reports its own model on failure", async t => {
  const calls = mockRequests(t, ["timeout", "timeout"], { fallback: true, fallbackMaxTokens: 22_000 });
  await assert.rejects(runNovelThemeWorldGeneration(promptInput, selected), /模型「fallback-fixture」生成世界设定超时.*22,000 Token/);
  assert.deepEqual(calls.map(call => call.model), [model, alternateModel]);
});

test("a rate limit reports the model and the requested allowance without a silent retry", async t => {
  const calls = mockRequests(t, ["rate_limited"]);
  await assert.rejects(runNovelThemeWorldGeneration(promptInput, selected), error => {
    assert.equal(error.statusCode, 429);
    assert.equal(error.category, "transport_error");
    assert.match(error.message, /模型「flash-lite-fixture」触发了限流（429）。本次实际申请上限为 16,384 Token/);
    return true;
  });
  assert.equal(calls.length, 1);
});

test("a network error is not treated as a timeout or output exhaustion", async t => {
  const calls = mockRequests(t, ["network"]);
  await assert.rejects(runNovelThemeWorldGeneration(promptInput, selected), error => {
    assert.equal(error.diagnostics.response.failureReason, "network");
    return true;
  });
  assert.equal(calls.length, 1);
});

test("a known endpoint capability below the application floor still caps the physical request", async t => {
  const calls = mockRequests(t, ["thinking"]);
  const identity = { provider, model, baseURL: "https://models.invalid/v1" };
  await saveCapability(identity, { ...resolveCapability(identity), source: "user_override", maxOutputTokens: 8_000 });
  await assert.rejects(runNovelThemeWorldGeneration(promptInput, selected), /8,000 Token.*模型兼容性/);
  assert.deepEqual(calls.map(call => call.maxTokens), [8_000]);
});
