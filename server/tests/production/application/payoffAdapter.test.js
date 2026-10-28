const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, request, hash } = require('./harness.cjs');
const kernel = require('../../../dist/modules/production');
test('full payoff extraction freezes complete sources, verifies effective config and never writes business data', async () => {
  assert.equal(typeof kernel.createPayoffExtractionPort, 'function');
  const run = await harness().store.loadOrCreate(request());
  const context = { run, content: '正文', contentHash: hash('正文'), executionToken: 'lease', requestKey: 'reconcile' };
  let revision = 'v1'; let calls = 0;
  const source = { novelTitle: '书', latestChapterContext: '完整状态'.repeat(9000), activeVolumeSummary: '卷', majorPayoffsText: '无', openPayoffsText: '无',
    chapterPayoffRefsText: '无', foreshadowStatesText: '无', payoffConflictsText: '无', payoffAuditIssuesText: '无' };
  const port = kernel.createPayoffExtractionPort({ read: async () => source,
    describePrompt: async input => ({ identity: revision, promptVersion: 'v8', provider: 'test', model: 'fake-model', outputTokens: 4096, contextWindow: 1000000, renderedInput: JSON.stringify(input) }),
    invokePrompt: async input => { calls++; assert.equal(input.promptInput.latestChapterContext, source.latestChapterContext); return { output: { items: [] } }; } });
  const prepared = await port.prepare(context);
  assert.equal(calls, 0);
  assert.deepEqual(await port.invoke(context, prepared, 'key'), { items: [] });
  revision = 'v2';
  await assert.rejects(port.invoke(context, prepared, 'key'), { name: 'ProductionSnapshotConflictError' });
  assert.equal(calls, 1);
});
test('StoryStatePort only reconciles a currently claimed stage with its saved descriptor', async () => {
  assert.equal(typeof kernel.createStoryStatePort, 'function');
  const run = await harness().store.loadOrCreate(request());
  let calls = 0;
  const port = kernel.createStoryStatePort({ read: async () => ({ state: 'before' }),
    reconciliation: { execute: async (_run, call) => { calls++; assert.equal(call.requestKey, 'key'); return { result: { stage: 'reconcile', status: 'completed' } }; } } });
  assert.deepEqual(await port.read('novel-1', 1), { state: 'before' });
  await assert.rejects(port.reconcile(run), { name: 'InvalidProductionRequestError' });
  run.activeStage = 'reconcile'; run.activeRequestKey = 'key';
  run.artifacts.activeDescriptor = { callsModel: false, inputFingerprint: 'full', promptVersion: 'v1', configVersion: 'v1', input: {} };
  assert.equal((await port.reconcile(run)).result.status, 'completed');
  assert.equal(calls, 1);
});
