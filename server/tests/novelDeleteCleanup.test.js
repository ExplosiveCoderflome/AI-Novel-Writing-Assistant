const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

// Never inherit an application database. This suite only accepts a fresh SQLite
// file under this worktree's .tmp; PostgreSQL requires separate acceptance.
const temporaryParent = path.join(__dirname, "../../.tmp");
fs.mkdirSync(temporaryParent, { recursive: true });
const temporaryRoot = fs.mkdtempSync(path.join(temporaryParent, "t1-delete-"));
const databaseUrl = process.env.NOVEL_DELETE_TEST_DATABASE_URL || `file:${path.join(temporaryRoot, "test.db")}`;
assert.ok(databaseUrl.startsWith("file:"), "Only isolated SQLite is allowed");
const databaseFile = databaseUrl.slice(5);
assert.ok(path.isAbsolute(databaseFile));
assert.ok(path.resolve(databaseFile).startsWith(`${path.resolve(temporaryParent)}${path.sep}`));
assert.equal(fs.existsSync(databaseFile), false, "Refuse to use any existing database");
Object.assign(process.env, {
  NODE_ENV: "test",
  AI_NOVEL_RUNTIME: "desktop",
  AI_NOVEL_APP_DATA_DIR: temporaryRoot,
  DATABASE_URL: databaseUrl,
  NOVEL_DELETE_TEST_DATABASE_URL: databaseUrl,
});
console.log("[database safety]", JSON.stringify({ DATABASE_URL: databaseUrl, NOVEL_DELETE_TEST_DATABASE_URL: databaseUrl, databaseFile, existsBefore: false, temporaryRoot }));

const { NovelCoreCrudService } = require("../dist/services/novel/novelCoreCrudService.js");
const { prisma } = require("../dist/db/prisma.js");
const { ragServices } = require("../dist/services/rag/index.js");
const { OutlineOpenBookService } = require("../dist/modules/planning/outline/openBook");
const { createEmptyOutlineDocument } = require("@ai-novel/shared/types/outline");

test.before(async () => {
  if (process.env.DATABASE_URL.startsWith("file:")) {
    await require("../dist/db/runtimeMigrations").ensureRuntimeDatabaseReady();
    assert.equal((await prisma.$queryRawUnsafe("PRAGMA foreign_keys"))[0].foreign_keys, 1n);
  }
});
test.after(() => prisma.$disconnect());

async function outlineFixture(t) {
  t.mock.method(ragServices.ragIndexService, "enqueueDelete", async () => {});
  const id = `delete-outline-${randomUUID()}`;
  const document = createEmptyOutlineDocument("可再次开书的大纲");
  document.story.premise = "主角收到未来的来信";
  document.volumes = [{ nodeId: "v", title: "来信", summary: "保留卷纲", order: 0, planningDepth: "rough", chapterNodeIds: ["c"] }];
  document.chapters = [{ nodeId: "c", volumeNodeId: "v", order: 0, title: "第一封信", summary: "保留章纲", purpose: "引出悬念", planningDepth: "rough", characterNodeIds: [], payoffNodeIds: [] }];
  await prisma.outlineProject.create({ data: { id, title: document.story.title, currentVersion: 2, currentRevisionId: `${id}-r2` } });
  for (const version of [1, 2]) {
    await prisma.outlineRevision.create({ data: { id: `${id}-r${version}`, projectId: id, version, documentJson: JSON.stringify(document), sourceType: "manual" } });
  }
  const proposal = await prisma.outlineProposal.create({ data: { projectId: id, baseVersion: 2, kind: "edit", status: "pending", proposalJson: "{}" } });
  const input = { revisionId: `${id}-r2`, expectedProjectVersion: 2, bookSettings: { title: document.story.title, estimatedChapterCount: 3, defaultChapterLength: 3000 }, volumeQuotas: { v: 3 }, allowOptimize: [] };
  const service = new OutlineOpenBookService(prisma, async () => {});
  const open = async key => {
    const preview = await service.preview(id, input);
    return service.confirm(id, { ...input, requestHash: preview.requestHash, idempotencyKey: `${id}-${key}` });
  };
  const binding = await open("first");
  const revisions = await prisma.outlineRevision.findMany({ where: { projectId: id }, orderBy: { version: "asc" } });
  return { id, input, service, open, binding, revisions, proposal };
}

