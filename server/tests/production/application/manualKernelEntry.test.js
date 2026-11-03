const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const file = require('node:path').resolve(__dirname, '../../../dist/app/director/productionKernel/manual/entry.js');
const api = fs.existsSync(file) ? require(file) : {};
function fixture(version = 'v2', enabled = true) {
  const commands = [];
  const chapter = {id: 'chapter', novelId: 'book', order: 2, content: '', updatedAt: new Date('2026-10-28T01:00:00Z')};
  const book = {id: 'book', directorVersion: version, narrativeForm: 'novel', title: '书', description: '故事', estimatedChapterCount: 10};
  const deps = {db: {novel: {findUnique: async () => book, findUniqueOrThrow: async () => book}, chapter: {findFirst: async () => chapter}}, enabled: () => enabled,
    commands: () => ({execute: async input => {commands.push(input); return {runId: 'manual-run'};}}), wake: () => {},
    readTokenLimit: async () => 100000, resolveModel: async () => ({provider: 'openai', model: 'test-model'})};
  return {deps, commands, chapter, book};
}
test('manual entry routes by saved book version and leaves V1 and disabled rollout to legacy', async () => {
  assert.equal(typeof api.createManualChapterEntry, 'function');
  assert.equal(await api.createManualChapterEntry(fixture('v1').deps).handles('book'), false);
  assert.equal(await api.createManualChapterEntry(fixture('v2', false).deps).handles('book'), false);
  assert.equal(await api.createManualChapterEntry(fixture().deps).handles('book'), true);
});
test('manual writing opens one new durable run with the exact chapter and bounded scope', async () => {
  assert.equal(typeof api.createManualChapterEntry, 'function');
  const f = fixture(), entry = api.createManualChapterEntry(f.deps);
  assert.equal(await entry.start('book', 'chapter', 'write', {directorVersion: 'v1', workflowTaskId: 'foreign-run'}), 'manual-run');
  const command = f.commands[0];
  assert.deepEqual(command.stepIdsInScope, ['chapter_batch']);
  assert.deepEqual(command.launchInput.executionRange, {from: 2, to: 2});
  assert.equal(command.launchInput.manualChapter.chapterId, 'chapter');
  assert.equal(command.launchInput.manualChapter.options.workflowTaskId, undefined);
  assert.equal(command.launchInput.chapterTokenLimit, 100000);
});
test('reaudit requires the saved editor version and cannot generate a chapter from an empty body', async () => {
  assert.equal(typeof api.createManualChapterEntry, 'function');
  const f = fixture(), entry = api.createManualChapterEntry(f.deps);
  await assert.rejects(entry.start('book', 'chapter', 'audit', {}), /正文/);
  f.chapter.content = '人工保存后的正文';
  await assert.rejects(entry.start('book', 'chapter', 'audit', {content: '尚未保存的改动'}), /保存/);
  assert.equal(f.commands.length, 0);
  await entry.start('book', 'chapter', 'audit', {content: f.chapter.content});
  assert.equal(f.commands[0].launchInput.manualChapter.baseline.content, f.chapter.content);
  await assert.rejects(entry.start('book', 'chapter', 'write', {}), /正文/);
});
test('a stale or forged request cannot start a V2 task for a V1 book', async () => {
  assert.equal(typeof api.createManualChapterEntry, 'function');
  const f = fixture('v1');
  await assert.rejects(api.createManualChapterEntry(f.deps).start('book', 'chapter', 'write', {directorVersion: 'v2'}), /版本|V2/);
  assert.equal(f.commands.length, 0);
});
test('a paused manual run reports the pending unknown-claims chapter and directs the user to the director desk', async () => {
  assert.equal(typeof api.createManualChapterEntry, 'function');
  const contract = {runId: 'manual-run', novelId: 'book', chapterRange: {from: 2, to: 2},
    stepIdsInScope: ['chapter_batch'], planVersion: 'production-kernel-manual@1'};
  const deps = {db: {
    novel: {findUnique: async () => null, findUniqueOrThrow: async () => null}, chapter: {findFirst: async () => null},
    directorNextRunControl: {findUniqueOrThrow: async () => ({status: 'paused',
      pauseJson: JSON.stringify({kind: 'manual_recovery', reason: '本章写作结果尚未确认'})})},
    directorNextRun: {findUniqueOrThrow: async () => ({contractJson: JSON.stringify(contract)})},
    productionUnitRun: {findMany: async () => [{id: 'unit-1', ownerKey: 'director_next:manual-run:chapter_batch', novelId: 'book',
      chapterId: 'chapter', version: 1,
      profileSnapshotJson: JSON.stringify({id: 'long_chapter@1', stages: ['prepare', 'draft', 'accept', 'repair', 'verify', 'select', 'commit', 'reconcile'],
        repair: {maxAttempts: 1, mode: 'light_repair'}, context: 'chapter_context@1', reconcile: 'adaptive',
        outputBudgets: {draft: 8000, accept: 4096, verify: 6144}, capabilities: []}),
      modelSnapshotJson: JSON.stringify({provider: 'openai', model: 'test-model', promptVersion: 'v1', configVersion: 'v1', inputFingerprint: 'input-v1'}),
      policySnapshotJson: JSON.stringify({policy: {blockingAction: 'continue_with_warning'}}),
      progressJson: JSON.stringify({unit: {novelId: 'book', chapterId: 'chapter', order: 2},
        completed: ['prepare', 'draft'], repairAttemptsUsed: 0}), stageArtifactsJson: '{"receipts":{}}',
      activeStage: 'draft', activeRequestKey: 'interrupted-request'}]},
    chapterArtifactSyncCheckpoint: {count: async () => 0},
  }, enabled: () => true, commands: () => ({execute: async () => ({runId: 'manual-run'})}), wake: () => {}};
  const entry = api.createManualChapterEntry(deps);
  await assert.rejects(entry.waitForResult('book', 'chapter', 'manual-run'), error => {
    assert.equal(error.statusCode, 409);
    assert.equal(error.details.pauseKind, 'manual_recovery');
    assert.deepEqual(error.details.unknownClaims, {chapterId: 'chapter', chapterOrder: 2});
    assert.equal(error.details.sourceRoute, '/lab/director/book');
    assert.equal(error.details.sourceActionLabel, '去导演台按章确认');
    assert.match(error.message, /第 2 章.*待确认/);
    return true;
  });
});

test('a non-confirmation pause keeps the saved reason without inventing unknown claims', async () => {
  assert.equal(typeof api.createManualChapterEntry, 'function');
  const deps = {db: {
    novel: {findUnique: async () => null, findUniqueOrThrow: async () => null}, chapter: {findFirst: async () => null},
    directorNextRunControl: {findUniqueOrThrow: async () => ({status: 'paused',
      pauseJson: JSON.stringify({kind: 'replan', reason: '需要调整后续规划'})})},
  }, enabled: () => true, commands: () => ({execute: async () => ({runId: 'manual-run'})}), wake: () => {}};
  const entry = api.createManualChapterEntry(deps);
  await assert.rejects(entry.waitForResult('book', 'chapter', 'manual-run'), error => {
    assert.equal(error.statusCode, 409);
    assert.equal(error.details.pauseKind, 'replan');
    assert.equal(error.details.unknownClaims, null);
    assert.equal(error.message, '需要调整后续规划');
    return true;
  });
});
