const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { initializeTemporarySqliteDatabase } = require("../testInfrastructure/tempSqliteDatabase.cjs");

test("forward adjustment preserves earlier chapter input and validates the current save boundary", async () => {
  process.env.DATABASE_URL = initializeTemporarySqliteDatabase(
    mkdtempSync(path.join(tmpdir(), "character-forward-")), "fixture.db",
  );
  process.env.RAG_ENABLED = "false";
  const { prisma } = require("../../dist/db/prisma");
  const { applyCharacterForwardAdjustment: apply, previewCharacterForwardAdjustment: preview } =
    require("../../dist/services/novel/characters/forwardAdjustments/CharacterForwardAdjustmentService");
  const { readCharacterForwardPlanNotices } = require("../../dist/services/novel/characters/forwardAdjustments/plans");
  const { canonicalStateService } = require("../../dist/services/novel/state/CanonicalStateService");
  const { GenerationContextAssembler } = require("../../dist/services/novel/runtime/GenerationContextAssembler");
  const { buildChapterWriterContextBlocks } = require("../../dist/prompting/prompts/novel/chapterLayeredContext");
  const { buildChapterArtifactContentHash, CHAPTER_ARTIFACT_BOUNDARY_TYPE } =
    require("../../dist/services/novel/runtime/artifactSync");

  const novelId = "book", characterId = "qing", runId = "director";
  const get = () => preview(novelId, characterId);
  const save = (source, fields) => apply(novelId, characterId, {
    effectiveFromChapterOrder: source.effectiveFromChapterOrder, fingerprint: source.fingerprint, fields,
  });
  const stamp = new Date("2020-01-01");
  const conflict = error => error.statusCode === 409;
  try {
    await prisma.novel.create({ data: { id: novelId, title: "药铺", directorVersion: "v2", estimatedChapterCount: 4 } });
    await prisma.character.create({ data: { id: characterId, novelId, name: "青禾", role: "主角", currentState: "守在药铺", development: "相信师父" } });
    await prisma.chapter.createMany({ data: [
      { id: "one", novelId, title: "开门", order: 1, content: "青禾开门。", generationState: "approved" },
      { id: "two", novelId, title: "出门", order: 2 },
      { id: "three", novelId, title: "进城", order: 3 },
    ] });
    assert.equal((await get()).effectiveFromChapterOrder, 1, "approval alone is not a production boundary");
    await prisma.chapterArtifactSyncCheckpoint.create({ data: {
      novelId, chapterId: "one", contentHash: buildChapterArtifactContentHash("青禾开门。"),
      artifactType: CHAPTER_ARTIFACT_BOUNDARY_TYPE, syncMode: "director_v2", metadataJson: '{"outcome":"completed"}',
    } });
    await prisma.volumePlan.create({ data: { id: "volume", novelId, title: "药铺", sortOrder: 1 } });
    await prisma.volumeChapterPlan.create({ data: {
      id: "plan", volumeId: "volume", chapterId: "two", title: "出门", summary: "调查", chapterOrder: 2, updatedAt: stamp,
    } });
    await prisma.storyPlan.create({ data: {
      novelId, chapterId: "two", level: "chapter", title: "出门", objective: "调查",
      participantsJson: '["青禾"]', updatedAt: stamp,
    } });
    const beforeRun = await get();
    assert.equal(beforeRun.effectiveFromChapterOrder, 2);
    assert.deepEqual(beforeRun.affectedPlans.map(plan => plan.planId), ["plan"]);

    await prisma.directorNextRun.create({ data: { id: runId, novelId, driver: "assisted", planVersion: "test", contractJson: "{}" } });
    await prisma.directorNextRunControl.create({ data: { runId, novelId, status: "running" } });
    assert.ok((await get()).blockedReason);
    await assert.rejects(save(beforeRun, { currentGoal: "进城查账" }), conflict);
    await prisma.directorNextRunControl.update({ where: { runId }, data: { status: "paused", version: 1 } });
    await assert.rejects(save(beforeRun, { currentGoal: "进城查账" }), conflict);
    await prisma.generationJob.create({ data: { id: "batch", novelId, startOrder: 2, endOrder: 2, status: "failed" } });
    await prisma.directorNextEvent.create({ data: {
      id: "batch-binding", runId, seq: 1, type: "chapter_batch_job", payloadJson: '{"jobId":"batch"}',
    } });
    assert.ok((await get()).blockedReason);
    await prisma.generationJob.update({ where: { id: "batch" }, data: { status: "succeeded", pendingManualRecovery: true } });
    assert.ok((await get()).blockedReason);
    await prisma.generationJob.update({ where: { id: "batch" }, data: { pendingManualRecovery: false } });

    const ready = await get();
    const competing = await Promise.allSettled([
      save(ready, { currentGoal: "进城查账" }), save(ready, { currentGoal: "进城查账" }),
    ]);
    assert.equal(competing.filter(item => item.status === "fulfilled").length, 1);
    assert.ok(conflict(competing.find(item => item.status === "rejected").reason));
    await save(await get(), { currentState: "离开药铺", development: "开始怀疑师父" });
    assert.deepEqual((await get()).fields, { currentGoal: "进城查账", currentState: "离开药铺", development: "开始怀疑师父" });
    assert.deepEqual((await readCharacterForwardPlanNotices(prisma, novelId)).map(plan => plan.planId), ["plan"]);
    assert.equal(await prisma.characterTimeline.count({ where: { novelId, chapterOrder: 2, source: "author_adjust" } }), 2);
    assert.equal((await prisma.chapter.findUniqueOrThrow({ where: { id: "one" } })).content, "青禾开门。");

    const resolve = async chapterOrder => (await canonicalStateService.getSnapshot(novelId, { chapterOrder })).characters[0];
    assert.deepEqual((await resolve(1)).forwardAdjustment, { currentState: "守在药铺", currentGoal: null, development: "相信师父" });
    assert.deepEqual((await resolve(2)).forwardAdjustment, { currentState: "离开药铺", currentGoal: "进城查账", development: "开始怀疑师父" });
    const assembler = new GenerationContextAssembler();
    const oldContext = (await assembler.assemble(novelId, "one", {})).contextPackage;
    const newContext = (await assembler.assemble(novelId, "two", {})).contextPackage;
    assert.equal(oldContext.characterRoster[0].currentGoal, null);
    assert.equal(oldContext.characterDynamics.characters[0].currentGoal, null);
    assert.equal(newContext.characterRoster[0].currentGoal, "进城查账");
    assert.equal(newContext.characterRoster[0].development, "开始怀疑师父");
    const prompt = context => buildChapterWriterContextBlocks(context.chapterWriteContext).map(block => block.content).join("\n");
    assert.match(prompt(oldContext), /相信师父/);
    assert.doesNotMatch(prompt(oldContext), /进城查账|开始怀疑师父/);
    assert.match(prompt(newContext), /进城查账/);
    assert.match(prompt(newContext), /开始怀疑师父/);
    await prisma.storyStateSnapshot.create({ data: { novelId, sourceChapterId: "two", characterStates: { create: {
      characterId, summary: "进城遇阻", updatedAt: new Date(Date.now() + 1000),
    } } } });
    assert.equal((await resolve(3)).currentGoal, "进城查账", "partial snapshots preserve adjusted fields");
    assert.equal((await resolve(3)).currentState, "进城遇阻");
    await prisma.volumeChapterPlan.update({ where: { id: "plan" }, data: { summary: "调整行程", updatedAt: new Date(Date.now() + 1000) } });
    assert.deepEqual(await readCharacterForwardPlanNotices(prisma, novelId), []);
  } finally {
    await prisma.$disconnect();
  }
});