test("大纲开书小说可删除：Restrict 不拦截，项目、修订及提案保留且可重新开书", async t => {
  const f = await outlineFixture(t);
  // Verify a real database FK is active, independent of the deletion service.
  await assert.rejects(() => prisma.novel.delete({ where: { id: f.binding.novelId } }), error => error.code === "P2003");
  const other = await prisma.novel.create({ data: { title: "保留的其他小说" } });
  const otherProject = await prisma.outlineProject.create({ data: { title: "其他大纲", boundNovelId: other.id } });

  await new NovelCoreCrudService().deleteNovel(f.binding.novelId);

  assert.equal(await prisma.novel.findUnique({ where: { id: f.binding.novelId } }), null);
  assert.equal(await prisma.outlineBookBinding.count({ where: { OR: [{ novelId: f.binding.novelId }, { projectId: f.id }] } }), 0);
  const project = await prisma.outlineProject.findUniqueOrThrow({ where: { id: f.id } });
  assert.equal(project.boundNovelId, null);
  assert.equal(project.currentRevisionId, f.input.revisionId);
  assert.equal(project.currentVersion, 2);
  assert.deepEqual(await prisma.outlineRevision.findMany({ where: { projectId: f.id }, orderBy: { version: "asc" } }), f.revisions);
  assert.deepEqual(await prisma.outlineProposal.findUnique({ where: { id: f.proposal.id } }), f.proposal);
  assert.equal(await f.service.getBinding(f.id), null);
  assert.equal((await prisma.outlineProject.findUniqueOrThrow({ where: { id: otherProject.id } })).boundNovelId, other.id);
  assert.ok(await prisma.novel.findUnique({ where: { id: other.id } }));

  const reopened = await f.open("second");
  assert.equal(reopened.replayed, false);
  // The existing open-book service derives IDs from projectId and reuses them.
  // A new request key and recreated assets prove this is creation, not replay.
  assert.equal((await prisma.outlineBookBinding.findUniqueOrThrow({ where: { projectId: f.id } })).requestKey, `${f.id}-second`);
  assert.equal(await prisma.outlineBookBinding.count({ where: { projectId: f.id } }), 1);
  assert.equal((await prisma.outlineProject.findUniqueOrThrow({ where: { id: f.id } })).boundNovelId, reopened.novelId);
  assert.ok(await prisma.novel.findUnique({ where: { id: reopened.novelId } }));
  assert.equal(await prisma.chapter.count({ where: { novelId: reopened.novelId } }), 1);
  assert.equal(await prisma.volumePlanVersion.count({ where: { novelId: reopened.novelId } }), 1);
});

test("大纲开书小说可删除：只删绑定会留下 boundNovelId，confirm 拒绝再次开书", async t => {
  const f = await outlineFixture(t);
  // Reproduce the incomplete fix on synthetic data only, using real FKs.
  await prisma.$transaction(async tx => {
    await tx.outlineBookBinding.deleteMany({ where: { novelId: f.binding.novelId } });
    await tx.novel.delete({ where: { id: f.binding.novelId } });
  });
  assert.equal((await prisma.outlineProject.findUniqueOrThrow({ where: { id: f.id } })).boundNovelId, f.binding.novelId);
  await assert.rejects(() => f.open("second"), error => {
    assert.equal(error.code, "OUTLINE_BINDING_INTEGRITY");
    assert.equal(error.message, "大纲已有小说来源记录，不能重复开书。");
    return true;
  });
  assert.equal(await prisma.novel.count({ where: { id: f.binding.novelId } }), 0);
  assert.equal(await prisma.outlineBookBinding.count({ where: { projectId: f.id } }), 0);
  await prisma.outlineProject.update({ where: { id: f.id }, data: { boundNovelId: null } });
  assert.equal((await f.open("second")).replayed, false);
});

