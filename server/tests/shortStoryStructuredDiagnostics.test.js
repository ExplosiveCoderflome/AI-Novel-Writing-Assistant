const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { initializeTemporarySqliteDatabase } = require("./testInfrastructure/tempSqliteDatabase.cjs");
const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "short-story-diagnostics-"));
process.env.DATABASE_URL = initializeTemporarySqliteDatabase(fixtureDir, "diagnostics.db");
process.env.AI_NOVEL_APP_DATA_DIR = fixtureDir;
process.env.NODE_ENV = "test";
const { z } = require("zod");
const { prisma } = require("../dist/db/prisma");
const factory = require("../dist/llm/factory");
const settings = require("../dist/llm/structuredFallbackSettings");
const { resolveStructuredOutputProfile } = require("../dist/llm/structuredOutput");
const { invokeStructuredLlmDetailed } = require("../dist/llm/structuredInvoke");
const originalResolve = factory.resolveLLMClientOptions;
const originalCreate = factory.createLLMFromResolvedOptions;
const originalSettings = settings.getStructuredFallbackSettings;
const originalGetLLM = factory.getLLM;
test.after(async () => {
  factory.resolveLLMClientOptions = originalResolve;
  factory.createLLMFromResolvedOptions = originalCreate;
  settings.getStructuredFallbackSettings = originalSettings;
  factory.getLLM = originalGetLLM;
  await prisma.$disconnect();
  assert.equal(path.dirname(fixtureDir), fs.realpathSync(os.tmpdir()));
  assert.ok(path.basename(fixtureDir).startsWith("short-story-diagnostics-"));
  fs.rmSync(fixtureDir, { recursive: true, force: true });
});

async function invoke(chunks, { fail, retries = 0, repair = 0, failOnce = false, repairChunks, repairError } = {}) {
  const task = await prisma.novelWorkflowTask.create({ data: { lane: "creation_studio", title: "离线诊断" } });
  let calls = 0;
  factory.resolveLLMClientOptions = async (provider, options = {}) => ({
    ...options, provider: provider ?? "deepseek", model: "offline-model",
    temperature: 0.3, requestProtocol: "openai_compatible",
    structuredProfile: resolveStructuredOutputProfile({ provider: "deepseek", model: "offline-model", executionMode: "structured" }),
  });
  factory.createLLMFromResolvedOptions = () => ({ stream: async function* () {
    calls++;
    if (fail && (!failOnce || calls === 1)) throw fail;
    for (const chunk of chunks) yield chunk;
  } });
  if (repairChunks || repairError) factory.getLLM = async () => ({ stream: async function* () {
    if (repairError) throw repairError;
    for (const chunk of repairChunks ?? []) yield chunk;
  } });
  settings.getStructuredFallbackSettings = async () => ({ enabled: false, provider: "deepseek", model: "", retryCount: retries });
  let result, error;
  try {
    result = await invokeStructuredLlmDetailed({
      provider: "deepseek", model: "offline-model", structuredStrategy: "prompt_json",
      label: "novel.short_story.plan@v2", schema: z.object({ value: z.string() }),
      systemPrompt: "只返回JSON", userPrompt: "测试内容不应进入诊断",
      maxRepairAttempts: repair, disableFallbackModel: false,
      promptMeta: { taskId: task.id, promptId: "novel.short_story.plan", promptVersion: "v2",
        stage: "short_story_plan", itemKey: "short_story_plan", entrypoint: "creation_studio" },
    });
  } catch (caught) { error = caught; }
  return { task, result, error, calls };
}

