const test = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../../dist/db/prisma.js");
const { NovelDirectorAutoExecutionRuntime } = require("../../dist/services/novel/director/automation/novelDirectorAutoExecutionRuntime.js");

for (const [runMode, withQualityNotice] of [["full_book_autopilot", false], ["full_book_autopilot", true], ["auto_to_execution", false]]) {
  test(`successful final chapter reconciles resources only for ${runMode} (qualityNotice=${withQualityNotice})`, async () => {
    const calls = [];
    let saved = false;
    let task = { id: "task", novelId: "book", lane: "auto_director", status: "running", seedPayloadJson: "{}" };
    const sceneCards = JSON.stringify({ targetWordCount: 2800, lengthBudget: { targetWordCount: 2800, softMinWordCount: 2380, softMaxWordCount: 3220, hardMaxWordCount: 3500 }, scenes: [1, 2, 3].map(order => ({ key: `scene-${order}`, title: "解开麻绳", purpose: "恢复自由", mustAdvance: ["主线"], mustPreserve: ["仍有伤势"], entryState: "受束缚", exitState: "有限行动", forbiddenExpansion: [], targetWordCount: order === 3 ? 1000 : 900 })) });
    const runtime = new NovelDirectorAutoExecutionRuntime({
      novelContextService: { listChapters: async () => [{ id: "chapter", order: 1, purpose: "解除束缚", exclusiveEvent: "解开麻绳", endingState: "恢复有限自由", nextChapterEntryState: "逃出墓地", conflictLevel: 5, revealLevel: 3, targetWordCount: 2800, mustAvoid: "不要跳过恢复", taskSheet: "解除束缚后逃出墓地", sceneCards, generationState: saved ? "approved" : "planned", chapterStatus: saved ? "completed" : "pending_generation" }] },
      novelService: {
        startPipelineJob: async () => ({ id: "job", status: "queued" }),
        findActivePipelineJobForRange: async () => null,
        getPipelineJobById: async () => { saved = true; return { id: "job", status: "succeeded", progress: 1, ...(withQualityNotice ? { noticeCode: "PIPELINE_COMPLETED_WITH_QUALITY_ALERTS", noticeSummary: "Some chapters finished below the configured quality threshold: 第 1 章局部修复完成" } : {}) }; },
      },
      workflowService: {
        getTaskById: async () => task,
        markTaskRunning: async () => {},
        updateTaskWithRetry: async ({ data }) => (task = { ...task, ...data }),
        recordCheckpoint: async () => { calls.push("completed"); },
      },
      buildDirectorSeedPayload: (_request, _novelId, extra) => extra ?? {},
      confirmChapterResources: async (input) => { calls.push(input); },
    });
    await runtime.runFromReady({
      taskId: "task", novelId: "book",
      request: { idea: "解除束缚", runMode, candidate: { targetChapterCount: 1, workingTitle: "解除束缚" }, estimatedChapterCount: 1 },
      existingState: { enabled: true, mode: "chapter_range", startOrder: 1, endOrder: 1, totalChapterCount: 1, autoReview: true, autoRepair: true },
    });
    const confirmations = calls.filter(value => typeof value === "object");
    assert.equal(confirmations.length, runMode === "full_book_autopilot" ? 1 : 0);
    if (confirmations.length) {
      assert.equal(confirmations[0].pipelineJobId, "job");
      assert.equal(confirmations[0].taskId, "task");
      assert.ok(calls.indexOf(confirmations[0]) < calls.indexOf("completed"));
    }
  });
}

