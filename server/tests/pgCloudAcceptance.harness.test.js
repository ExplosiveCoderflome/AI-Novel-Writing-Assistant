/**
 * Bounded PostgreSQL acceptance harness for the 0.8.2 consolidation candidate.
 *
 * Scope (intentional):
 * - Requires an already-provisioned disposable DATABASE_URL (postgresql://…).
 * - Does not treat raw `prisma migrate deploy` on a historically broken empty-PG
 *   chain as an official pass. The official empty path is
 *   `scripts/deploy-prisma-postgres.cjs --fresh-empty-ok`.
 * - Verifies T1/T2 delete + outline reopen, book-scoped cleanup, image retention
 *   on injected rollback, and #233 penName create/update/clear against the
 *   current Prisma schema (applied by the official deploy script in CI/cloud).
 *
 * Safety: refuses non-postgres URLs and refuses known user/dev database names.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const databaseUrl = process.env.DATABASE_URL || "";
assert.ok(
  databaseUrl.startsWith("postgresql://") || databaseUrl.startsWith("postgres://"),
  "PG harness requires postgresql DATABASE_URL",
);
const forbiddenNames = ["ai_novel", "postgres", "template0", "template1"];
const dbName = (() => {
  try {
    return new URL(databaseUrl).pathname.replace(/^\//, "");
  } catch {
    return "";
  }
})();
assert.ok(dbName, "DATABASE_URL must include a database name");
assert.ok(
  !forbiddenNames.includes(dbName),
  `Refuse shared/default database name: ${dbName}`,
);
assert.match(dbName, /cloud|harness|accept|test|tmp/i, "Database name must look disposable");

const temporaryParent = path.join(__dirname, "../../.tmp");
fs.mkdirSync(temporaryParent, { recursive: true });
const temporaryRoot = fs.mkdtempSync(path.join(temporaryParent, "pg-cloud-accept-"));

Object.assign(process.env, {
  NODE_ENV: "test",
  AI_NOVEL_RUNTIME: "desktop",
  AI_NOVEL_DATABASE_MODE: "postgresql",
  AI_NOVEL_APP_DATA_DIR: temporaryRoot,
  DATABASE_URL: databaseUrl,
  RAG_ENABLED: process.env.RAG_ENABLED || "false",
});

console.log(
  "[pg harness safety]",
  JSON.stringify({ DATABASE_URL: databaseUrl.replace(/:[^:@/]+@/, ":***@"), dbName, temporaryRoot }),
);

const { NovelCoreCrudService } = require("../dist/services/novel/novelCoreCrudService.js");
const { prisma } = require("../dist/db/prisma.js");
const { ragServices } = require("../dist/services/rag/index.js");
const { OutlineOpenBookService } = require("../dist/modules/planning/outline/openBook");
const { createEmptyOutlineDocument } = require("@ai-novel/shared/types/outline");
const { createApp } = require("../dist/app.js");

test.before(async () => {
  const novelColumns = await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Novel' AND column_name = 'penName'`,
  );
  assert.equal(novelColumns.length, 1, "penName column must exist (official migrated schema)");
  const feedback = await prisma.$queryRawUnsafe(
    `SELECT to_regclass('public."OutlineFeedbackRun"')::text AS rel`,
  );
  assert.ok(feedback[0]?.rel, "OutlineFeedbackRun must exist");
  const shortStory = await prisma.$queryRawUnsafe(
    `SELECT to_regclass('public."ShortStoryRevisionJob"')::text AS rel`,
  );
  assert.ok(shortStory[0]?.rel, "ShortStoryRevisionJob must exist");
});

test.after(async () => {
  await prisma.$disconnect();
});

async function outlineFixture(t) {
  t.mock.method(ragServices.ragIndexService, "enqueueDelete", async () => {});
  const id = `pg-delete-outline-${randomUUID()}`;
  const document = createEmptyOutlineDocument("可再次开书的大纲");
  document.story.premise = "主角收到未来的来信";
  document.volumes = [
    {
      nodeId: "v",
      title: "来信",
      summary: "保留卷纲",
      order: 0,
      planningDepth: "rough",
      chapterNodeIds: ["c"],
    },
  ];
  document.chapters = [
    {
      nodeId: "c",
      volumeNodeId: "v",
      order: 0,
      title: "第一封信",
      summary: "保留章纲",
      purpose: "引出悬念",
      planningDepth: "rough",
      characterNodeIds: [],
      payoffNodeIds: [],
    },
  ];
  await prisma.outlineProject.create({
    data: {
      id,
      title: document.story.title,
      currentVersion: 2,
      currentRevisionId: `${id}-r2`,
    },
  });
  for (const version of [1, 2]) {
    await prisma.outlineRevision.create({
      data: {
        id: `${id}-r${version}`,
        projectId: id,
        version,
        documentJson: JSON.stringify(document),
        sourceType: "manual",
      },
    });
  }
  const proposal = await prisma.outlineProposal.create({
    data: {
      projectId: id,
      baseVersion: 2,
      kind: "edit",
      status: "pending",
      proposalJson: "{}",
    },
  });
  const input = {
    revisionId: `${id}-r2`,
    expectedProjectVersion: 2,
    bookSettings: {
      title: document.story.title,
      estimatedChapterCount: 3,
      defaultChapterLength: 3000,
    },
    volumeQuotas: { v: 3 },
    allowOptimize: [],
  };
  const service = new OutlineOpenBookService(prisma, async () => {});
  const open = async (key) => {
    const preview = await service.preview(id, input);
    return service.confirm(id, {
      ...input,
      requestHash: preview.requestHash,
      idempotencyKey: `${id}-${key}`,
    });
  };
  const binding = await open("first");
  const revisions = await prisma.outlineRevision.findMany({
    where: { projectId: id },
    orderBy: { version: "asc" },
  });
  return { id, input, service, open, binding, revisions, proposal };
}

async function localImageFixture(novelId, filename = "cover.png", existingPath) {
  const task = await prisma.imageGenerationTask.create({
    data: {
      novelId,
      sceneType: "novel_cover",
      provider: "test",
      model: "test",
      prompt: "isolated local image",
    },
  });
  const localPath =
    existingPath ||
    path.join(
      temporaryRoot,
      "storage",
      "generated-images",
      "novel-covers",
      novelId,
      task.id,
      filename,
    );
  if (!existingPath) {
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, `fixture:${novelId}:${filename}`);
  }
  const asset = await prisma.imageAsset.create({
    data: {
      novelId,
      taskId: task.id,
      sceneType: "novel_cover",
      provider: "test",
      model: "test",
      url: localPath,
      metadata: JSON.stringify({ localPath }),
    },
  });
  return { task, asset, localPath };
}

test("PG T1: 大纲开书小说可删除并保留大纲后重新开书", async (t) => {
  const f = await outlineFixture(t);
  await assert.rejects(
    () => prisma.novel.delete({ where: { id: f.binding.novelId } }),
    (error) => error.code === "P2003",
  );
  const other = await prisma.novel.create({ data: { title: "保留的其他小说" } });
  const otherProject = await prisma.outlineProject.create({
    data: { title: "其他大纲", boundNovelId: other.id },
  });

  await new NovelCoreCrudService().deleteNovel(f.binding.novelId);

  assert.equal(await prisma.novel.findUnique({ where: { id: f.binding.novelId } }), null);
  assert.equal(
    await prisma.outlineBookBinding.count({
      where: { OR: [{ novelId: f.binding.novelId }, { projectId: f.id }] },
    }),
    0,
  );
  const project = await prisma.outlineProject.findUniqueOrThrow({ where: { id: f.id } });
  assert.equal(project.boundNovelId, null);
  assert.equal(project.currentRevisionId, f.input.revisionId);
  assert.equal(project.currentVersion, 2);
  assert.deepEqual(
    await prisma.outlineRevision.findMany({ where: { projectId: f.id }, orderBy: { version: "asc" } }),
    f.revisions,
  );
  assert.deepEqual(await prisma.outlineProposal.findUnique({ where: { id: f.proposal.id } }), f.proposal);
  assert.equal(await f.service.getBinding(f.id), null);
  assert.equal(
    (await prisma.outlineProject.findUniqueOrThrow({ where: { id: otherProject.id } })).boundNovelId,
    other.id,
  );
  assert.ok(await prisma.novel.findUnique({ where: { id: other.id } }));

  const reopened = await f.open("second");
  assert.equal(reopened.replayed, false);
  assert.equal(
    (await prisma.outlineBookBinding.findUniqueOrThrow({ where: { projectId: f.id } })).requestKey,
    `${f.id}-second`,
  );
  assert.equal(await prisma.outlineBookBinding.count({ where: { projectId: f.id } }), 1);
  assert.equal(
    (await prisma.outlineProject.findUniqueOrThrow({ where: { id: f.id } })).boundNovelId,
    reopened.novelId,
  );
  assert.ok(await prisma.novel.findUnique({ where: { id: reopened.novelId } }));
  assert.equal(await prisma.chapter.count({ where: { novelId: reopened.novelId } }), 1);
  assert.equal(await prisma.volumePlanVersion.count({ where: { novelId: reopened.novelId } }), 1);
});

test("PG T2: 删除按小说隔离诊断、调用原文与导演记录", async () => {
  const novel = await prisma.novel.create({ data: { title: "待删除小说" } });
  const other = await prisma.novel.create({ data: { title: "保留小说" } });
  const task = await prisma.novelWorkflowTask.create({
    data: { novelId: novel.id, lane: "auto_director", title: "本书导演任务", status: "failed" },
  });
  const otherTask = await prisma.novelWorkflowTask.create({
    data: {
      novelId: other.id,
      lane: "auto_director",
      title: "另一书导演任务",
      status: "waiting_approval",
    },
  });
  const diagnostic = async (id, novelId, taskId, raw) =>
    prisma.structuredInvocationDiagnostic.create({
      data: {
        id,
        invocationId: id,
        attempt: 1,
        novelId,
        taskId,
        promptId: "delete-test",
        kind: "validation",
        strategy: "retry",
        detailsJson: raw,
      },
    });
  const ids = {
    diagTarget: `pg-diag-target-${randomUUID()}`,
    diagOther: `pg-diag-other-${randomUUID()}`,
    usageTarget: `pg-usage-target-${randomUUID()}`,
    usageOther: `pg-usage-other-${randomUUID()}`,
    runTarget: `pg-run-target-${randomUUID()}`,
    runOther: `pg-run-other-${randomUUID()}`,
    commandTarget: `pg-command-target-${randomUUID()}`,
    commandOther: `pg-command-other-${randomUUID()}`,
    archiveTarget: `pg-archive-target-${randomUUID()}`,
    archiveOther: `pg-archive-other-${randomUUID()}`,
    eventTarget: `pg-event-target-${randomUUID()}`,
    eventOther: `pg-event-other-${randomUUID()}`,
    directorUsageTarget: `pg-director-usage-target-${randomUUID()}`,
    directorUsageOther: `pg-director-usage-other-${randomUUID()}`,
  };
  await diagnostic(ids.diagTarget, novel.id, task.id, "SECRET_TARGET_DIAGNOSTIC");
  await diagnostic(ids.diagOther, other.id, otherTask.id, "SECRET_OTHER_DIAGNOSTIC");
  const usage = async (id, novelId, workflowTaskId, raw) =>
    prisma.llmInvocationUsageRecord.create({
      data: {
        id,
        novelId,
        workflowTaskId,
        requestProtocol: "responses",
        status: "succeeded",
        startedAt: new Date(),
        finishedAt: new Date(),
        cacheUsageStatus: "not_reported",
        payload: {
          create: {
            compressed: Buffer.from(raw),
            compressedBytes: Buffer.byteLength(raw),
          },
        },
      },
    });
  await usage(ids.usageTarget, novel.id, task.id, "SECRET_TARGET_PROMPT_AND_ANSWER");
  await usage(ids.usageOther, other.id, otherTask.id, "SECRET_OTHER_PROMPT_AND_ANSWER");
  const targetChunkId = `pg-target-chunk-${randomUUID()}`;
  const otherChunkId = `pg-other-chunk-${randomUUID()}`;
  await prisma.knowledgeChunk.create({
    data: {
      id: targetChunkId,
      ownerType: "novel",
      ownerId: novel.id,
      novelId: novel.id,
      chunkText: "SECRET_TARGET_RAG_TEXT",
      chunkHash: randomUUID(),
      chunkOrder: 0,
      embedProvider: "test",
      embedModel: "test",
    },
  });
  await prisma.knowledgeChunk.create({
    data: {
      id: otherChunkId,
      ownerType: "novel",
      ownerId: other.id,
      novelId: other.id,
      chunkText: "SECRET_OTHER_RAG_TEXT",
      chunkHash: randomUUID(),
      chunkOrder: 0,
      embedProvider: "test",
      embedModel: "test",
    },
  });
  await prisma.directorRun.create({
    data: { id: ids.runTarget, taskId: task.id, novelId: novel.id, policyJson: "target-policy" },
  });
  await prisma.directorRun.create({
    data: { id: ids.runOther, taskId: otherTask.id, novelId: other.id, policyJson: "other-policy" },
  });
  await prisma.directorRunCommand.create({
    data: {
      id: ids.commandTarget,
      novelId: novel.id,
      taskId: task.id,
      commandType: "continue",
      idempotencyKey: `pg-target-${randomUUID()}`,
      payloadJson: "SECRET_target_COMMAND",
    },
  });
  await prisma.directorRunCommand.create({
    data: {
      id: ids.commandOther,
      novelId: other.id,
      taskId: otherTask.id,
      commandType: "continue",
      idempotencyKey: `pg-other-${randomUUID()}`,
      payloadJson: "SECRET_other_COMMAND",
    },
  });
  await prisma.taskCenterArchive.create({
    data: { id: ids.archiveTarget, taskKind: "novel_workflow", taskId: task.id },
  });
  await prisma.taskCenterArchive.create({
    data: { id: ids.archiveOther, taskKind: "novel_workflow", taskId: otherTask.id },
  });
  await prisma.directorEvent.create({
    data: {
      id: ids.eventTarget,
      runId: ids.runTarget,
      taskId: task.id,
      novelId: novel.id,
      type: "test",
      summary: "SECRET_TARGET_EVENT",
      occurredAt: new Date(),
    },
  });
  await prisma.directorEvent.create({
    data: {
      id: ids.eventOther,
      runId: ids.runOther,
      taskId: otherTask.id,
      novelId: other.id,
      type: "test",
      summary: "SECRET_OTHER_EVENT",
      occurredAt: new Date(),
    },
  });
  await prisma.directorLlmUsageRecord.create({
    data: {
      id: ids.directorUsageTarget,
      novelId: novel.id,
      taskId: task.id,
      runId: ids.runTarget,
      metadataJson: "SECRET_TARGET_DIRECTOR_USAGE",
    },
  });
  await prisma.directorLlmUsageRecord.create({
    data: {
      id: ids.directorUsageOther,
      novelId: other.id,
      taskId: otherTask.id,
      runId: ids.runOther,
      metadataJson: "SECRET_OTHER_DIRECTOR_USAGE",
    },
  });
  const otherSnapshot = {
    diagnostic: await prisma.structuredInvocationDiagnostic.findUniqueOrThrow({
      where: { id: ids.diagOther },
    }),
    usage: await prisma.llmInvocationUsageRecord.findUniqueOrThrow({
      where: { id: ids.usageOther },
      include: { payload: true },
    }),
    run: await prisma.directorRun.findUniqueOrThrow({ where: { id: ids.runOther } }),
    event: await prisma.directorEvent.findUniqueOrThrow({ where: { id: ids.eventOther } }),
    directorUsage: await prisma.directorLlmUsageRecord.findUniqueOrThrow({
      where: { id: ids.directorUsageOther },
    }),
    command: await prisma.directorRunCommand.findUniqueOrThrow({ where: { id: ids.commandOther } }),
    archive: await prisma.taskCenterArchive.findUniqueOrThrow({ where: { id: ids.archiveOther } }),
  };

  const { VectorStoreService } = require("../dist/services/rag/VectorStoreService.js");
  const originalVectorDelete = VectorStoreService.prototype.deletePoints;
  const deletedVectors = [];
  VectorStoreService.prototype.deletePoints = async (ids) => {
    deletedVectors.push(...ids);
  };
  try {
    await new NovelCoreCrudService().deleteNovel(novel.id);
  } finally {
    VectorStoreService.prototype.deletePoints = originalVectorDelete;
  }

  assert.equal(await prisma.structuredInvocationDiagnostic.findUnique({ where: { id: ids.diagTarget } }), null);
  assert.equal(await prisma.llmInvocationUsageRecord.findUnique({ where: { id: ids.usageTarget } }), null);
  assert.equal(await prisma.directorRun.findUnique({ where: { id: ids.runTarget } }), null);
  assert.equal(await prisma.knowledgeChunk.findUnique({ where: { id: targetChunkId } }), null);
  assert.ok(await prisma.knowledgeChunk.findUnique({ where: { id: otherChunkId } }));
  assert.deepEqual(deletedVectors, [targetChunkId]);
  assert.deepEqual(
    await prisma.structuredInvocationDiagnostic.findUniqueOrThrow({ where: { id: ids.diagOther } }),
    otherSnapshot.diagnostic,
  );
  assert.deepEqual(
    await prisma.llmInvocationUsageRecord.findUniqueOrThrow({
      where: { id: ids.usageOther },
      include: { payload: true },
    }),
    otherSnapshot.usage,
  );
  assert.deepEqual(
    await prisma.directorRun.findUniqueOrThrow({ where: { id: ids.runOther } }),
    otherSnapshot.run,
  );
  assert.deepEqual(
    await prisma.directorEvent.findUniqueOrThrow({ where: { id: ids.eventOther } }),
    otherSnapshot.event,
  );
  assert.deepEqual(
    await prisma.directorLlmUsageRecord.findUniqueOrThrow({ where: { id: ids.directorUsageOther } }),
    otherSnapshot.directorUsage,
  );
  assert.deepEqual(
    await prisma.directorRunCommand.findUniqueOrThrow({ where: { id: ids.commandOther } }),
    otherSnapshot.command,
  );
  assert.deepEqual(
    await prisma.taskCenterArchive.findUniqueOrThrow({ where: { id: ids.archiveOther } }),
    otherSnapshot.archive,
  );
});

test("PG T2: 完整 deleteNovel 删除本书独占图片并保留共享/另一书", async (t) => {
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
  for (const image of [sharedReference, otherImage]) {
    assert.deepEqual(await prisma.imageAsset.findUniqueOrThrow({ where: { id: image.asset.id } }), image.asset);
  }
  assert.deepEqual(await prisma.novel.findUniqueOrThrow({ where: { id: other.id } }), other);
});

test("PG: 删除事务注入失败时不清理本地图片", async () => {
  const imageRoot = path.join(temporaryRoot, "storage", "generated-images");
  const file = path.join(imageRoot, "novel-covers", "rollback-novel", "task", "cover.png");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "image");
  const novel = await prisma.novel.create({ data: { title: "回滚小说" } });
  const chunkId = `pg-rollback-chunk-${randomUUID()}`;
  await prisma.knowledgeChunk.create({
    data: {
      id: chunkId,
      ownerType: "novel",
      ownerId: novel.id,
      novelId: novel.id,
      chunkText: "vector source",
      chunkHash: randomUUID(),
      chunkOrder: 0,
      embedProvider: "test",
      embedModel: "test",
    },
  });
  const originalTransaction = prisma.$transaction;
  let vectorDeleteCalls = 0;
  const { VectorStoreService } = require("../dist/services/rag/VectorStoreService.js");
  const originalVectorDelete = VectorStoreService.prototype.deletePoints;
  VectorStoreService.prototype.deletePoints = async () => {
    vectorDeleteCalls += 1;
  };
  prisma.$transaction = async () => {
    throw new Error("injected transaction failure");
  };
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

test("PG #233: penName create/update/clear persists via CRUD and HTTP (recommendation mocked)", async (t) => {
  const crud = new NovelCoreCrudService();
  const created = await crud.createNovel({ title: `pg-pen-crud-${Date.now()}`, penName: "雾港夜行" });
  assert.equal(created.penName, "雾港夜行");
  assert.equal((await prisma.novel.findUniqueOrThrow({ where: { id: created.id } })).penName, "雾港夜行");
  const updated = await crud.updateNovel(created.id, { penName: "夜行雾港" });
  assert.equal(updated.penName, "夜行雾港");
  const cleared = await crud.updateNovel(created.id, { penName: null });
  assert.equal(cleared.penName, null);
  assert.equal((await prisma.novel.findUniqueOrThrow({ where: { id: created.id } })).penName, null);
  await crud.deleteNovel(created.id);

  const {
    NovelCreateResourceRecommendationService,
  } = require("../dist/services/novel/NovelCreateResourceRecommendationService.js");
  const originalRecommend = NovelCreateResourceRecommendationService.prototype.resolveRequired;
  t.after(() => {
    NovelCreateResourceRecommendationService.prototype.resolveRequired = originalRecommend;
  });
  NovelCreateResourceRecommendationService.prototype.resolveRequired = async () => ({
    genreId: undefined,
    primaryStoryModeId: undefined,
    secondaryStoryModeId: undefined,
    recommendation: {
      summary: "pg harness mock",
      genre: null,
      primaryStoryMode: null,
      secondaryStoryMode: null,
      powerSystem: { mode: "none", reason: "mock", source: "ai_recommended" },
      caution: null,
      recommendedAt: new Date().toISOString(),
    },
    promptBlock: "pg harness mock",
  });

  const app = createApp();
  const server = http.createServer(app);
  const port = await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
  let novelId = null;
  try {
    const createResponse = await fetch(`http://127.0.0.1:${port}/api/novels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `pg-pen-http-${Date.now()}`, penName: "雾港夜行" }),
    });
    assert.equal(createResponse.status, 201);
    const createPayload = await createResponse.json();
    assert.equal(createPayload.success, true);
    assert.equal(createPayload.data.penName, "雾港夜行");
    novelId = createPayload.data.id;

    const updateResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ penName: "夜行雾港" }),
    });
    assert.equal(updateResponse.status, 200);
    assert.equal((await updateResponse.json()).data.penName, "夜行雾港");

    const clearResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ penName: null }),
    });
    assert.equal(clearResponse.status, 200);
    assert.equal((await clearResponse.json()).data.penName, null);

    const detail = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}`);
    assert.equal((await detail.json()).data.penName, null);
  } finally {
    if (novelId) {
      try {
        await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}`, { method: "DELETE" });
      } catch {
        // ignore cleanup
      }
    }
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