test("真实 Prisma 清理按小说隔离诊断、调用原文和导演记录", async () => {
  const novel = await prisma.novel.create({ data: { title: "待删除小说" } });
  const other = await prisma.novel.create({ data: { title: "保留小说" } });
  const task = await prisma.novelWorkflowTask.create({ data: { novelId: novel.id, lane: "auto_director", title: "本书导演任务", status: "failed" } });
  const otherTask = await prisma.novelWorkflowTask.create({ data: { novelId: other.id, lane: "auto_director", title: "另一书导演任务", status: "waiting_approval" } });
  const diagnostic = async (id, novelId, taskId, raw) => prisma.structuredInvocationDiagnostic.create({ data: {
    id, invocationId: id, attempt: 1, novelId, taskId, promptId: "delete-test", kind: "validation",
    strategy: "retry", detailsJson: raw,
  } });
  await diagnostic("diag-target", novel.id, task.id, "SECRET_TARGET_DIAGNOSTIC");
  await diagnostic("diag-other", other.id, otherTask.id, "SECRET_OTHER_DIAGNOSTIC");
  const usage = async (id, novelId, workflowTaskId, raw) => prisma.llmInvocationUsageRecord.create({ data: {
    id, novelId, workflowTaskId, requestProtocol: "responses", status: "succeeded", startedAt: new Date(), finishedAt: new Date(),
    cacheUsageStatus: "not_reported", payload: { create: { compressed: Buffer.from(raw), compressedBytes: Buffer.byteLength(raw) } },
  } });
  await usage("usage-target", novel.id, task.id, "SECRET_TARGET_PROMPT_AND_ANSWER");
  await usage("usage-other", other.id, otherTask.id, "SECRET_OTHER_PROMPT_AND_ANSWER");
  const targetChunkId = `target-chunk-${randomUUID()}`;
  const otherChunkId = `other-chunk-${randomUUID()}`;
  await prisma.knowledgeChunk.create({ data: { id: targetChunkId, ownerType: "novel", ownerId: novel.id, novelId: novel.id, chunkText: "SECRET_TARGET_RAG_TEXT", chunkHash: randomUUID(), chunkOrder: 0, embedProvider: "test", embedModel: "test" } });
  await prisma.knowledgeChunk.create({ data: { id: otherChunkId, ownerType: "novel", ownerId: other.id, novelId: other.id, chunkText: "SECRET_OTHER_RAG_TEXT", chunkHash: randomUUID(), chunkOrder: 0, embedProvider: "test", embedModel: "test" } });
  await prisma.directorRun.create({ data: { id: "run-target", taskId: task.id, novelId: novel.id, policyJson: "target-policy" } });
  await prisma.directorRun.create({ data: { id: "run-other", taskId: otherTask.id, novelId: other.id, policyJson: "other-policy" } });
  for (const [suffix, novelId, taskId] of [["target", novel.id, task.id], ["other", other.id, otherTask.id]]) {
    await prisma.directorRunCommand.create({ data: { id: `command-${suffix}`, novelId, taskId, commandType: "continue", idempotencyKey: suffix, payloadJson: `SECRET_${suffix}_COMMAND` } });
    await prisma.taskCenterArchive.create({ data: { id: `archive-${suffix}`, taskKind: "novel_workflow", taskId } });
  }
  await prisma.directorEvent.create({ data: { id: "event-target", runId: "run-target", taskId: task.id, novelId: novel.id, type: "test", summary: "SECRET_TARGET_EVENT", occurredAt: new Date() } });
  await prisma.directorEvent.create({ data: { id: "event-other", runId: "run-other", taskId: otherTask.id, novelId: other.id, type: "test", summary: "SECRET_OTHER_EVENT", occurredAt: new Date() } });
  await prisma.directorLlmUsageRecord.create({ data: { id: "director-usage-target", novelId: novel.id, taskId: task.id, runId: "run-target", metadataJson: "SECRET_TARGET_DIRECTOR_USAGE" } });
  await prisma.directorLlmUsageRecord.create({ data: { id: "director-usage-other", novelId: other.id, taskId: otherTask.id, runId: "run-other", metadataJson: "SECRET_OTHER_DIRECTOR_USAGE" } });
  const otherSnapshot = {
    diagnostic: await prisma.structuredInvocationDiagnostic.findUniqueOrThrow({ where: { id: "diag-other" } }),
    usage: await prisma.llmInvocationUsageRecord.findUniqueOrThrow({ where: { id: "usage-other" }, include: { payload: true } }),
    run: await prisma.directorRun.findUniqueOrThrow({ where: { id: "run-other" } }),
    event: await prisma.directorEvent.findUniqueOrThrow({ where: { id: "event-other" } }),
    directorUsage: await prisma.directorLlmUsageRecord.findUniqueOrThrow({ where: { id: "director-usage-other" } }),
    command: await prisma.directorRunCommand.findUniqueOrThrow({ where: { id: "command-other" } }),
    archive: await prisma.taskCenterArchive.findUniqueOrThrow({ where: { id: "archive-other" } }),
  };

  const { VectorStoreService } = require("../dist/services/rag/VectorStoreService.js");
  const originalVectorDelete = VectorStoreService.prototype.deletePoints;
  const deletedVectors = [];
  VectorStoreService.prototype.deletePoints = async ids => { deletedVectors.push(...ids); };
  try {
    await new NovelCoreCrudService().deleteNovel(novel.id);
  } finally {
    VectorStoreService.prototype.deletePoints = originalVectorDelete;
  }

  assert.equal(await prisma.structuredInvocationDiagnostic.findUnique({ where: { id: "diag-target" } }), null);
  assert.equal(await prisma.llmInvocationUsageRecord.findUnique({ where: { id: "usage-target" } }), null);
  assert.equal(await prisma.llmInvocationPayload.findUnique({ where: { usageRecordId: "usage-target" } }), null);
  assert.equal(await prisma.directorRun.findUnique({ where: { id: "run-target" } }), null);
  assert.equal(await prisma.directorRunCommand.findUnique({ where: { id: "command-target" } }), null);
  assert.equal(await prisma.taskCenterArchive.findUnique({ where: { id: "archive-target" } }), null);
  assert.equal(await prisma.directorEvent.findUnique({ where: { id: "event-target" } }), null);
  assert.equal(await prisma.directorLlmUsageRecord.findUnique({ where: { id: "director-usage-target" } }), null);
  assert.equal(await prisma.knowledgeChunk.findUnique({ where: { id: targetChunkId } }), null);
  assert.ok(await prisma.knowledgeChunk.findUnique({ where: { id: otherChunkId } }));
  assert.deepEqual(deletedVectors, [targetChunkId]);
  assert.equal(await prisma.structuredInvocationDiagnostic.count({ where: { detailsJson: { contains: "SECRET_TARGET" } } }), 0);
  assert.equal(await prisma.llmInvocationPayload.count(), 1);
  assert.deepEqual(await prisma.structuredInvocationDiagnostic.findUniqueOrThrow({ where: { id: "diag-other" } }), otherSnapshot.diagnostic);
  assert.deepEqual(await prisma.llmInvocationUsageRecord.findUniqueOrThrow({ where: { id: "usage-other" }, include: { payload: true } }), otherSnapshot.usage);
  assert.deepEqual(await prisma.directorRun.findUniqueOrThrow({ where: { id: "run-other" } }), otherSnapshot.run);
  assert.deepEqual(await prisma.directorEvent.findUniqueOrThrow({ where: { id: "event-other" } }), otherSnapshot.event);
  assert.deepEqual(await prisma.directorLlmUsageRecord.findUniqueOrThrow({ where: { id: "director-usage-other" } }), otherSnapshot.directorUsage);
  assert.deepEqual(await prisma.directorRunCommand.findUniqueOrThrow({ where: { id: "command-other" } }), otherSnapshot.command);
  assert.deepEqual(await prisma.taskCenterArchive.findUniqueOrThrow({ where: { id: "archive-other" } }), otherSnapshot.archive);
});

async function localImageFixture(novelId, filename = "cover.png", existingPath) {
  const task = await prisma.imageGenerationTask.create({ data: { novelId, sceneType: "novel_cover", provider: "test", model: "test", prompt: "isolated local image" } });
  const localPath = existingPath || path.join(temporaryRoot, "storage", "generated-images", "novel-covers", novelId, task.id, filename);
  if (!existingPath) {
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, `fixture:${novelId}:${filename}`);
  }
  const asset = await prisma.imageAsset.create({ data: { novelId, taskId: task.id, sceneType: "novel_cover", provider: "test", model: "test", url: localPath, metadata: JSON.stringify({ localPath }) } });
  return { task, asset, localPath };
}

