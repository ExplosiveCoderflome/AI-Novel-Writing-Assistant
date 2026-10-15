const test = require("node:test");
const assert = require("node:assert/strict");
const { loadRuntimeSource } = require("./novelProduction/sourceHarness.cjs");

test("planner preserves structured AI overview, unknown and clarification decisions", () => {
  const { normalizeIntentPayload } = loadRuntimeSource("../../../agents/planner/utils.ts", {
    "../toolRegistry": { listPlannerSemanticDefinitions: () => [] },
  });
  const input = { goal: "查看一下这本小说", messages: [], contextMode: "novel", novelId: "n" };
  for (const intent of ["general_chat", "unknown", "query_novel_production_status"]) {
    const normalized = normalizeIntentPayload({
      intent, interactionMode: "review", assistantResponse: "ask_followup",
      shouldAskFollowup: true, missingInfo: ["你想比较哪两个方案？"],
    }, input);
    assert.equal(normalized.intent, intent);
    assert.equal(normalized.interactionMode, "review");
    assert.equal(normalized.assistantResponse, "ask_followup");
    assert.equal(normalized.shouldAskFollowup, true);
    assert.deepEqual(normalized.missingInfo, ["你想比较哪两个方案？"]);
  }
});

test("registered planner prompt teaches overview defaults and validates AI query output", () => {
  const support = loadRuntimeSource("../../../agents/planner/intentPromptSupport.ts", {
    zod: require("zod"),
    "../approvalPolicy": { getPermissionMatrixSummary: () => "read" },
    "../toolRegistry": { listPlannerSemanticDefinitions: () => [], listAgentToolDefinitions: () => [] },
  });
  const utils = loadRuntimeSource("../../../agents/planner/utils.ts", {
    "../toolRegistry": { listPlannerSemanticDefinitions: () => [] },
  });
  class Message { constructor(content) { this.content = content; } }
  const { plannerIntentPrompt } = loadRuntimeSource("../../../prompting/prompts/agent/plannerIntent.prompt.ts", {
    "@langchain/core/messages": { HumanMessage: Message, SystemMessage: Message },
    zod: require("zod"),
    "../../../agents/planner/utils": utils,
    "../../../agents/planner/intentPromptSupport": support,
  });
  const input = { goal: "查看一下这本小说", messages: [], contextMode: "novel", novelId: "n" };
  const messages = plannerIntentPrompt.render(input);
  assert.match(messages[0].content, /query_novel_production_status.*shouldAskFollowup=false/);
  assert.match(messages[1].content, /查看一下这本小说/);
  const output = plannerIntentPrompt.postValidate({
    goal: input.goal, intent: "query_novel_production_status", requiresNovelContext: true,
    interactionMode: "query", assistantResponse: "execute", shouldAskFollowup: false, missingInfo: [],
  }, input);
  assert.equal(output.intent, "query_novel_production_status");
  assert.equal(output.shouldAskFollowup, false);
});

test("timeline does not close a blocking hook from matching text when AI returns empty ids", async () => {
  const { StoryTimelineService } = loadRuntimeSource("../../../modules/timeline/timeline.service.ts", {
    "./timeline.repository": { timelineRepository: {} },
  });
  for (const occurred of [true, false]) {
    const writes = [];
    const service = new StoryTimelineService({
      saveExtractedEvents: async (events) => events.map((event) => ({ ...event, id: "event" })),
      upsertChapterTimeAnchor: async () => {},
      markHooksAddressed: async (value) => writes.push(value),
      createHooks: async () => {},
    });
    await service.commitChapterTimeline({
      novelId: "n", chapterId: "c", chapterIndex: 8,
      timelineContext: { openHooks: [{ id: "hook", title: "长钟", description: "长钟危机", status: "open", blocking: true }] },
      extractedEvents: [{ title: "长钟", summary: "危机仍未处理", type: "plot", occurred, stateChanges: [], possibleHooks: [], confidence: 0.9 }],
      addressedHookIds: [], resolvedHookIds: [],
    });
    assert.equal(writes.length, 2);
    assert.deepEqual(writes.map((call) => call.hookIds), [[], []]);
  }
});

test("timeline accepts only known AI hook ids and gives resolution precedence", async () => {
  const { StoryTimelineService } = loadRuntimeSource("../../../modules/timeline/timeline.service.ts", {
    "./timeline.repository": { timelineRepository: {} },
  });
  const writes = [];
  const service = new StoryTimelineService({
    saveExtractedEvents: async () => [], upsertChapterTimeAnchor: async () => {}, createHooks: async () => {},
    markHooksAddressed: async (value) => writes.push(value),
  });
  await service.commitChapterTimeline({
    novelId: "n", chapterId: "c", chapterIndex: 8, extractedEvents: [],
    timelineContext: { openHooks: [{ id: "addressed" }, { id: "resolved" }] },
    addressedHookIds: ["addressed", "addressed", "resolved", "foreign"], resolvedHookIds: ["resolved", "foreign"],
  });
  assert.deepEqual(writes.map((call) => [call.resolved, call.hookIds]), [[false, ["addressed"]], [true, ["resolved"]]]);
});

