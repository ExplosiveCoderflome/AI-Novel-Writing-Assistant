const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { initializeTemporarySqliteDatabase } = require('../testInfrastructure/tempSqliteDatabase.cjs');

// All persistence tests use a new, isolated database; never open the developer's data.
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-chapter-sync-'));
process.env.DATABASE_URL = initializeTemporarySqliteDatabase(directory, 'test.db');
process.env.NODE_ENV = 'test';
process.env.AI_NOVEL_RUNTIME = 'desktop';
process.env.AI_NOVEL_APP_DATA_DIR = directory;
const { prisma } = require('../../dist/db/prisma');
const { NovelCoreCrudService } = require('../../dist/services/novel/novelCoreCrudService');
const { NovelSideEffectJobService } = require('../../dist/events/sideEffects/NovelSideEffectJobService');
const { NovelSideEffectJobHandlers } = require('../../dist/events/sideEffects/NovelSideEffectJobHandlers');
const { ManualChapterSyncService, readManualChapterSync, queueManualChapterSync } = require('../../dist/services/novel/chapterEditor/synchronization');
const { ChapterArtifactRecoveryService } = require('../../dist/services/novel/runtime/artifactSync/ChapterArtifactRecoveryService');
const { chapterArtifactBackgroundSyncService: background } = require('../../dist/services/novel/runtime/ChapterArtifactBackgroundSyncService');
const legacyProjection = require('../../dist/services/novel/chapterEditor/application/ChapterArtifactProjectionService');
const { buildChapterArtifactContentHash: hash, CHAPTER_ARTIFACT_BOUNDARY_TYPE: boundaryType, hasCurrentChapterArtifactSyncBoundary: hasBoundary } = require('../../dist/services/novel/runtime/artifactSync');
const { chapterArtifactDeltaOutputSchema } = require('../../dist/prompting/prompts/novel/chapterArtifactDelta.prompts');
const crud = new NovelCoreCrudService();

test.beforeEach(t => {
  t.mock.method(crud.volumeService, 'mirrorChapterIntoWorkspace', async () => {});
  t.mock.method(require('../../dist/services/novel/novelCoreSupport'), 'queueRagUpsert', () => {});
  t.mock.method(require('../../dist/prompting/core/promptRunner'), 'runStructuredPrompt', async () => { throw Error('Unexpected model call'); });
  t.mock.method(background, 'shouldRunPayoffFullReconcile', async () => false);
});
test.after(() => prisma.$disconnect());

async function book({ content = '原文', terminal = true, v2 = true } = {}) {
  const novelId = randomUUID();
  await prisma.novel.create({ data: { id: novelId, title: '同步回归', directorVersion: v2 ? 'v2' : 'v1', directorEpoch: 1 } });
  const contract = { runId: randomUUID(), novelId, driver: 'auto', executionEpoch: 1,
    modelConfig: { route: 'deepseek', model: 'chosen-model', version: '1' }, chapterRange: { from: 1, to: 1 } };
  if (v2) {
    await prisma.directorNextRun.create({ data: { id: contract.runId, novelId, driver: 'auto', planVersion: 'test', contractJson: JSON.stringify(contract) } });
    await prisma.directorNextRunControl.create({ data: { runId: contract.runId, novelId, status: 'paused' } });
  }
  const chapter = await prisma.chapter.create({ data: { novelId, title: '第一章', order: 1, content,
    generationState: terminal ? 'approved' : 'reviewed', chapterStatus: terminal ? 'completed' : 'needs_repair' } });
  return { novelId, chapter, contract };
}
async function marker(book) { return readManualChapterSync(book.novelId, book.chapter.id, (await prisma.chapter.findUnique({ where: { id: book.chapter.id } })).content); }
async function payload(book) { return JSON.parse((await marker(book)).metadataJson); }
async function save(book, content, expectedContent = book.chapter.content) {
  return crud.updateChapter(book.novelId, book.chapter.id, { content, expectedContent, expectedUpdatedAt: book.chapter.updatedAt.toISOString() });
}
async function boundaries(book) { return prisma.chapterArtifactSyncCheckpoint.findMany({ where: { chapterId: book.chapter.id, artifactType: boundaryType, status: 'succeeded' } }); }
function extraction(t, { onExtract, onApply } = {}) {
  const calls = { extract: 0, apply: [] };
  const delta = {
    async extractChapterArtifacts(input) {
      calls.extract++;
      await onExtract?.(input);
      return { contentHash: hash(input.content), output: chapterArtifactDeltaOutputSchema.parse({ summary: '摘要', stateDeltas: {}, syncPlan: { reason: '修订正文' }, confidence: .9 }) };
    },
    async applyChapterArtifactConsumer(input) { calls.apply.push(input.consumer); await onApply?.(input); return {}; },
    toSyncResult(extracted, aggregate) { return { ...extracted, ...aggregate, requiresFullReconcile: false }; },
  };
  const recovery = new ChapterArtifactRecoveryService({ deltaService: delta, prepareCandidates: async (_input, output) => output });
  t.mock.method(background, 'getArtifactRecoveryService', () => recovery);
  return calls;
}