test("empty stop preserves observed finish reason and differs from a network failure", async () => {
  const { error } = await invoke([{ content: "", response_metadata: { finish_reason: "stop" } }]);
  assert.equal(error?.diagnostics?.response?.failureReason, "empty_response");
  assert.equal(error.diagnostics.response.finishReason, "stop");
});
test("reasoning-only length is diagnosed from response evidence rather than guessed as timeout", async () => {
  const { error } = await invoke([{ content: "", additional_kwargs: { reasoning_content: "推理示例" },
    response_metadata: { finish_reason: "length" }, usage_metadata: { input_tokens: 3, output_tokens: 10, total_tokens: 13 } }]);
  assert.equal(error?.diagnostics?.response?.failureReason, "reasoning_budget_exhausted");
  assert.equal(error.diagnostics.response.tokenUsage.totalTokens, 13);
});
test("explicit filtering is terminal even when transport retries are configured", async () => {
  const { error, calls } = await invoke([{ content: "", response_metadata: { finish_reason: "content_filter" } }], { retries: 2 });
  assert.equal(error?.diagnostics?.response?.failureReason, "blocked");
  assert.equal(calls, 1);
});

test("rate limiting keeps the provider code and wait instruction and never records message contents", async () => {
  const sdk = Object.assign(new Error("private novel paragraph and Bearer secret-key"), {
    status: 429, code: "rate_limit_exceeded", headers: { "retry-after": "120" },
  });
  const { task, error, calls } = await invoke([], { fail: sdk, retries: 2 });
  assert.equal(calls, 1, "long provider delay must not be shortened");
  assert.equal(error.cause, sdk);
  assert.equal(error.diagnostics.response.httpStatus, 429);
  assert.equal(error.diagnostics.response.failureReason, "rate_limited");
  assert.equal(error.diagnostics.response.retryAfterMs, 120000);
  const rows = await prisma.structuredInvocationDiagnostic.findMany({ where: { taskId: task.id } });
  assert.equal(rows.length, 1);
  assert.doesNotMatch(JSON.stringify(rows), /private novel|secret-key|Bearer|测试内容不应进入诊断/);
});

test("an explicitly transient network error retries within the configured bound and retains both attempts", async () => {
  const sdk = Object.assign(new Error("socket reset"), { code: "ECONNRESET" });
  const { task, result, calls } = await invoke([{ content: '{"value":"ok"}', response_metadata: { finish_reason: "stop" } }],
    { fail: sdk, retries: 1, failOnce: true });
  assert.equal(calls, 2);
  assert.equal(result.data.value, "ok");
  const rows = await prisma.structuredInvocationDiagnostic.findMany({ where: { taskId: task.id }, orderBy: { attempt: "asc" } });
  assert.equal(rows.length, 2);
  assert.equal(JSON.parse(rows[0].detailsJson).failureReason, "network");
  assert.equal(rows[1].status, "succeeded");
  assert.equal(rows[0].invocationId, rows[1].invocationId);
});

for (const [name, chunk, reason] of [
  ["truncated output", { content: '{"value":', response_metadata: { finish_reason: "length" } }, "output_budget_exhausted"],
  ["wrong JSON syntax", { content: "{bad-json}", response_metadata: { finish_reason: "stop" } }, "invalid_json"],
  ["missing required fields", { content: "{}", response_metadata: { finish_reason: "stop" } }, "schema_validation"],
]) test(name + " remains a failure and cannot produce a fake plan", async () => {
  const { error, result } = await invoke([chunk]);
  assert.equal(result, undefined);
  assert.equal(error?.diagnostics?.response?.failureReason, reason);
});

test("unknown upstream failure stays unknown instead of being labelled network timeout", async () => {
  const { error } = await invoke([], { fail: new Error("unclassified upstream failure") });
  assert.equal(error.diagnostics.response.failureReason, "unknown");
  assert.equal(error.diagnostics.response.httpStatus, null);
});

test("a valid structured response has a successful attempt with observed usage", async () => {
  const { task, result } = await invoke([{ content: '{"value":"ok"}',
    response_metadata: { finish_reason: "stop" }, usage_metadata: { input_tokens: 5, output_tokens: 4, total_tokens: 9 } }]);
  assert.equal(result.data.value, "ok");
  const row = await prisma.structuredInvocationDiagnostic.findFirst({ where: { taskId: task.id } });
  assert.equal(row.status, "succeeded");
  assert.equal(JSON.parse(row.detailsJson).tokenUsage.totalTokens, 9);
});

