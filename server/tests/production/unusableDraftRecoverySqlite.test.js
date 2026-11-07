const test = require('node:test');
const assert = require('node:assert/strict');
const {fixture} = require('./batch/fixture.cjs');
const {request, harness} = require('./application/harness.cjs');
const production = require('../../dist/modules/production');
const director = require('../../dist/modules/director/domain');
const application = require('../../dist/modules/director/application');
const infrastructure = require('../../dist/modules/director/infrastructure');
const {resumeBusiness} = require('../../dist/app/director/savedContent');
test.mock.method(require('../../dist/app/director/productionKernel/readiness/models'), 'inspectKernelModels', async () => ({ready: true}));

async function setup(t, legacy = false) {
  const f = await fixture(t), {db, contract, api} = f;
  contract.launchInput = {chapterTokenLimit: 100000};
  await db.directorNextRun.update({where: {id: contract.runId}, data: {contractJson: JSON.stringify(contract)}});
  await db.chapter.update({where: {id: 'chapter-1'}, data: {content: null}});
  await api.chooseProductionBatchImplementation(db, f.context, true);
  const budget = api.createKernelChapterBudget(db, f.context);
  const unit = {novelId: 'novel-1', chapterId: 'chapter-1', order: 1};
  await budget.reserve(unit, 'paid-empty-attempt', 100);
  await budget.observe(unit, 'paid-empty-attempt', {invocationId: 'paid-empty-attempt', runId: contract.runId, novelId: unit.novelId, chapterId: unit.chapterId,
    status: 'completed', usage: {totalTokens: 37}, startedAt: new Date(0), finishedAt: new Date(1)});
  await db.directorNextRunControl.update({where: {runId: contract.runId}, data: {cursorStepId: null}});
  const plan = director.definePlan({version: contract.planVersion, externalArtifacts: [], steps: [
    {id: 'chapter_batch', label: '章节写作', requires: [], produces: 'chapter_batch_closed', needs: [], gateable: false, overwrites: []},
  ]});
  const runRepository = new infrastructure.PrismaRunRepository(db);
  const eventLog = new infrastructure.PrismaEventLog(db);
  const artifactLedger = new infrastructure.PrismaArtifactLedger(db);
  const qualityDebtRepository = new infrastructure.PrismaQualityDebtRepository(db);
  const factsLoader = new application.FactsLoader({runRepository, eventLog, artifactLedger, qualityDebtRepository});
  const registry = new application.StepRegistry();
  const chapter = await db.chapter.findUniqueOrThrow({where: {id: 'chapter-1'}});
  const baseline = {content: chapter.content, updatedAt: chapter.updatedAt.toISOString(), protectedUserContent: false};
  let empty = true;
  const ports = harness({execute: async (stage, run) => {
    if (stage === 'prepare') return {result: {stage}, artifacts: {prepared: {baseline, contextPackage: {saved: true}}}};
    if (stage === 'draft' && empty) {empty = false; return {result: {stage, contentHash: null}};}
    if (stage === 'commit') return {result: {stage, contentHash: run.progress.selectedContentHash}, chapterWrite: {
      expected: {content: baseline.content, updatedAt: baseline.updatedAt}, content: run.artifacts.original,
      generationState: 'drafted', chapterStatus: 'pending_review'}};
  }});
  const req = request({ownerKey: api.productionBatchOwnerKey(contract.runId)});
  registry.register('chapter_batch', async context => {
    const store = new production.PrismaUnitProgressStore(db, {assertOwnership: api.createKernelOwnership(context),
      writeChapter: async (tx, run, write) => {
        const saved = await tx.chapter.updateMany({where: {id: run.progress.unit.chapterId, content: write.expected.content,
          updatedAt: new Date(write.expected.updatedAt)}, data: {content: write.content}});
        assert.equal(saved.count, 1);
      }, finalizeChapter: async () => {}});
    const result = await production.runUnit(req, {...ports, store});
    const mapped = api.mapProductionUnitOutcome(result);
    if (mapped.stopSignal) return {stopSignal: legacy && result.reason === 'no_usable_content'
      ? {kind: 'no_usable_content', source: 'runtime', action: 'fail_task', reason: '本章尚未生成可用正文。'} : mapped.stopSignal};
    return {artifact: {scope: contract.scope, status: 'draft', protectedUserContent: false, contentRef: 'saved-chapters', contentHash: 'closed'}};
  });
  const executor = new application.RunExecutor({factsLoader, planRegistry: {get: () => plan}, orchestrator: director.createPlanOrchestrator(),
    runRepository, eventLog, artifactLedger, qualityDebtRepository, stepRegistry: registry});
  const repo = new infrastructure.PrismaCommandRepository(db, {resumeBusiness});
  const commands = new application.CommandService({runRepository, commandRepository: repo,
    runtime: application.createDirectorRuntime(), contractFactory: () => contract});
  const execute = () => executor.runOnce(contract.runId, {leaseOwner: 'worker:1'});
  const resume = async (key = 'retry-empty') => commands.execute({type: 'resume', runId: contract.runId,
    expectedVersion: (await runRepository.getControl(contract.runId)).version, idempotencyKey: key});
  return {...f, ports, executor, execute, resume, repo, commands, factsLoader, plan, runRepository, eventLog};
}