test('body compare-and-save tolerates summary updates, rejects real conflicts, and queues atomically', async t => {
  const b = await book({ content: '第一行\r\n第二行' });
  t.mock.method(legacyProjection, 'syncChapterArtifacts', async () => { throw Error('save must not wait for derived assets'); });
  await prisma.chapter.update({ where: { id: b.chapter.id }, data: { expectation: '后台摘要', updatedAt: new Date(b.chapter.updatedAt.getTime() + 1000) } });
  const updated = await save(b, '作者修订', '第一行\n第二行');
  assert.equal(updated.content, '作者修订');
  assert.equal((await marker(b)).status, 'pending');
  assert.equal(await prisma.novelSideEffectJob.count({ where: { novelId: b.novelId, jobType: 'chapter.manualSync' } }), 1);
  assert.equal(await prisma.novelSideEffectJob.count({ where: { novelId: b.novelId, jobType: 'chapter.timelineFinalization' } }), 1);
  await assert.rejects(save(b, '过期覆盖'), error => error.statusCode === 409);
  await assert.rejects(crud.updateChapter(b.novelId, b.chapter.id, { title: '改名', content: '作者修订', expectedContent: '作者修订', expectedUpdatedAt: b.chapter.updatedAt.toISOString() }), error => error.statusCode === 409);
  t.mock.method(NovelSideEffectJobService.prototype, 'enqueueJob', async () => { throw Error('outbox unavailable'); });
  await assert.rejects(save(b, '不能提交的正文', '作者修订'), /outbox unavailable/);
  assert.equal((await prisma.chapter.findUnique({ where: { id: b.chapter.id } })).content, '作者修订');
});

test('failed synchronization preserves saved prose and retries only unfinished consumers across instances', async t => {
  const b = await book();
  let fail = true;
  const calls = extraction(t, { onExtract(input) {
    assert.equal(input.artifactSyncPolicy, 'director_v2');
    assert.equal(input.directorRunId, b.contract.runId);
    assert.equal(input.model, 'chosen-model');
  }, onApply(input) { if (input.consumer === 'payoff' && fail) throw Error('temporary consumer failure'); } });
  await save(b, '修订正文');
  assert.equal(calls.extract, 0, 'saving must not wait for or invoke AI');
  const p = await payload(b);
  const handler = new NovelSideEffectJobHandlers();
  const job = await prisma.novelSideEffectJob.findFirst({ where: { novelId: b.novelId, jobType: 'chapter.manualSync' } });
  await assert.rejects(handler.execute(job), /temporary consumer failure/);
  await assert.rejects(handler.execute(job), /temporary consumer failure/);
  assert.equal((await marker(b)).status, 'failed');
  assert.equal(hasBoundary('修订正文', await boundaries(b), { requireAppliedDelta: true }), false);
  fail = false;
  await new ManualChapterSyncService().ensureCurrent(b.novelId, b.chapter.id);
  assert.equal(calls.extract, 1);
  assert.equal(calls.apply.filter(c => c === 'summary_facts').length, 1);
  assert.equal(calls.apply.filter(c => c === 'payoff').length, 3);
  assert.equal((await marker(b)).status, 'succeeded');
  assert.equal(hasBoundary('修订正文', await boundaries(b), { requireAppliedDelta: true }), true);
  assert.equal((await prisma.chapter.findUnique({ where: { id: b.chapter.id } })).content, '修订正文');
  assert.equal((await prisma.directorNextRunControl.findUnique({ where: { runId: b.contract.runId } })).status, 'paused');
  await new ManualChapterSyncService().run(p);
  assert.equal(calls.extract, 1, 'completed retries are idempotent');
});