test("an SDK timeout keeps the observed cause and is not inferred from an empty reply", async () => {
  const sdk = new Error("timed out"); sdk.name = "TimeoutError";
  const { error } = await invoke([], { fail: sdk });
  assert.equal(error.diagnostics.response.failureReason, "timeout");
  assert.equal(error.cause, sdk);
  assert.equal(error.diagnostics.response.finishReason, null);
});

test("JSON repair requests have their own sanitized attempt and token evidence", async () => {
  const { task, result } = await invoke([{ content: "{bad-json}" }], { repair: 1,
    repairChunks: [{ content: '{"value":"fixed"}', usage_metadata: { input_tokens: 7, output_tokens: 5, total_tokens: 12 } }] });
  assert.equal(result.data.value, "fixed");
  const rows = await prisma.structuredInvocationDiagnostic.findMany({ where: { taskId: task.id }, orderBy: { attempt: "asc" } });
  assert.deepEqual(rows.map((row) => row.kind), ["generate", "repair"]);
  assert.equal(rows[0].invocationId, rows[1].invocationId);
  assert.equal(JSON.parse(rows[1].detailsJson).tokenUsage.totalTokens, 12);
  assert.equal(rows[1].status, "succeeded");
});

test("a failed repair preserves the original SDK status through parser and invocation wrapping", async () => {
  const sdk = Object.assign(new Error("limited"), { status: 429, code: "rate_limit", headers: { "retry-after": "120" } });
  const { error } = await invoke([{ content: "{bad-json}" }], { repair: 1, repairError: sdk });
  assert.equal(error.diagnostics.response.httpStatus, 429);
  assert.equal(error.diagnostics.response.failureReason, "rate_limited");
  assert.equal(error.cause, sdk);
});

test("business validation failure is recorded without storing the rejected story", async () => {
  const { task } = await invoke([{ content: '{"value":"valid-json"}' }]);
  const { runStructuredPrompt } = require("../dist/prompting/core/promptRunner");
  const { shortStoryPlanPrompt } = require("../dist/prompting/prompts/shortStory/shortStory.prompts");
  const { HumanMessage, SystemMessage } = require("@langchain/core/messages");
  await assert.rejects(runStructuredPrompt({
    asset: { ...shortStoryPlanPrompt, outputSchema: z.object({ value: z.string() }),
      repairPolicy: { maxAttempts: 0 }, semanticRetryPolicy: { maxAttempts: 0 },
      render: () => [new SystemMessage("只返回JSON"), new HumanMessage("private rejected story")],
      postValidate: () => { throw new Error("business rule failed"); } },
    promptInput: {}, options: { taskId: task.id, provider: "deepseek", model: "offline-model", stage: "short_story_plan", entrypoint: "creation_studio" },
  }));
  const row = await prisma.structuredInvocationDiagnostic.findFirst({ where: { taskId: task.id }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }] });
  assert.equal(JSON.parse(row.detailsJson).failureReason, "business_validation");
  assert.doesNotMatch(row.detailsJson, /private rejected story/);
});

test("short story repair debug logs omit story text and raw provider errors", () => {
  const file = require("../dist/llm/sessionLogFile");
  const previous = file.appendLlmRepairSessionLog;
  const rows = [];
  file.appendLlmRepairSessionLog = (value) => rows.push(value);
  try {
    require("../dist/llm/repairLogging").logStructuredRepairSession({
      event: "repair_error", label: "short story", repairAttempt: 1,
      promptMeta: { promptId: "novel.short_story.plan", taskId: "fixture" },
      repairSystem: "PRIVATE_STORY", repairHuman: "PRIVATE_STORY", rawOutput: "PRIVATE_STORY",
      validationError: "PRIVATE_STORY", error: new Error("Bearer PRIVATE_KEY"),
    });
    assert.equal(rows.length, 1);
    assert.doesNotMatch(JSON.stringify(rows), /PRIVATE_STORY|PRIVATE_KEY/);
    assert.equal(rows[0].repairAttempt, 1);
  } finally { file.appendLlmRepairSessionLog = previous; }
});