for (const legacy of [false, true]) test(`${legacy ? 'historical failed' : 'paused'} empty draft resumes the same persisted run at draft only`, async t => {
  const f = await setup(t, legacy);
  assert.equal((await f.execute()).kind, legacy ? 'failed' : 'paused');
  const before = await f.db.productionUnitRun.findFirstOrThrow({where: {ownerKey: f.api.productionBatchOwnerKey(f.contract.runId)}});
  assert.deepEqual(JSON.parse(before.progressJson).completed, ['prepare', 'draft']);
  const book = await f.db.chapter.findUniqueOrThrow({where: {id: 'chapter-1'}});
  const checkpoints = await f.db.chapterArtifactSyncCheckpoint.findMany();
  const contracts = await f.db.directorNextRun.findMany();
  const snapshot = await f.db.productionUnitRun.create({data: {...before, id: 'other-saved-unit', ownerKey: 'another-production-owner'}});
  await f.db.$disconnect(); // A new command/executor must read persisted state rather than a local progress object.
  const saved = await f.resume();
  assert.equal(saved.runId, f.contract.runId);
  const after = await f.db.productionUnitRun.findUniqueOrThrow({where: {id: before.id}});
  assert.deepEqual(JSON.parse(after.progressJson).completed, ['prepare']);
  assert.deepEqual(JSON.parse(after.stageArtifactsJson).prepared, JSON.parse(before.stageArtifactsJson).prepared);
  for (const field of ['profileSnapshotJson', 'policySnapshotJson', 'modelSnapshotJson']) assert.equal(after[field], before[field]);
  const replay = await f.commands.execute({type: 'resume', runId: f.contract.runId, expectedVersion: saved.controlVersion - 1, idempotencyKey: 'retry-empty'});
  assert.equal(replay.replayed, true);
  assert.equal(await f.db.directorNextEvent.count({where: {type: 'production_kernel_draft_retry'}}), 1);
  assert.deepEqual(await f.db.chapter.findUniqueOrThrow({where: {id: book.id}}), book);
  assert.equal((await f.execute()).kind, 'executed');
  assert.equal((await f.execute()).kind, 'completed');
  assert.deepEqual(f.ports.calls, ['prepare', 'draft', 'draft', 'accept', 'commit', 'reconcile']);
  assert.deepEqual(await f.db.directorNextRun.findMany(), contracts);
  assert.equal((await f.db.chapter.findUniqueOrThrow({where: {id: book.id}})).content, 'original');
  assert.deepEqual(await f.db.productionUnitRun.findUniqueOrThrow({where: {id: snapshot.id}}), snapshot);
  assert.deepEqual(await f.db.chapterArtifactSyncCheckpoint.findMany(), checkpoints);
});

test('edited content rejects retry and the command transaction preserves all progress', async t => {
  const f = await setup(t);
  await f.execute();
  const before = await f.db.productionUnitRun.findMany();
  await f.db.chapter.update({where: {id: 'chapter-1'}, data: {content: '作者补写的正文'}});
  await assert.rejects(f.resume(), /正文.*修改/);
  assert.deepEqual(await f.db.productionUnitRun.findMany(), before);
  assert.equal(await f.db.directorNextCommand.count(), 0);
  assert.equal((await f.runRepository.getControl(f.contract.runId)).status, 'paused');
});

test('failed-step recovery cannot bypass safety signals or another active run', async t => {
  const f = await setup(t, true);
  await f.execute();
  const before = await f.db.productionUnitRun.findMany();
  await f.eventLog.append({runId: f.contract.runId, type: 'stop_signal', payload: {kind: 'data_integrity', source: 'runtime', action: 'fail_task', reason: 'unsafe'}});
  await assert.rejects(f.resume(), /安全|数据/);
  await f.eventLog.append({runId: f.contract.runId, type: 'stop_signal', payload: {kind: 'no_usable_content', source: 'runtime', action: 'fail_task',
    reason: (await f.runRepository.getControl(f.contract.runId)).failureReason}});
  await f.db.directorNextRun.create({data: {id: 'other-active', novelId: 'novel-1', driver: 'auto', planVersion: 'test-v1', contractJson: '{}'}});
  await f.db.directorNextRunControl.create({data: {runId: 'other-active', novelId: 'novel-1', status: 'paused'}});
  await assert.rejects(f.resume(), /已有进行中/);
  assert.deepEqual(await f.db.productionUnitRun.findMany(), before);
  assert.equal(await f.db.directorNextCommand.count(), 0);
  assert.equal(await f.db.directorNextEvent.count({where: {type: 'production_kernel_draft_retry'}}), 0);
});