test("真实事务在 prepare 完成后的 Novel 删除处失败：敏感数据、图片、收据和向量边界回滚", async t => {
  t.mock.method(ragServices.ragIndexService, "enqueueDelete", async () => {});
  const { VectorStoreService } = require("../dist/services/rag/VectorStoreService.js");
  const vectorDelete = t.mock.method(VectorStoreService.prototype, "deletePoints", async () => {});
  const novel = await prisma.novel.create({ data: { title: "真实中途回滚" } });
  const task = await prisma.novelWorkflowTask.create({ data: { novelId: novel.id, lane: "auto_director", title: "回滚导演", status: "failed" } });
  const diagnostic = await prisma.structuredInvocationDiagnostic.create({ data: { invocationId: randomUUID(), attempt: 1, novelId: novel.id, taskId: task.id, promptId: "rollback", kind: "validation", strategy: "retry", detailsJson: "SECRET_ROLLBACK_DIAGNOSTIC" } });
  const usage = await prisma.llmInvocationUsageRecord.create({ data: { id: randomUUID(), novelId: novel.id, workflowTaskId: task.id, requestProtocol: "responses", status: "succeeded", startedAt: new Date(), finishedAt: new Date(), cacheUsageStatus: "not_reported", payload: { create: { compressed: Buffer.from("SECRET_ROLLBACK_PAYLOAD"), compressedBytes: Buffer.byteLength("SECRET_ROLLBACK_PAYLOAD") } } }, include: { payload: true } });
  const run = await prisma.directorRun.create({ data: { id: randomUUID(), taskId: task.id, novelId: novel.id, policyJson: "SECRET_ROLLBACK_POLICY" } });
  const event = await prisma.directorEvent.create({ data: { id: randomUUID(), runId: run.id, taskId: task.id, novelId: novel.id, type: "test", summary: "SECRET_ROLLBACK_EVENT", occurredAt: new Date() } });
  const directorUsage = await prisma.directorLlmUsageRecord.create({ data: { novelId: novel.id, taskId: task.id, runId: run.id, metadataJson: "SECRET_ROLLBACK_USAGE" } });
  const chunk = await prisma.knowledgeChunk.create({ data: { id: randomUUID(), ownerType: "novel", ownerId: novel.id, novelId: novel.id, chunkText: "SECRET_ROLLBACK_RAG", chunkHash: randomUUID(), chunkOrder: 0, embedProvider: "test", embedModel: "test" } });
  const image = await localImageFixture(novel.id);
  const imageContents = fs.readFileSync(image.localPath);
  const receiptsBefore = await prisma.novelSideEffectJob.findMany({ orderBy: { id: "asc" } });
  // Keep the real interactive transaction and real delete. Observe uncommitted
  // state immediately before deletion because Prisma maps SQLite RAISE text to
  // a generic P2003 and does not expose the trigger's custom message.
  const originalTransaction = prisma.$transaction;
  t.after(() => { prisma.$transaction = originalTransaction; });
  let observedPreparedState = false;
  prisma.$transaction = callback => originalTransaction.call(prisma, tx => callback(new Proxy(tx, {
    get(target, property) {
      if (property !== "novel") return Reflect.get(target, property);
      return new Proxy(tx.novel, { get(model, operation) {
        if (operation !== "delete") return Reflect.get(model, operation);
        return async query => {
          assert.deepEqual(query, { where: { id: novel.id } });
          for (const [modelName, row] of [["structuredInvocationDiagnostic", diagnostic], ["llmInvocationUsageRecord", usage], ["directorRun", run], ["directorEvent", event], ["directorLlmUsageRecord", directorUsage], ["knowledgeChunk", chunk]]) {
            assert.equal(await tx[modelName].findUnique({ where: { id: row.id } }), null, `${modelName} cleaned inside real transaction`);
          }
          assert.equal(await tx.llmInvocationPayload.findUnique({ where: { usageRecordId: usage.id } }), null);
          const receipt = await tx.novelSideEffectJob.findFirstOrThrow({ where: { jobType: "novel.deletedFiles", payloadJson: { contains: image.asset.id } } });
          assert.deepEqual(JSON.parse(receipt.payloadJson).vectorIds, [chunk.id]);
          assert.equal(fs.existsSync(image.localPath), true);
          assert.equal(vectorDelete.mock.callCount(), 0);
          observedPreparedState = true;
          return tx.novel.delete(query);
        };
      } });
    },
  })));
  // UUID/cuid fixture IDs are generated here, never user input. The trigger can
  // emit PREPARE_COMPLETED only after observing real uncommitted cleanup and its
  // receipt. A service that skips prepare must fail this assertion differently.
  await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_novel_after_prepare BEFORE DELETE ON Novel
    WHEN OLD.id = '${novel.id}' BEGIN
      SELECT CASE WHEN
        NOT EXISTS (SELECT 1 FROM StructuredInvocationDiagnostic WHERE id = '${diagnostic.id}') AND
        NOT EXISTS (SELECT 1 FROM LlmInvocationUsageRecord WHERE id = '${usage.id}') AND
        NOT EXISTS (SELECT 1 FROM LlmInvocationPayload WHERE usageRecordId = '${usage.id}') AND
        NOT EXISTS (SELECT 1 FROM DirectorRun WHERE id = '${run.id}') AND
        NOT EXISTS (SELECT 1 FROM DirectorEvent WHERE id = '${event.id}') AND
        NOT EXISTS (SELECT 1 FROM DirectorLlmUsageRecord WHERE id = '${directorUsage.id}') AND
        NOT EXISTS (SELECT 1 FROM KnowledgeChunk WHERE id = '${chunk.id}') AND
        EXISTS (SELECT 1 FROM NovelSideEffectJob WHERE jobType = 'novel.deletedFiles'
          AND instr(payloadJson, '${image.asset.id}') > 0 AND instr(payloadJson, '${chunk.id}') > 0)
      THEN RAISE(ABORT, 'PREPARE_COMPLETED_INJECTED_FAILURE')
      ELSE RAISE(ABORT, 'PREPARE_NOT_COMPLETED') END;
    END`);
  try {
    await assert.rejects(() => new NovelCoreCrudService().deleteNovel(novel.id), error => error.code === "P2003");
  } finally {
    await prisma.$executeRawUnsafe("DROP TRIGGER fail_novel_after_prepare");
  }
  assert.equal(observedPreparedState, true, "prepare completed inside the real transaction before the failing delete");
  assert.deepEqual(await prisma.novel.findUniqueOrThrow({ where: { id: novel.id } }), novel);
  assert.deepEqual(await prisma.novelWorkflowTask.findUniqueOrThrow({ where: { id: task.id } }), task);
  for (const [model, row] of [["structuredInvocationDiagnostic", diagnostic], ["directorRun", run], ["directorEvent", event], ["directorLlmUsageRecord", directorUsage], ["knowledgeChunk", chunk], ["imageAsset", image.asset], ["imageGenerationTask", image.task]]) {
    assert.deepEqual(await prisma[model].findUniqueOrThrow({ where: { id: row.id } }), row, model);
  }
  assert.deepEqual(await prisma.llmInvocationUsageRecord.findUniqueOrThrow({ where: { id: usage.id }, include: { payload: true } }), usage);
  assert.deepEqual(await prisma.novelSideEffectJob.findMany({ orderBy: { id: "asc" } }), receiptsBefore);
  assert.deepEqual(fs.readFileSync(image.localPath), imageContents);
  assert.equal(vectorDelete.mock.callCount(), 0); // Mock boundary, not live Qdrant.
  assert.equal(ragServices.ragIndexService.enqueueDelete.mock.callCount(), 0);
  assert.deepEqual(await prisma.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'fail_novel_after_prepare'"), []);
});

test("完整 deleteNovel 删除本书独占本地图片，保留跨书共享文件、另一书文件与记录", async t => {
  t.mock.method(ragServices.ragIndexService, "enqueueDelete", async () => {});
  const novel = await prisma.novel.create({ data: { title: "完整图片删除" } });
  const other = await prisma.novel.create({ data: { title: "完整图片保留" } });
  const owned = await localImageFixture(novel.id);
  const shared = await localImageFixture(novel.id, "shared.png");
  const sharedReference = await localImageFixture(other.id, "unused.png", shared.localPath);
  const otherImage = await localImageFixture(other.id);
  const sharedContents = fs.readFileSync(shared.localPath);
  const otherContents = fs.readFileSync(otherImage.localPath);
  await new NovelCoreCrudService().deleteNovel(novel.id);
  assert.equal(await prisma.novel.findUnique({ where: { id: novel.id } }), null);
  assert.equal(fs.existsSync(owned.localPath), false);
  assert.deepEqual(fs.readFileSync(shared.localPath), sharedContents);
  assert.deepEqual(fs.readFileSync(otherImage.localPath), otherContents);
  assert.equal(await prisma.imageAsset.count({ where: { novelId: novel.id } }), 0);
  assert.equal(await prisma.imageGenerationTask.count({ where: { novelId: novel.id } }), 0);
  for (const image of [sharedReference, otherImage]) {
    assert.deepEqual(await prisma.imageAsset.findUniqueOrThrow({ where: { id: image.asset.id } }), image.asset);
    assert.deepEqual(await prisma.imageGenerationTask.findUniqueOrThrow({ where: { id: image.task.id } }), image.task);
  }
  assert.deepEqual(await prisma.novel.findUniqueOrThrow({ where: { id: other.id } }), other);
  assert.equal(await prisma.novelSideEffectJob.count({ where: { jobType: "novel.deletedFiles", payloadJson: { contains: owned.asset.id } } }), 0, "successful cleanup consumes its receipt");
});

test("删除事务回滚时不清理本地图片或向量", async t => {
  const imageRoot = path.join(temporaryRoot, "storage", "generated-images");
  const file = path.join(imageRoot, "novel-covers", "rollback-novel", "task", "cover.png");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "image");
  const novel = await prisma.novel.create({ data: { title: "回滚小说" } });
  const chunkId = `rollback-chunk-${randomUUID()}`;
  await prisma.knowledgeChunk.create({ data: { id: chunkId, ownerType: "novel", ownerId: novel.id, novelId: novel.id, chunkText: "vector source", chunkHash: randomUUID(), chunkOrder: 0, embedProvider: "test", embedModel: "test" } });
  const originalTransaction = prisma.$transaction;
  let vectorDeleteCalls = 0;
  const { VectorStoreService } = require("../dist/services/rag/VectorStoreService.js");
  const originalVectorDelete = VectorStoreService.prototype.deletePoints;
  VectorStoreService.prototype.deletePoints = async () => { vectorDeleteCalls += 1; };
  prisma.$transaction = async () => { throw new Error("injected transaction failure"); };
  try {
    await assert.rejects(() => new NovelCoreCrudService().deleteNovel(novel.id));
    assert.equal(fs.existsSync(file), true);
    assert.equal(vectorDeleteCalls, 0);
    assert.ok(await prisma.knowledgeChunk.findUnique({ where: { id: chunkId } }));
  } finally {
    prisma.$transaction = originalTransaction;
    VectorStoreService.prototype.deletePoints = originalVectorDelete;
  }
});

test("图片清理只删除本书精确生成目录内的独占现存文件", async t => {
  const { removeOwnedNovelImageFiles } = require("../dist/services/image/novelImageCleanup.js");
  const root = path.join(temporaryRoot, "storage", "generated-images");
  const entries = [
    ["owned", "novel-covers/owned-novel/task/cover.png", true],
    ["shared", "novel-covers/shared-novel/task/cover.png", false],
    ["other", "novel-covers/other-novel/task/cover.png", false],
    ["outside", "../outside.png", false],
    ["nested", "novel-covers/owned-novel/task/nested/cover.png", false],
  ];
  const images = [];
  for (const [id, relative, shouldExist] of entries) {
    const localPath = path.resolve(root, relative);
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, id);
    images.push({ id, taskId: "task", sceneType: "novel_cover", novelId: relative.includes("owned-novel") ? "owned-novel" : relative.includes("shared-novel") ? "shared-novel" : "other-novel", baseCharacterId: null, bookAnalysisCharacterId: null, url: localPath, metadata: JSON.stringify({ localPath }) });
    if (!shouldExist) assert.equal(fs.existsSync(localPath), true);
  }
  const sharedPath = images[1].url;
  const sharedNovel = await prisma.novel.create({ data: { title: "共享图片引用" } });
  const sharedTask = await prisma.imageGenerationTask.create({ data: { id: "shared-task", novelId: sharedNovel.id, sceneType: "novel_cover", provider: "test", model: "test", prompt: "shared" } });
  await prisma.imageAsset.create({ data: { id: "shared-image-ref", novelId: sharedNovel.id, taskId: sharedTask.id, sceneType: "novel_cover", provider: "test", model: "test", url: sharedPath, metadata: JSON.stringify({ localPath: sharedPath }) } });
  const otherNovel = await prisma.novel.create({ data: { title: "另一书图片引用" } });
  const otherTask = await prisma.imageGenerationTask.create({ data: { id: "other-task", novelId: otherNovel.id, sceneType: "novel_cover", provider: "test", model: "test", prompt: "other" } });
  await prisma.imageAsset.create({ data: { id: "other-image-ref", novelId: otherNovel.id, taskId: otherTask.id, sceneType: "novel_cover", provider: "test", model: "test", url: images[2].url, metadata: JSON.stringify({ localPath: images[2].url }) } });
  await removeOwnedNovelImageFiles(images);
  assert.equal(fs.existsSync(images[0].url), false);
  for (const image of images.slice(1)) assert.equal(fs.existsSync(image.url), true, image.id);
  const missing = { ...images[0], url: path.join(root, "novel-covers", "owned-novel", "task", "missing.png"), metadata: JSON.stringify({ localPath: path.join(root, "novel-covers", "owned-novel", "task", "missing.png") }) };
  await assert.doesNotReject(() => removeOwnedNovelImageFiles([missing]));
  assert.equal(fs.existsSync(missing.url), false);
});

test("deleteNovel removes novel tasks in every status and their archive markers before deleting the novel", async (t) => {
  // This mock retains the original task/archive ordering contract.
  const originalTransaction = prisma.$transaction;
  const originalEnqueueDelete = ragServices.ragIndexService.enqueueDelete;
  const calls = [];

  const transaction = {
    shortStoryRevisionJob: { deleteMany: async query => { calls.push(["deleteRevisions", query]); } },
      shortStoryPlan: { deleteMany: async query => { calls.push(["deletePlan", query]); } },
      novelWorkflowTask: { findMany: async () => [] },
      agentRun: { findMany: async () => [] },
      generationJob: { findMany: async () => [] },
      chapter: { findMany: async () => [] },
    novelWorkflowTask: {
      findMany: async (query) => {
        calls.push(["findTasks", query]);
        return [{ id: "workflow_1" }, { id: "workflow_2" }];
      },
      deleteMany: async (query) => {
        calls.push(["deleteTasks", query]);
        return { count: 2 };
      },
    },
    agentRun: {
      findMany: async (query) => {
        calls.push(["findAgentRuns", query]);
        return [{ id: "task_agent_1" }];
      },
      deleteMany: async (query) => {
        calls.push(["deleteAgentRuns", query]);
        return { count: 1 };
      },
    },
    generationJob: {
      findMany: async (query) => {
        calls.push(["findPipelineJobs", query]);
        return [{ id: "task_pipeline_1" }];
      },
    },
    imageGenerationTask: {
      findMany: async (query) => {
        calls.push(["findImageTasks", query]);
        return [{ id: "task_image_1" }];
      },
    },
    taskCenterArchive: {
      deleteMany: async (query) => {
        calls.push(["deleteArchiveMarkers", query]);
        return { count: 1 };
      },
    },
    outlineBookBinding: { deleteMany: async query => { calls.push(["deleteOutlineBindings", query]); } },
    outlineProject: { updateMany: async query => { calls.push(["clearOutlineSource", query]); } },
    novel: {
      delete: async (query) => {
        calls.push(["deleteNovel", query]);
        return { id: "novel_1" };
      },
    },
  };
  transaction.novelWorkflowTask.findMany = async query => { calls.push(["findTasks", query]); return [{ id: "workflow_1" }, { id: "workflow_2" }]; };
  transaction.agentRun.findMany = async query => { calls.push(["findAgentRuns", query]); return [{ id: "task_agent_1" }]; };
  transaction.generationJob.findMany = async query => { calls.push(["findPipelineJobs", query]); return [{ id: "task_pipeline_1" }]; };
  for (const model of ["chapter", "structuredInvocationDiagnostic", "llmInvocationUsageRecord", "directorLlmUsageRecord", "directorEvent", "directorRunCommand", "directorRun", "creationStudioConfirmation", "directorRuntimeEvent", "directorRuntimeExecution", "directorRuntimeCommand", "directorRuntimeInstance", "directorNextArtifact", "directorNextRun", "characterConversationSession", "storyTimelineEvent", "chapterTimeAnchor", "timelineHook", "timelineConstraint", "timelineCheckReport", "ragRetrievalTrace", "styleBinding", "knowledgeBinding", "knowledgeChunk", "ragIndexJob", "imageAsset", "visualAssetProjection", "manuscriptProject", "manuscriptUnit", "manuscriptImportSession"]) {
    transaction[model] ??= { findMany: async () => [], deleteMany: async () => ({ count: 0 }), updateMany: async () => ({ count: 0 }) };
  }

  prisma.$transaction = async (callback) => callback(transaction);
  ragServices.ragIndexService.enqueueDelete = async (ownerType, ownerId) => {
    calls.push(["queueRagDelete", { ownerType, ownerId }]);
  };

  try {
    await new NovelCoreCrudService().deleteNovel("novel_1");

    assert.deepEqual(calls, [
      ["deleteRevisions", { where: { novelId: "novel_1" } }],
      ["deletePlan", { where: { novelId: "novel_1" } }],
      ["findTasks", {
        where: { novelId: "novel_1" },
        select: { id: true },
      }],
      ["findAgentRuns", {
        where: { novelId: "novel_1" },
        select: { id: true },
      }],
      ["findPipelineJobs", {
        where: { novelId: "novel_1" },
        select: { id: true },
      }],
      ["findImageTasks", {
        where: { novelId: "novel_1" },
        select: { id: true },
      }],
      ["findTasks", {
        where: { novelId: "novel_1" },
        select: { id: true },
      }],
      ["findAgentRuns", {
        where: { novelId: "novel_1" },
        select: { id: true },
      }],
      ["findPipelineJobs", {
        where: { novelId: "novel_1" },
        select: { id: true },
      }],
      ["deleteArchiveMarkers", {
        where: {
          OR: [
            { taskKind: "novel_workflow", taskId: { in: ["workflow_1", "workflow_2"] } },
            { taskKind: "agent_run", taskId: { in: ["task_agent_1"] } },
            { taskKind: "novel_pipeline", taskId: { in: ["task_pipeline_1"] } },
            { taskKind: "image_generation", taskId: { in: ["task_image_1"] } },
          ],
        },
      }],
      ["deleteTasks", {
        where: { id: { in: ["workflow_1", "workflow_2"] } },
      }],
      ["deleteAgentRuns", {
        where: { id: { in: ["task_agent_1"] } },
      }],
      ["deleteOutlineBindings", { where: { novelId: "novel_1" } }],
      ["clearOutlineSource", { where: { boundNovelId: "novel_1" }, data: { boundNovelId: null } }],
      ["deleteNovel", { where: { id: "novel_1" } }],
      ["queueRagDelete", { ownerType: "novel", ownerId: "novel_1" }],
      ["queueRagDelete", { ownerType: "bible", ownerId: "novel_1" }],
    ]);
  } finally {
    prisma.$transaction = originalTransaction;
    ragServices.ragIndexService.enqueueDelete = originalEnqueueDelete;
  }
});

test("unfinished short stories delete with Restrict dependents and non-failed workflow tasks", async (t) => {
  const fs = require("node:fs");
  const path = require("node:path");
  const Database = require("better-sqlite3");
  for (const status of ["queued", "running", "waiting_approval", "succeeded", "failed", "cancelled"]) {
    await t.test(status, async () => {
      const shortStoryFile = path.join(temporaryRoot, `short-story-${status}.db`);
      assert.equal(fs.existsSync(shortStoryFile), false);
      console.log("[database safety]", JSON.stringify({ status, url: `file:${shortStoryFile}`, databaseFile: shortStoryFile, existsBefore: false }));
      const db = new Database(shortStoryFile);
      const migrations = path.join(__dirname, "../src/prisma/migrations.sqlite");
      for (const name of fs.readdirSync(migrations).sort()) {
        const file = path.join(migrations, name, "migration.sql");
        if (fs.existsSync(file)) db.exec(fs.readFileSync(file, "utf8"));
      }
      db.pragma("foreign_keys = ON");
      db.exec(`
        INSERT INTO Novel(id, title, narrativeForm, updatedAt) VALUES ('story', 'Unfinished story', 'short_story', CURRENT_TIMESTAMP);
        INSERT INTO Novel(id, title, updatedAt) VALUES ('other', 'Keep this novel', CURRENT_TIMESTAMP);
        INSERT INTO NovelWorkflowTask(id, novelId, lane, title, updatedAt) VALUES ('workflow', 'story', 'short_story', 'Story task', CURRENT_TIMESTAMP);
        INSERT INTO NovelIntentVersion(id, novelId, workflowTaskId, version, originalExpression, structuredIntentJson, updatedAt)
          VALUES ('intent', 'story', 'workflow', 1, 'Story idea', '{}', CURRENT_TIMESTAMP);
        INSERT INTO ShortStoryPlan(id, novelId, intentVersionId, targetWordCount, endingPromise, structureJson, updatedAt)
          VALUES ('plan', 'story', 'intent', 3000, 'An ending', '{}', CURRENT_TIMESTAMP);
        INSERT INTO ShortStorySegment(id, novelId, planId, "order", targetWordCount, updatedAt)
          VALUES ('segment', 'story', 'plan', 1, 1000, CURRENT_TIMESTAMP);
        INSERT INTO ShortStoryRevisionJob(id, novelId, workflowTaskId, intentVersionId, strategy, baselineJson, updatedAt)
          VALUES ('revision', 'story', 'workflow', 'intent', 'revise', '{}', CURRENT_TIMESTAMP);
        INSERT INTO TaskCenterArchive(id, taskKind, taskId) VALUES ('archive', 'novel_workflow', 'workflow');
      `);
      db.prepare("UPDATE NovelWorkflowTask SET status = ? WHERE id = 'workflow'").run(status);
      // The old failed-task pre-cleanup cascades intent versions while the plan
      // still references them. Deleting the novel directly can use another cascade order.
      assert.throws(() => db.prepare("DELETE FROM NovelWorkflowTask WHERE id = 'workflow'").run(), /FOREIGN KEY constraint failed/);

      const byNovel = (table) => ({
        findMany: async ({ where }) => db.prepare(`SELECT id FROM "${table}" WHERE novelId = ?${where.status ? " AND status = ?" : ""}`)
          .all(...(where.status ? [where.novelId, where.status] : [where.novelId])),
        deleteMany: async ({ where }) => where.novelId
          ? db.prepare(`DELETE FROM "${table}" WHERE novelId = ?`).run(where.novelId)
          : db.prepare(`DELETE FROM "${table}" WHERE id IN (${where.id.in.map(() => "?").join(",")})`).run(...where.id.in),
      });
      const transaction = {
        shortStoryRevisionJob: byNovel("ShortStoryRevisionJob"),
        shortStoryPlan: byNovel("ShortStoryPlan"),
        novelWorkflowTask: byNovel("NovelWorkflowTask"),
        agentRun: byNovel("AgentRun"),
        generationJob: byNovel("GenerationJob"),
        imageGenerationTask: byNovel("ImageGenerationTask"),
        taskCenterArchive: { deleteMany: async ({ where }) => {
          for (const clause of where.OR) {
            for (const id of clause.taskId.in) db.prepare("DELETE FROM TaskCenterArchive WHERE taskKind = ? AND taskId = ?").run(clause.taskKind, id);
          }
        } },
        outlineBookBinding: byNovel("OutlineBookBinding"),
        outlineProject: { updateMany: async ({ where, data }) => db.prepare("UPDATE OutlineProject SET boundNovelId = ? WHERE boundNovelId = ?").run(data.boundNovelId, where.boundNovelId) },
        novel: { delete: async ({ where }) => db.prepare("DELETE FROM Novel WHERE id = ?").run(where.id) },
      };
      transaction.novelWorkflowTask.findMany = async query => db.prepare("SELECT id FROM NovelWorkflowTask WHERE novelId = ?").all(query.where.novelId);
      transaction.agentRun.findMany = async query => db.prepare("SELECT id FROM AgentRun WHERE novelId = ?").all(query.where.novelId);
      transaction.generationJob.findMany = async query => db.prepare("SELECT id FROM GenerationJob WHERE novelId = ?").all(query.where.novelId);
      for (const model of ["chapter", "structuredInvocationDiagnostic", "llmInvocationUsageRecord", "directorLlmUsageRecord", "directorEvent", "directorRunCommand", "directorRun", "creationStudioConfirmation", "directorRuntimeEvent", "directorRuntimeExecution", "directorRuntimeCommand", "directorRuntimeInstance", "directorNextArtifact", "directorNextRun", "characterConversationSession", "storyTimelineEvent", "chapterTimeAnchor", "timelineHook", "timelineConstraint", "timelineCheckReport", "ragRetrievalTrace", "styleBinding", "knowledgeBinding", "knowledgeChunk", "ragIndexJob", "imageAsset", "visualAssetProjection", "manuscriptProject", "manuscriptUnit", "manuscriptImportSession"]) {
        transaction[model] ??= { findMany: async () => [], deleteMany: async () => ({ count: 0 }), updateMany: async () => ({ count: 0 }) };
      }
      const originalTransaction = prisma.$transaction;
      const originalEnqueueDelete = ragServices.ragIndexService.enqueueDelete;
      prisma.$transaction = async callback => callback(transaction);
      ragServices.ragIndexService.enqueueDelete = async () => {};
      try {
        await new NovelCoreCrudService().deleteNovel("story");
        for (const table of ["NovelWorkflowTask", "NovelIntentVersion", "ShortStoryPlan", "ShortStorySegment", "ShortStoryRevisionJob", "TaskCenterArchive"]) {
          assert.equal(db.prepare(`SELECT count(*) AS count FROM "${table}"`).get().count, 0, table);
        }
        assert.deepEqual(db.prepare("SELECT id FROM Novel").all(), [{ id: "other" }]);
      } finally {
        prisma.$transaction = originalTransaction;
        ragServices.ragIndexService.enqueueDelete = originalEnqueueDelete;
        db.close();
      }
    });
  }
});