test('old-version terminal edits acquire a durable repair obligation on explicit continuation', async t => {
  const b = await book({ content: '旧客户端保存的正文' });
  extraction(t);
  assert.equal(await marker(b), null);
  await new ManualChapterSyncService().ensureCurrent(b.novelId, b.chapter.id);
  assert.equal((await marker(b)).status, 'succeeded');
  assert.equal(hasBoundary(b.chapter.content, await boundaries(b), { requireAppliedDelta: true }), true);
});

test('a completed marker without a valid boundary is recoverable without another author edit', async t => {
  const b = await book();
  const calls = extraction(t);
  await save(b, '修订正文');
  const service = new ManualChapterSyncService();
  await service.ensureCurrent(b.novelId, b.chapter.id);
  await prisma.chapterArtifactSyncCheckpoint.updateMany({where: {chapterId: b.chapter.id, artifactType: boundaryType}, data: {status: 'superseded'}});
  await service.ensureCurrent(b.novelId, b.chapter.id);
  assert.equal(calls.extract, 2);
  assert.equal(hasBoundary('修订正文', await boundaries(b), {requireAppliedDelta: true}), true);
});

test('stale jobs and A-B-A edits cannot reuse an old revision or publish a stale boundary', async t => {
  const b = await book({ content: 'A' });
  await save(b, 'B');
  const stale = await payload(b);
  await save(b, 'A', 'B');
  let newest;
  const calls = extraction(t, { async onExtract(input) {
    if (calls.extract !== 1) return;
    await save(b, 'C', 'A');
    await save(b, 'A', 'C');
    newest = await payload(b);
    const concurrent = await new ManualChapterSyncService().run(newest);
    assert.equal(concurrent.status, 'pending', 'one chapter has a durable cross-instance sync lease');
  } });
  assert.equal((await new ManualChapterSyncService().run(stale)).status, 'completed');
  assert.equal(calls.extract, 0);
  await new ManualChapterSyncService().ensureCurrent(b.novelId, b.chapter.id);
  assert.equal(calls.extract, 2, 'continuation re-reads the newest revision');
  assert.equal((await marker(b)).status, 'succeeded');
  const rows = await boundaries(b);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].syncMode, 'manual:' + newest.revision);
});

test('V1 saves retain legacy summary/timeline work in the durable task without V2 ownership', async t => {
  const b = await book({ v2: false });
  let compatibility = 0;
  const originalProjection = legacyProjection.syncChapterArtifacts;
  t.mock.method(legacyProjection, 'syncChapterArtifacts', async (_novel, _chapter, content, options) => {
    compatibility++; assert.equal(content, 'V1修订'); assert.equal(options.scheduleBackgroundSync, false);
    return originalProjection(_novel, _chapter, content, options);
  });
  t.mock.method(background, 'scheduleChapterSync', () => assert.fail('durable manual sync must not schedule a second extraction'));
  extraction(t, { onExtract(input) { assert.equal(input.artifactSyncPolicy, undefined); assert.equal(input.directorRunId, undefined); } });
  await save(b, 'V1修订');
  assert.equal(compatibility, 0);
  assert.equal(await prisma.chapterSummary.count({ where: { chapterId: b.chapter.id } }), 0);
  await new ManualChapterSyncService().ensureCurrent(b.novelId, b.chapter.id);
  assert.equal(compatibility, 1);
  assert.equal(await prisma.chapterSummary.count({ where: { chapterId: b.chapter.id } }), 1);
});