async function fixture(suffix, overrides = {}) {
  const novelId = `resource-book-${suffix}`, taskId = `resource-task-${suffix}`, chapterId = `resource-chapter-${suffix}`, jobId = `resource-job-${suffix}`;
  await prisma.novel.create({ data: { id: novelId, title: "资源确认测试", directorVersion: overrides.version ?? "v1" } });
  await prisma.novelWorkflowTask.create({ data: { id: taskId, novelId, title: "全自动", lane: "auto_director", status: "running", directorVersion: overrides.version ?? "v1", directorEpoch: 0, seedPayloadJson: JSON.stringify({ directorInput: { runMode: overrides.runMode ?? "full_book_autopilot" } }) } });
  const content = "守墓人解开林沉双腕的麻绳。他恢复有限行动自由，但仍无法站起。";
  await prisma.chapter.create({ data: { id: chapterId, novelId, order: 6, title: "解开束缚", content } });
  await prisma.generationJob.create({ data: { id: jobId, novelId, startOrder: 6, endOrder: 6, status: "succeeded", payload: JSON.stringify({ workflowTaskId: taskId }) } });
  const { buildChapterArtifactContentHash } = require("../../dist/services/novel/runtime/artifactSync/index.js");
  const proposal = await prisma.stateChangeProposal.create({ data: {
    novelId, chapterId, sourceType: "chapter_background_sync", sourceStage: "chapter_execution", proposalType: "character_resource_update", riskLevel: "low", status: "pending_review", summary: "麻绳解除束缚",
    payloadJson: JSON.stringify({ resourceKey: "rope", resourceName: "麻绳束缚", chapterOrder: 6, resourceType: "physical_item", narrativeFunction: "constraint", updateType: "lost", ownerType: "unknown", statusAfter: "lost", visibilityAfter: { readerKnows: true, holderKnows: true, knownByCharacterIds: [] }, narrativeImpact: "恢复有限行动自由", confidence: null, syncContentHash: buildChapterArtifactContentHash(content) }),
    evidenceJson: JSON.stringify(["守墓人解开林沉双腕的麻绳。"]), validationNotesJson: JSON.stringify(overrides.debt ? ["source_quality:debt", "quality debt source requires manual review"] : ["resource update requires manual review"]),
  } });
  return { novelId, taskId, chapterId, pipelineJobId: jobId, proposal, content };
}

function serviceWithAi(decide) {
  const { DirectorStateProposalResolutionService } = require("../../dist/services/novel/director/runtime/DirectorStateProposalResolutionService.js");
  const { DirectorResourceConfirmationService } = require("../../dist/services/novel/director/automation/resources/index.js");
  return new DirectorResourceConfirmationService(new DirectorStateProposalResolutionService(async input => ({ output: await decide(input) })));
}

function decision(input, overrides = {}) {
  return { decision: "apply", confidence: 0.9, riskLevel: "low", reason: "正文证据明确，无状态冲突。", proposalIds: JSON.parse(input.promptInput.proposalsJson).map(p => p.id), affectedChapterWindow: { chapterOrders: [6] }, blockingLedgerKeys: [], ...overrides };
}

for (const debt of [false, true]) {
  test(`V1 automatically commits AI-reviewed resource loss (debt=${debt}) once`, async () => {
    const f = await fixture(`apply-${debt}`, { debt });
    let aiCalls = 0;
    const service = serviceWithAi(input => { aiCalls++; assert.equal(input.promptInput.savedChapterContent, f.content); return decision(input); });
    await service.confirmCompletedChapterResources(f);
    await service.confirmCompletedChapterResources(f);
    assert.equal(aiCalls, 1);
    assert.equal((await prisma.stateChangeProposal.findUnique({ where: { id: f.proposal.id } })).status, "committed");
    assert.equal((await prisma.characterResourceLedgerItem.findUnique({ where: { novelId_resourceKey: { novelId: f.novelId, resourceKey: "rope" } } })).status, "lost");
    assert.equal(await prisma.characterResourceEvent.count({ where: { novelId: f.novelId } }), 1);
    assert.equal(await prisma.canonicalStateVersion.count({ where: { novelId: f.novelId } }), 1);
  });
}

test("V2 and semiautomatic tasks cannot authorize resource confirmation", async () => {
  for (const options of [{ version: "v2" }, { runMode: "auto_to_execution" }]) {
    const f = await fixture(options.version ?? options.runMode, options);
    let calls = 0;
    await serviceWithAi(input => { calls++; return decision(input); }).confirmCompletedChapterResources(f);
    assert.equal(calls, 0);
    assert.equal((await prisma.stateChangeProposal.findUnique({ where: { id: f.proposal.id } })).status, "pending_review");
  }
});

test("unknown AI proposal IDs cannot approve the whole resource batch", async () => {
  const f = await fixture("unknown-id");
  await serviceWithAi(input => decision(input, { proposalIds: ["not-in-input"] })).confirmCompletedChapterResources(f);
  assert.equal((await prisma.stateChangeProposal.findUnique({ where: { id: f.proposal.id } })).status, "pending_review");
});

test("changed chapter content is rejected after AI review", async () => {
  const f = await fixture("changed-content");
  const service = serviceWithAi(async input => { await prisma.chapter.update({ where: { id: f.chapterId }, data: { content: "用户保存了不同的正文。" } }); return decision(input); });
  await assert.rejects(service.confirmCompletedChapterResources(f), /正文版本/);
  assert.equal((await prisma.stateChangeProposal.findUnique({ where: { id: f.proposal.id } })).status, "pending_review");
  assert.equal(await prisma.characterResourceEvent.count({ where: { novelId: f.novelId } }), 0);
});