function resourceServiceHarness({ chapters = [], proposal = null, rejectCount = 1, confirmCount = 1 } = {}) {
  const calls = [];
  const reviewStore = loadRuntimeSource("../characterResource/persistence/CharacterResourceReviewStore.ts", {
    "../../../../db/prisma": { prisma: {
      chapter: {
        findMany: async (input) => { calls.push(["chapters", input]); return chapters; },
        findFirst: async () => ({ order: 4 }),
      },
      stateChangeProposal: {
        findMany: async () => [],
        findFirst: async (input) => { calls.push(["proposal", input]); return proposal; },
        updateMany: async (input) => { calls.push(["reject", input]); return { count: rejectCount }; },
      },
    } },
  });
  const { CharacterResourceApplicationService } = loadRuntimeSource("../characterResource/application/CharacterResourceApplicationService.ts", {
    "@ai-novel/shared/types/characterResource": { characterResourceUpdatePayloadSchema: { parse: (value) => value } },
    "../persistence/CharacterResourceReviewStore": reviewStore,
    "../../../../middleware/errorHandler": { AppError: class extends Error { constructor(message, status) { super(message); this.status = status; } } },
    "../CharacterResourceExtractionService": { characterResourceExtractionService: {
      extractChapterResourceProposals: async (input) => { calls.push(["extract", input]); return [{ chapterId: input.chapterId }]; },
    } },
    "../CharacterResourceLedgerService": { characterResourceLedgerService: { listResources: async () => ["resource"] } },
    "../../state/StateCommitService": { stateCommitService: {
      proposeAndCommit: async (input) => { calls.push(["commit", input]); return { committed: [1], pendingReview: [2], rejected: [] }; },
      commitExistingProposals: async (input) => { calls.push(["confirm", input]); return { committed: Array(confirmCount).fill(1) }; },
    } },
  });
  return { service: new CharacterResourceApplicationService(), calls };
}

test("resource backfill processes selected nonempty recent chapters in story order and aggregates outcomes", async () => {
  const { service, calls } = resourceServiceHarness({ chapters: [
    { id: "empty", order: 9, content: "  \n " },
    { id: "newer", order: 8, content: "正文" },
    { id: "older", order: 7, content: "正文" },
    { id: "excluded", order: 6, content: "正文" },
  ] });
  const result = await service.backfill("n", { limit: 2, model: "model" });
  assert.equal(calls[0][1].take, 6);
  assert.deepEqual(calls.filter(([kind]) => ["extract", "commit"].includes(kind)).map(([kind, input]) => [kind, input.chapterId]), [
    ["extract", "older"], ["commit", "older"], ["extract", "newer"], ["commit", "newer"],
  ]);
  assert.deepEqual(result, { scannedChapterCount: 2, proposalCount: 2, committedCount: 2, pendingReviewCount: 2, rejectedCount: 0, items: ["resource"], pendingProposals: [] });
  assert.ok(calls.filter(([kind]) => kind === "commit").every(([, input]) => input.skipFactExtraction && input.sourceType === "manual_resource_backfill"));
});

test("manual extraction and confirmation retain state commit boundaries", async () => {
  const { service, calls } = resourceServiceHarness({ proposal: { chapterId: "c", payloadJson: '{"chapterOrder":5}' } });
  await service.extractChapter("n", "c", { model: "model" });
  const commit = calls.find(([kind]) => kind === "commit")[1];
  assert.equal(commit.sourceType, "manual_resource_extract");
  assert.equal(commit.skipFactExtraction, true);
  await service.confirmProposal("n", "p");
  assert.deepEqual(calls.find(([kind]) => kind === "confirm")[1], {
    novelId: "n", proposalIds: ["p"], chapterId: "c", chapterOrder: 5,
    sourceType: "manual_resource_confirm", sourceStage: "chapter_resource_review", reason: "character_resource_manual_confirm",
  });
  await service.rejectProposal("n", "p");
  assert.deepEqual(calls.find(([kind]) => kind === "reject")[1].where, {
    id: "p", novelId: "n", proposalType: "character_resource_update", status: "pending_review",
  });
});

test("resource proposal writes reject unavailable pending review records", async () => {
  const { service, calls } = resourceServiceHarness({ rejectCount: 0 });
  await assert.rejects(service.confirmProposal("n", "p"), (error) => error.status === 404);
  await assert.rejects(service.rejectProposal("n", "p"), (error) => error.status === 404);
  assert.ok(!calls.some(([kind]) => kind === "confirm"));
});


test("resource confirmation reports unavailable when another review consumes the proposal after its initial read", async () => {
  const { service } = resourceServiceHarness({ proposal: { chapterId: "c", payloadJson: '{"chapterOrder":5}' }, confirmCount: 0 });
  await assert.rejects(service.confirmProposal("n", "p"), (error) => error.status === 404);
});