test('explicit continuation waits for edited predecessor chapters outside the new generation range', async t => {
  const b = await book();
  extraction(t);
  await save(b, '前章修订');
  let cancellationChecks = 0;
  await new ManualChapterSyncService().ensurePrevious(b.novelId, 2, async () => { cancellationChecks++; });
  assert.equal((await marker(b)).status, 'succeeded');
  assert.ok(cancellationChecks >= 2);
});

test('simultaneous saves cannot overwrite each other using the same base body', async () => {
  const b = await book();
  const results = await Promise.allSettled([save(b, '第一份修订'), save(b, '第二份修订')]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.statusCode, 409);
  assert.equal(await prisma.novelSideEffectJob.count({where: {novelId: b.novelId, jobType: 'chapter.manualSync'}}), 1);
});

test('paused V2 candidate synchronization requires proof of a current manual revision', async () => {
  const b = await book({content: '阿宁递来药箱。'});
  const { DirectorCharacterCandidateService } = require('../../dist/services/novel/characters/candidates');
  const service = new DirectorCharacterCandidateService();
  const output = chapterArtifactDeltaOutputSchema.parse({summary: '药童送药', stateDeltas: {}, syncPlan: {reason: '正文证据'}, confidence: .9,
    characterCandidates: [{proposedName: '阿宁', proposedRole: '药童', evidence: ['阿宁递来药箱。'], identityDecision: 'create', decisionReason: '独立出场的角色'}]});
  const input = {novelId: b.novelId, chapterId: b.chapter.id, content: b.chapter.content, directorRunId: b.contract.runId};
  await assert.rejects(service.prepare(input, output), /未在执行/);
  const p = await prisma.$transaction(tx => queueManualChapterSync(tx, b.chapter));
  const row = await marker(b);
  const metadataJson = JSON.stringify({...p, attemptId: randomUUID()});
  await prisma.chapterArtifactSyncCheckpoint.update({where: {id: row.id}, data: {status: 'running', metadataJson}});
  const revisionGuard = {id: row.id, metadataJson, novel: {directorEpoch: 1, directorVersion: 'v2'}};
  await assert.rejects(service.prepare({...input, manualRevision: 'wrong-revision', revisionGuard}, output), /修订/);
  await service.prepare({...input, manualRevision: p.revision, revisionGuard}, output);
  assert.equal(await prisma.character.count({where: {novelId: b.novelId}}), 1);
  assert.equal((await prisma.directorNextRunControl.findUnique({where: {runId: b.contract.runId}})).status, 'paused');
  await prisma.novel.update({where: {id: b.novelId}, data: {directorEpoch: 2}});
  await assert.rejects(service.prepare({...input, manualRevision: p.revision, revisionGuard}, output), /修订/);
});

test('gate preparation completes the current edit before its short confirmation transaction', async t => {
  const b = await book();
  extraction(t);
  await save(b, '等待确认的修订');
  const {prepareEditedChapterGate} = require('../../dist/app/director/recovery/editedChapterGate');
  const {readEditedArtifact} = require('../../dist/app/director/savedContent');
  await prepareEditedChapterGate(b.contract, {decision: 'confirm_after_edit', artifacts: [{type: 'chapter_batch_closed'}]});
  const result = await prisma.$transaction(tx => readEditedArtifact({contract: b.contract, type: 'chapter_batch_closed', contentRef: 'chapter-batch'}, tx));
  assert.ok(result.contentHash);
  assert.equal(result.protectedUserContent, true);
  assert.equal((await marker(b)).status, 'succeeded');
  await save(b, '确认前又编辑', '等待确认的修订');
  await assert.rejects(prisma.$transaction(tx => readEditedArtifact({contract: b.contract, type: 'chapter_batch_closed', contentRef: 'chapter-batch'}, tx)), /同步/);
});

