const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createRequire } = require('node:module');
const localRequire = createRequire(path.resolve(__dirname, '../../package.json'));
const { request, harness, copy } = require('./application/harness.cjs');

async function setup(t, options = {}) {
  const migration = path.resolve(__dirname, '../../src/prisma/migrations.sqlite/20261022151000_production_unit_run/migration.sql');
  assert.ok(fs.existsSync(migration), 'approved ProductionUnitRun migration must exist');
  const target = path.resolve(__dirname, '../../dist/modules/production/infrastructure/progressStore.js');
  assert.ok(fs.existsSync(target), 'Prisma progress store must be built');
  const { PrismaUnitProgressStore } = require(target);
  assert.equal(typeof PrismaUnitProgressStore, 'function');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'production-kernel-'));
  const file = path.join(directory, 'isolated.sqlite');
  const Database = localRequire('better-sqlite3');
  const sqlite = new Database(file);
  sqlite.pragma('foreign_keys = ON');
  if (options.fullSchema) sqlite.exec(require('./persistence/sqliteFixture.cjs').fullSchemaSql());
  else {
  // This test exercises the additive migration against its existing foreign-key owners.
  sqlite.exec('CREATE TABLE "Novel" ("id" TEXT PRIMARY KEY); CREATE TABLE "Chapter" ("id" TEXT PRIMARY KEY, "novelId" TEXT NOT NULL, "order" INTEGER NOT NULL, "content" TEXT, "updatedAt" DATETIME NOT NULL, "generationState" TEXT NOT NULL DEFAULT \'planned\', "chapterStatus" TEXT DEFAULT \'unplanned\');');
  sqlite.prepare('INSERT INTO "Novel" ("id") VALUES (?)').run('novel-1');
  sqlite.prepare('INSERT INTO "Chapter" ("id", "novelId", "order", "content", "updatedAt") VALUES (?, ?, ?, ?, ?)').run('chapter-1', 'novel-1', 1, '', new Date(0).toISOString());
  sqlite.exec(`CREATE TABLE "ChapterArtifactSyncCheckpoint" (
    "id" TEXT NOT NULL PRIMARY KEY, "novelId" TEXT NOT NULL, "chapterId" TEXT NOT NULL, "contentHash" TEXT NOT NULL,
    "artifactType" TEXT NOT NULL, "syncMode" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'succeeded', "sourceType" TEXT,
    "sourceStage" TEXT, "metadataJson" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
    UNIQUE ("novelId", "chapterId", "contentHash", "artifactType", "syncMode"));`);
  sqlite.exec(fs.readFileSync(migration, 'utf8'));
  }
  sqlite.exec('CREATE TABLE "KernelTestLease" ("id" INTEGER PRIMARY KEY, "active" INTEGER NOT NULL, "token" TEXT NOT NULL); INSERT INTO "KernelTestLease" VALUES (1, 1, \'lease-1\');');
  const tableInfo = sqlite.prepare('PRAGMA foreign_key_list("ProductionUnitRun")').all();
  assert.equal(tableInfo.length, 2);
  sqlite.close();
  const { PrismaClient } = localRequire('@prisma/client');
  const { PrismaBetterSqlite3 } = localRequire('@prisma/adapter-better-sqlite3');
  const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${file}` }) });
  t.after(async () => {
    await db.$disconnect();
    // Only this test-created, known temporary directory is eligible for removal.
    assert.equal(path.dirname(directory), os.tmpdir());
    assert.ok(path.basename(directory).startsWith('production-kernel-'));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  if (options.fullSchema) {
    await db.novel.create({data:{id:'novel-1',title:'测试书'}});
    await db.chapter.create({data:{id:'chapter-1',novelId:'novel-1',title:'测试章',order:1,content:''}});
  }
  // Seed the timestamp through the real adapter so equality uses its DateTime storage format.
  await db.chapter.update({ where: { id: 'chapter-1' }, data: { updatedAt: new Date(1) }, select: { id: true } });
  const assertOwnership = async tx => {
    const rows = await tx.$queryRaw`SELECT "active" FROM "KernelTestLease" WHERE "id" = ${1}`;
    if (rows[0]?.active !== 1) throw new Error('ownership lost');
  };
  const store = new PrismaUnitProgressStore(db, { assertOwnership });
  return { db, store, makeStore: (writeChapter, finalizeChapter) => new PrismaUnitProgressStore(db, {
    assertOwnership, writeChapter, finalizeChapter,
  }), revoke: async () => { await db.$executeRaw`UPDATE "KernelTestLease" SET "active" = ${0} WHERE "id" = ${1}`; } };
}

test('SQLite additive migration, ownership, per-job identity and optimistic CAS', async t => {
  const { db, store, revoke } = await setup(t);
  const req = request();
  const first = await store.loadOrCreate(req);
  assert.equal(first.version, 1);
  assert.equal((await store.loadOrCreate(req)).id, first.id);
  assert.notEqual((await store.loadOrCreate(request({ ownerKey: 'job-2' }))).id, first.id);
  await assert.rejects(store.loadOrCreate(request({ unit: { novelId: 'other-book', chapterId: 'chapter-1', order: 1 } })), { name: 'InvalidProductionRequestError' });
  await assert.rejects(store.loadOrCreate(request({ model: { ...req.model, model: 'changed' } })), { name: 'ProductionSnapshotConflictError' });
  const update = { progress: { ...first.progress, completed: ['prepare'] }, artifacts: first.artifacts, activeStage: null, activeRequestKey: null };
  const results = await Promise.all([store.compareAndSwap(first, update), store.compareAndSwap(first, update)]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal((await store.loadOrCreate(req)).version, 2);
  await revoke();
  await assert.rejects(store.compareAndSwap(results.find(Boolean), update), /ownership lost/);
  assert.equal((await db.productionUnitRun.findUnique({ where: { id: first.id } })).version, 2);
});
for (const crashAfter of ['draft', 'repair', 'commit']) test(`SQLite crash after durable ${crashAfter} resumes without duplicate calls`, async t => {
  const { store } = await setup(t);
  const { runUnit } = require('../../dist/modules/production/application');
  let crashed = false;
  const ports = harness({ originalVerdict: { issues: [{ code: 'gap', severity: 'high', patchable: true }] } });
  const originalSave = store.compareAndSwap.bind(store);
  ports.store = { loadOrCreate: store.loadOrCreate.bind(store), compareAndSwap: async (...args) => {
    const saved = await originalSave(...args);
    if (!crashed && saved?.progress.completed.includes(crashAfter)) { crashed = true; throw new Error('simulated exit after commit'); }
    return saved;
  } };
  await assert.rejects(runUnit(request(), ports), /simulated exit after commit/);
  // New repository instance/ports retain no application progress in memory.
  ports.store = store;
  const result = await runUnit(request(), ports);
  assert.equal(result.status, 'completed');
  assert.equal(result.progress.selected, 'candidate');
  for (const stage of ['draft', 'repair', 'commit']) assert.equal(ports.calls.filter(x => x === stage).length, 1);
});
test('SQLite refuses lost ownership after a model call and leaves the manuscript result uncommitted', async t => {
  const { store, revoke, db } = await setup(t);
  const { runUnit } = require('../../dist/modules/production/application');
  const ports = harness({ execute: async stage => { if (stage === 'draft') await revoke(); } });
  ports.store = store;
  await assert.rejects(runUnit(request(), ports), /ownership lost/);
  const saved = await db.productionUnitRun.findFirst();
  assert.equal(JSON.parse(saved.progressJson).original, undefined);
  assert.equal(saved.activeStage, 'draft');
});
for (const scenario of ['empty', 'repair-failure']) test(`SQLite serializes optional domain fields: ${scenario}`, async t => {
  const { store } = await setup(t);
  const { runUnit } = require('../../dist/modules/production/application');
  const ports = harness({ originalVerdict: { issues: [{ code: 'gap', severity: 'high', patchable: true }] },
    execute: async stage => {
      if (scenario === 'empty' && stage === 'draft') return { result: { stage, contentHash: null } };
      if (scenario === 'repair-failure' && stage === 'repair') return { result: { stage, outcome: 'failed' } };
    },
  });
  ports.store = store;
  const result = await runUnit(request(), ports);
  assert.equal(result.status, scenario === 'empty' ? 'failed' : 'completed');
});
for (const edited of [false, true]) test(`atomic chapter commit ${edited ? 'rolls back progress after human edit' : 'persists chapter and receipt together'}`, async t => {
  const { db, makeStore } = await setup(t, {fullSchema:true});
  const target = path.resolve(__dirname, '../../dist/modules/production/infrastructure/lifecycle/ProductionChapterLifecycleService.js');
  assert.ok(fs.existsSync(target), 'approved kernel lifecycle writer must be built');
  const { ProductionChapterLifecycleService } = require(target);
  const lifecycle = new ProductionChapterLifecycleService();
  const store = makeStore(lifecycle.commit.bind(lifecycle), lifecycle.finalizeSelected.bind(lifecycle));
  const { runUnit } = require('../../dist/modules/production/application');
  const baseline = await db.chapter.findFirst({ select: { content: true, updatedAt: true } });
  const ports = harness({ execute: async (stage, row) => {
    if (stage !== 'commit') return;
    if (edited) await db.chapter.update({ where: { id: 'chapter-1' }, data: { content: 'human edit' }, select: { id: true } });
    return { result: { stage, contentHash: row.progress.selectedContentHash },
      chapterWrite: { expected: { content: baseline.content, updatedAt: baseline.updatedAt.toISOString() }, content: row.artifacts.original,
        generationState: 'drafted', chapterStatus: 'pending_review' } };
  } });
  ports.store = store;
  const assess = ports.stages.accept.execute;
  ports.stages.accept.execute = async (...args) => ({...await assess(...args), artifacts:{stageData:{accept:require('./application/assessmentFixture.cjs').assessmentResult()}}});
  if (edited) await assert.rejects(runUnit(request(), ports), { name: 'ProductionVersionConflictError' });
  else assert.equal((await runUnit(request(), ports)).status, 'completed');
  const row = await db.productionUnitRun.findFirst();
  const chapter = await db.chapter.findFirst({ select: { content: true } });
  assert.equal(chapter.content, edited ? 'human edit' : 'original');
  assert.equal(JSON.parse(row.progressJson).completed.includes('commit'), !edited);
  assert.equal(Boolean(JSON.parse(row.stageArtifactsJson).receipts.commit), !edited);
});

async function checkpointFixture(t) {
  const { db, store } = await setup(t);
  const { hashProductionContent } = require('../../dist/modules/production/application');
  const { PrismaArtifactCheckpointStore } = require('../../dist/modules/production/infrastructure/storyState/checkpointStore');
  const run = await store.loadOrCreate(request());
  const contentHash = hashProductionContent('original');
  await store.compareAndSwap(run, { progress: { ...run.progress, selected: 'original', selectedContentHash: contentHash, committedContentHash: contentHash },
    artifacts: run.artifacts, activeStage: 'reconcile', activeRequestKey: 'unit-request' });
  await db.chapter.update({ where: { id: 'chapter-1' }, data: { content: 'original' }, select: { id: true } });
  const checkpoints = new PrismaArtifactCheckpointStore(db, async (tx, identity) => {
    const rows = await tx.$queryRaw`SELECT "active", "token" FROM "KernelTestLease" WHERE "id" = ${1}`;
    if (rows[0]?.active !== 1 || rows[0]?.token !== identity.executionToken) throw new Error('ownership lost');
  });
  const identity = { runId: run.id, ownerKey: run.ownerKey, novelId: 'novel-1', chapterId: 'chapter-1', contentHash,
    unitRequestKey: 'unit-request', stepKey: 'step-1', step: 'extraction', executionToken: 'lease-1', kind: 'model' };
  return { db, checkpoints, identity };
}
test('SQLite extraction checkpoint persists its full result and rejects a stale manuscript', async t => {
  const { db, checkpoints, identity } = await checkpointFixture(t);
  const claimed = await checkpoints.claim(identity);
  assert.equal(claimed.status, 'claimed');
  await checkpoints.succeed(claimed.claim, { summary: 'saved structured result' });
  assert.deepEqual(await checkpoints.claim(identity), { status: 'cached', value: { summary: 'saved structured result' } });
  await db.chapter.update({ where: { id: 'chapter-1' }, data: { content: 'edited' }, select: { id: true } });
  await assert.rejects(checkpoints.claim(identity), { name: 'ProductionVersionConflictError' });
});
test('SQLite replacement ownership cannot re-dispatch an unresolved model call', async t => {
  const { db, checkpoints, identity } = await checkpointFixture(t);
  const first = await checkpoints.claim(identity);
  await db.$executeRaw`UPDATE "KernelTestLease" SET "token" = ${'lease-2'} WHERE "id" = ${1}`;
  assert.equal((await checkpoints.claim({ ...identity, executionToken: 'lease-2' })).status, 'unknown');
  await assert.rejects(checkpoints.succeed(first.claim, { stale: true }), /ownership lost/);
});
test('SQLite recover-only model lookup never creates or changes a checkpoint', async t => {
  const { db, checkpoints, identity } = await checkpointFixture(t);
  assert.equal((await checkpoints.claim(identity, { existingOnly: true })).status, 'not_started');
  assert.equal(await db.chapterArtifactSyncCheckpoint.count(), 0);
  const claimed = await checkpoints.claim(identity);
  const before = await db.chapterArtifactSyncCheckpoint.findFirst();
  assert.equal((await checkpoints.claim(identity, { existingOnly: true })).status, 'unknown');
  assert.deepEqual(await db.chapterArtifactSyncCheckpoint.findFirst(), before);
  await checkpoints.succeed(claimed.claim, { saved: true });
  assert.deepEqual(await checkpoints.claim(identity, { existingOnly: true }), { status: 'cached', value: { saved: true } });
});
test('SQLite idempotent consumers can be reclaimed by a new durable owner but old claims cannot finish', async t => {
  const { db, checkpoints, identity } = await checkpointFixture(t);
  identity.kind = 'consumer'; identity.step = 'summary_facts';
  const first = await checkpoints.claim(identity);
  assert.equal((await checkpoints.claim(identity)).status, 'busy');
  await db.$executeRaw`UPDATE "KernelTestLease" SET "token" = ${'lease-2'} WHERE "id" = ${1}`;
  const second = await checkpoints.claim({ ...identity, executionToken: 'lease-2' });
  assert.equal(second.status, 'claimed');
  await assert.rejects(checkpoints.succeed(first.claim, { stale: true }), /ownership lost/);
  await checkpoints.succeed(second.claim, { complete: true });
  assert.equal((await checkpoints.claim(second.claim.identity)).status, 'cached');
});
test('SQLite consumer failures have a bounded retry and never masquerade as succeeded', async t => {
  const { checkpoints, identity } = await checkpointFixture(t);
  identity.kind = 'consumer'; identity.step = 'payoff';
  for (let attempt = 0; attempt < 2; attempt++) {
    const claimed = await checkpoints.claim(identity);
    assert.equal(claimed.status, 'claimed');
    await checkpoints.fail(claimed.claim);
  }
  assert.equal((await checkpoints.claim(identity)).status, 'exhausted');
});

async function assembledFixture(t, options = {}) {
  const fixture = await setup(t, {fullSchema:true});
  const kernel = require('../../dist/modules/production');
  const calls = [];
  let failConsumer = !!options.failConsumer;
  const lifecycle = new kernel.ProductionChapterLifecycleService();
  const req = request(options.manual ? { policy: { blockingAction: 'pause_for_manual' } } : {});
  const makePorts = () => {
    const store = fixture.makeStore(lifecycle.commit.bind(lifecycle), lifecycle.finalizeSelected.bind(lifecycle));
    const fence = async row => {
      const chapter = await fixture.db.chapter.findFirst({ where: { id: row.progress.unit.chapterId, novelId: row.progress.unit.novelId }, select: { content: true } });
      if (row.progress.committedContentHash && kernel.hashProductionContent(chapter.content ?? '') !== row.progress.committedContentHash) throw new kernel.ProductionVersionConflictError();
    };
    const checkpoints = new kernel.PrismaArtifactCheckpointStore(fixture.db, async (tx, identity) => {
      const lease = await tx.$queryRaw`SELECT "active", "token" FROM "KernelTestLease" WHERE "id" = ${1}`;
      if (lease[0]?.active !== 1 || lease[0]?.token !== identity.executionToken) throw new Error('ownership lost');
    });
    const reconcile = kernel.createReconcileStage({ executionToken: () => 'lease-1', ports: {
      checkpoints, fence: async context => fence(context.run), reserve: async () => true,
      extraction: { prepare: async () => ({ inputFingerprint: 'frozen-ledger-input', outputTokens: 100, input: {} }),
        invoke: async () => { calls.push('extract'); return { summary: '结果' }; }, validate: value => value },
      consumers: Object.fromEntries(kernel.ARTIFACT_CONSUMERS.map(name => [name, { apply: async () => {
        calls.push(name);
        if (name === 'payoff' && failConsumer) { failConsumer = false; throw new Error('temporary consumer failure'); }
        return { count: 1 };
      } }])),
    } });
    const services = {
      purpose: 'automatic',
      readBaseline: async () => { const chapter = await fixture.db.chapter.findFirst({ select: { content: true, updatedAt: true } });
        return { content: chapter.content, updatedAt: chapter.updatedAt.toISOString(), protectedUserContent: false }; },
      prepare: async () => ({ novelTitle: '书', chapterTitle: '章', contextPackage: {} }),
      describe: async (stage, run, input) => ({ callsModel: ['draft', 'accept', 'repair', 'verify'].includes(stage),
        ...(req.profile.outputBudgets[stage] ? { outputTokens: req.profile.outputBudgets[stage] } : {}),
        inputFingerprint: kernel.hashProductionContent(JSON.stringify(input)), input, promptVersion: 'v1', configVersion: 'v1' }),
      scoped: async (run, invocation, operation) => operation(),
      write: async () => { calls.push('draft'); return 'original'; },
      assess: async input => {
        const candidate = input.content === 'candidate'; calls.push(candidate ? 'verify' : 'accept');
        return require('./application/assessmentFixture.cjs').assessmentResult({ status: candidate ? 'accepted' : 'repairable',
          blockingIssues: candidate ? [] : [{ code: 'gap', severity: 'high', category: 'plot', evidence: 'original', fixSuggestion: '补动作' }],
          missingObligations: [], repairDirectives: options.manual ? [] : [{ mode: 'patch', target: 'plot', instruction: '补动作' }],
          repairability: 'none', riskTags: [], ...(candidate ? { repairVerification: { contentHash: kernel.hashProductionContent('candidate'), checks: [],
            factPreservation: { sourceContentHash: kernel.hashProductionContent('original'), status: 'preserved', correctionIssueIds: [], currentEvidence: 'candidate', reason: '保留' } } } : {}) });
      },
      repair: async () => { calls.push('repair'); return { content: 'candidate' }; },
      knownRepairFailure: () => null,
    };
    const stages = kernel.createChapterStagePorts(services, { reconcile });
    if (options.editBeforeCommit) {
      const commit = stages.commit.execute;
      stages.commit.execute = async (...args) => {
        await fixture.db.chapter.update({ where: { id: 'chapter-1' }, data: { content: 'human edit' }, select: { id: true } });
        return commit(...args);
      };
    }
    return { store, stages, fence, budget: { reserve: async input => ({ accepted: true, reservationKey: input.requestKey }) } };
  };
  return { ...fixture, kernel, req, makePorts, calls };
}

for (const crashAfter of ['draft', 'repair', 'commit']) test(`assembled SQLite stages survive durable ${crashAfter} crash with one canonical save`, async t => {
  const f = await assembledFixture(t); const ports = f.makePorts(); let crashed = false;
  const save = ports.store.compareAndSwap.bind(ports.store);
  ports.store.compareAndSwap = async (...args) => {
    const row = await save(...args);
    if (!crashed && row?.artifacts.receipts[crashAfter]) { crashed = true; throw new Error('crash after durable stage'); }
    return row;
  };
  await assert.rejects(f.kernel.runUnit(f.req, ports), /crash after durable stage/);
  const result = await f.kernel.runUnit(f.req, f.makePorts());
  assert.equal(result.status, 'completed');
  assert.equal(result.progress.selected, 'candidate');
  assert.equal((await f.db.chapter.findFirst({ select: { content: true } })).content, 'candidate');
  for (const stage of ['draft', 'accept', 'repair', 'verify', 'extract']) assert.equal(f.calls.filter(item => item === stage).length, 1, stage);
  assert.equal((await f.db.chapterArtifactSyncCheckpoint.findMany()).filter(row => row.status === 'succeeded').length, 11);
});
test('assembled SQLite reconciliation resumes only missing consumers after process recreation', async t => {
  const f = await assembledFixture(t, { failConsumer: true });
  assert.equal((await f.kernel.runUnit(f.req, f.makePorts())).status, 'pending');
  assert.equal((await f.kernel.runUnit(f.req, f.makePorts())).status, 'completed');
  assert.equal(f.calls.filter(item => item === 'extract').length, 1);
  assert.equal(f.calls.filter(item => item === 'summary_facts').length, 1);
  assert.equal(f.calls.filter(item => item === 'payoff').length, 2);
  assert.equal(f.calls.filter(item => item === 'character_locations').length, 1);
  assert.equal(f.calls.filter(item => item === 'character_appearances').length, 1);
});
test('assembled SQLite stages preserve a human edit and roll back the commit receipt', async t => {
  const f = await assembledFixture(t, { editBeforeCommit: true });
  await assert.rejects(f.kernel.runUnit(f.req, f.makePorts()), { name: 'ProductionVersionConflictError' });
  assert.equal((await f.db.chapter.findFirst({ select: { content: true } })).content, 'human edit');
  const row = await f.db.productionUnitRun.findFirst();
  assert.equal(JSON.parse(row.progressJson).completed.includes('commit'), false);
  assert.equal(Boolean(JSON.parse(row.stageArtifactsJson).receipts.commit), false);
  assert.equal(f.calls.includes('extract'), false);
});
test('assembled SQLite quality pause persists after manuscript save and requires explicit recovery', async t => {
  const f = await assembledFixture(t, { manual: true });
  const first = await f.kernel.runUnit(f.req, f.makePorts());
  assert.equal(first.status, 'paused');
  assert.equal((await f.db.chapter.findFirst({ select: { content: true } })).content, 'original');
  assert.equal(f.calls.includes('extract'), false);
  const beforePolling = [...f.calls];
  assert.equal((await f.kernel.runUnit(f.req, f.makePorts())).status, 'paused');
  assert.deepEqual(f.calls, beforePolling);
  const ports = f.makePorts(); const run = await ports.store.loadOrCreate(f.req);
  await assert.rejects(f.kernel.acknowledgeUnitQualityPause({ run, contentHash: first.progress.committedContentHash }, {
    store: ports.store, authorizeExplicitRecovery: async () => { throw new Error('no explicit command'); },
  }), /no explicit command/);
  await f.kernel.acknowledgeUnitQualityPause({ run, contentHash: first.progress.committedContentHash }, {
    store: ports.store, authorizeExplicitRecovery: async row => ports.fence(row),
  });
  assert.equal((await f.kernel.runUnit(f.req, f.makePorts())).status, 'completed');
  assert.equal(f.calls.filter(item => item === 'draft').length, 1);
});