test("chapter retrieval keeps versionless adjusted rows and future chapter evidence out of prompts", () => {
  const { filterChapterCharacterScope } = require("../../dist/services/rag/facts/ChapterCharacterScope");
  const chunk = (ownerType, ownerId, metadata) => ({ ownerType, ownerId, metadataJson: JSON.stringify(metadata) });
  const allowed = [chunk("character", "another"), chunk("chapter_summary", "before"),
    chunk("consistency_fact", "before-fact", { chapterId: "before" }), chunk("knowledge_document", "reference")];
  const excluded = [chunk("character", "adjusted"), chunk("chapter", "after"),
    chunk("consistency_fact", "future-fact", { chapterId: "after" }),
    chunk("character_timeline", "adjustment", { source: "author_adjust", chapterId: "before" })];
  assert.deepEqual(filterChapterCharacterScope([...allowed, ...excluded], {
    adjustedCharacterIds: ["adjusted"], visibleChapterIds: ["before"],
  }), allowed);
});

test("an adjustment at an earlier reopened chapter keeps the original historical fallback", () => {
  const { resolveForwardCharacterFields } = require("../../dist/services/novel/characters/forwardAdjustments/fieldPolicy");
  const changes = [
    { effectiveFromChapterOrder: 4, revision: 1, createdAt: new Date(1), before: { currentGoal: null }, after: { currentGoal: "leave" } },
    { effectiveFromChapterOrder: 3, revision: 2, createdAt: new Date(2), before: { currentGoal: "leave" }, after: { currentGoal: "wait" } },
    { effectiveFromChapterOrder: 3, revision: 3, createdAt: new Date(3), before: { currentGoal: "wait" }, after: { currentGoal: "search" } },
  ];
  assert.deepEqual(resolveForwardCharacterFields(2, changes, []), { currentGoal: null });
  assert.deepEqual(resolveForwardCharacterFields(3, changes, []), { currentGoal: "search" });
  assert.deepEqual(resolveForwardCharacterFields(4, changes, []), { currentGoal: "leave" });
});