test('manual reassessment uses the existing acceptance prompt without rewriting and detects concurrent edits', async t => {
  const b = await book({terminal: false});
  const {recheckEditedChapterQuality} = require('../../dist/services/novel/production/qualityClosure/recheckEditedChapterQuality');
  const {ChapterQualityGateService} = require('../../dist/services/novel/runtime/ChapterQualityGateService');
  const auditContext = require('../../dist/services/novel/runtime/repair/chapterAuditContext');
  t.mock.method(auditContext, 'assembleChapterAuditContextPackage', async () => ({}));
  const score = {coherence: 75, repetition: 75, pacing: 75, voice: 75, engagement: 75, overall: 75};
  let concurrentlyEdit = false;
  t.mock.method(ChapterQualityGateService.prototype, 'runAcceptanceGate', async input => {
    assert.equal(input.persistAssessment, false);
    assert.equal(input.content, b.chapter.content);
    if (concurrentlyEdit) await save(b, '再次修改');
    return {assessment: {status: 'repairable', continuePolicy: 'repair_once', repairability: 'local_patch', riskTags: []}, score, issues: []};
  });
  const result = await recheckEditedChapterQuality(b.novelId, b.chapter.id, b.chapter.content, {});
  assert.equal(result.pass, false);
  assert.equal(result.retryCountUsed, 0);
  assert.equal((await prisma.chapter.findUnique({where: {id: b.chapter.id}})).content, b.chapter.content);
  concurrentlyEdit = true;
  await assert.rejects(recheckEditedChapterQuality(b.novelId, b.chapter.id, b.chapter.content, {}), /检查期间发生变化/);
});

test('ordinary chapter confirmation validates synchronization and protects only real author revisions', async t => {
  const b = await book();
  extraction(t);
  const contract = {...b.contract, scope: 'book'};
  const {commitGateResolution} = require('../../dist/modules/director/infrastructure/commands/gateResolution');
  const {readEditedArtifact} = require('../../dist/app/director/savedContent');
  await prisma.chapterArtifactSyncCheckpoint.create({data: {novelId: b.novelId, chapterId: b.chapter.id,
    contentHash: hash(b.chapter.content), artifactType: boundaryType, syncMode: 'adaptive', status: 'succeeded', metadataJson: JSON.stringify({outcome: 'completed'})}});
  await prisma.directorNextArtifact.create({data: {id: randomUUID(), novelId: b.novelId, type: 'chapter_batch_closed', scope: 'book',
    version: 1, status: 'draft', protectedUserContent: false, contentRef: 'batch', contentHash: 'legacy-full-chapter-fingerprint', producedByRunId: b.contract.runId}});
  const confirm = () => prisma.$transaction(tx => commitGateResolution(tx, {runId: b.contract.runId, contract,
    control: {status: 'waiting_gate', gate: {artifactTypes: ['chapter_batch_closed']}},
    resolution: {decision: 'confirm', scope: 'book', artifacts: [{type: 'chapter_batch_closed', expectedVersion: 1}], invalidateTypes: []}}, readEditedArtifact));
  await confirm();
  let rows = await prisma.directorNextArtifact.findMany({where: {novelId: b.novelId}});
  assert.equal(rows.length, 1);
  assert.equal(rows[0].protectedUserContent, false, 'different legacy hash shape does not prove an author edit');
  await save(b, '修改后的正文');
  await assert.rejects(confirm(), /同步/);
  await new ManualChapterSyncService().ensureCurrent(b.novelId, b.chapter.id);
  await confirm();
  rows = await prisma.directorNextArtifact.findMany({where: {novelId: b.novelId}, orderBy: {version: 'desc'}});
  assert.equal(rows.length, 2);
  assert.equal(rows[0].protectedUserContent, true);
  assert.equal(rows[0].status, 'user_edited');
});