test("a switched director epoch cannot commit the previous V1 review", async () => {
  const f = await fixture("changed-owner");
  const service = serviceWithAi(async input => { await prisma.novel.update({ where: { id: f.novelId }, data: { directorVersion: "v2", directorEpoch: 1 } }); return decision(input); });
  await assert.rejects(service.confirmCompletedChapterResources(f), /归属/);
  assert.equal((await prisma.stateChangeProposal.findUnique({ where: { id: f.proposal.id } })).status, "pending_review");
  assert.equal(await prisma.characterResourceEvent.count({ where: { novelId: f.novelId } }), 0);
});

test("later resource state cannot be rolled back by an earlier proposal", async () => {
  const f = await fixture("newer-ledger");
  await prisma.characterResourceLedgerItem.create({ data: {
    novelId: f.novelId, resourceKey: "rope", name: "麻绳", summary: "第七章的新状态", resourceType: "physical_item", narrativeFunction: "tool", ownerType: "unknown", status: "available", lastTouchedChapterOrder: 7,
  } });
  await serviceWithAi(input => decision(input)).confirmCompletedChapterResources(f);
  assert.equal((await prisma.stateChangeProposal.findUnique({ where: { id: f.proposal.id } })).riskLevel, "high");
  assert.equal((await prisma.characterResourceLedgerItem.findUnique({ where: { novelId_resourceKey: { novelId: f.novelId, resourceKey: "rope" } } })).status, "available");
  assert.equal(await prisma.characterResourceEvent.count({ where: { novelId: f.novelId } }), 0);
});

test("protected chapter resources stay manual without an AI call", async () => {
  const f = await fixture("protected");
  await prisma.directorArtifact.create({ data: { id: "resource-protected-artifact", novelId: f.novelId, artifactType: "chapter_draft", targetType: "chapter", targetId: f.chapterId, status: "active", source: "user", contentTable: "Chapter", contentId: f.chapterId, schemaVersion: "v1", protectedUserContent: true } });
  let calls = 0;
  await serviceWithAi(input => { calls++; return decision(input); }).confirmCompletedChapterResources(f);
  assert.equal(calls, 0);
  assert.equal((await prisma.stateChangeProposal.findUnique({ where: { id: f.proposal.id } })).status, "pending_review");
});

test("low confidence review stays pending and is not billed again on recovery", async () => {
  const f = await fixture("low-confidence");
  let calls = 0;
  const service = serviceWithAi(input => { calls++; return decision(input, { confidence: 0.4 }); });
  await service.confirmCompletedChapterResources(f);
  await service.confirmCompletedChapterResources(f);
  assert.equal(calls, 1);
  assert.equal((await prisma.stateChangeProposal.findUnique({ where: { id: f.proposal.id } })).status, "pending_review");
});

test("an AI review failure keeps resources pending without failing the chapter", async () => {
  const f = await fixture("ai-failure");
  await serviceWithAi(() => { throw new Error("test model unavailable"); }).confirmCompletedChapterResources(f);
  assert.equal((await prisma.stateChangeProposal.findUnique({ where: { id: f.proposal.id } })).status, "pending_review");
  assert.equal((await prisma.generationJob.findUnique({ where: { id: f.pipelineJobId } })).status, "succeeded");
});

test("a pending manual recovery lock prevents automatic resource changes", async () => {
  const f = await fixture("manual-lock");
  await prisma.novelWorkflowTask.update({ where: { id: f.taskId }, data: { pendingManualRecovery: true } });
  let calls = 0;
  await serviceWithAi(input => { calls++; return decision(input); }).confirmCompletedChapterResources(f);
  assert.equal(calls, 0);
  assert.equal((await prisma.stateChangeProposal.findUnique({ where: { id: f.proposal.id } })).status, "pending_review");
});

test("manual proposals and another chapter's proposals are outside the automatic review", async () => {
  const f = await fixture("scope");
  const { id, createdAt, updatedAt, ...data } = f.proposal;
  const manual = await prisma.stateChangeProposal.create({ data: { ...data, sourceType: "manual_resource_extract" } });
  const other = await prisma.stateChangeProposal.create({ data: { ...data, chapterId: null } });
  await serviceWithAi(input => { assert.deepEqual(JSON.parse(input.promptInput.proposalsJson).map(p => p.id), [id]); return decision(input); }).confirmCompletedChapterResources(f);
  assert.equal((await prisma.stateChangeProposal.findUnique({ where: { id: manual.id } })).status, "pending_review");
  assert.equal((await prisma.stateChangeProposal.findUnique({ where: { id: other.id } })).status, "pending_review");
});

test.after(async () => { await prisma.$disconnect(); });
