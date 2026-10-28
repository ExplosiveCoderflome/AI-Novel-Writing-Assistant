const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { request, harness, hash } = require('./harness.cjs');
const target = path.resolve(__dirname, '../../../dist/modules/production/infrastructure/storyState/extraction.js');
const Module = require('node:module');
const load = Module._load;
Module._load = function(name, parent, isMain) {
  const resolved = Module._resolveFilename(name, parent);
  assert.ok(!String(resolved).replaceAll('\\', '/').endsWith('/db/prisma.js'), 'fast extraction tests must not load a global database connection');
  return load.call(this, name, parent, isMain);
};
const api = fs.existsSync(target) ? require(target) : {};
Module._load = load;
async function fixture(options = {}) {
  assert.equal(typeof api.createArtifactExtractionPort, 'function', 'createArtifactExtractionPort must be exported');
  const run = await harness().store.loadOrCreate(request()); run.snapshots.profile.capabilities = ['character_state'];
  const content = '正文'.repeat(14000);
  const context = { run, content, contentHash: hash(content), requestKey: 'stage', executionToken: 'lease' };
  const calls = [];
  let revision = 'config-v1';
  const port = api.createArtifactExtractionPort({
    read: async () => ({ novelTitle: '书', chapterTitle: '章', chapterGoal: '推进', characterRosterText: '角色名册',
      characterStateText: '角色当前状态', existingResourceText: '资源状态', existingPayoffText: '伏笔状态',
      previousStateText: '前态', activeCharacterDialogueInfluenceText: '对话', characterLocationText: '位置' }),
    describePrompt: async input => ({ identity: revision, promptVersion: 'asset-v1', provider: 'test', model: 'fake-model',
      outputTokens: 8192, requestOutputTokens: options.primaryCap, contextWindow: options.window ?? 1000000, renderedInput: JSON.stringify(input) }),
    invokePrompt: async input => { calls.push(input); return { output: { summary: '事实', stateDeltas: {}, syncPlan: {
      stateSnapshot: 'write', characterResources: 'write', payoffLedger: 'delta', characterDynamics: 'write', reason: '同步结构化事实',
    }, confidence: 1, characterAppearances: [], characterLocationDeltas: [] } }; },
  });
  return { context, port, calls, changeConfig: () => { revision = 'config-v2'; } };
}
test('registered artifact extraction receives the complete manuscript and capability context', async () => {
  const f = await fixture();
  const prepared = await f.port.prepare(f.context);
  const output = await f.port.invoke(f.context, prepared, 'physical-key');
  assert.equal(f.calls[0].asset.id, 'novel.chapter.artifact_delta.extract');
  assert.equal(f.calls[0].promptInput.chapterContent, f.context.content);
  assert.equal(f.calls[0].promptInput.locationTrackingEnabled, true);
  assert.equal(f.calls[0].promptInput.characterCandidateResolutionEnabled, true);
  assert.equal(f.calls[0].options.maxTokens, 8192);
  assert.equal(output.summary, '事实');
});

test('a larger fallback allowance cannot silently raise the primary request output cap', async () => {
  const f = await fixture({ primaryCap: 4096 });
  const prepared = await f.port.prepare(f.context);
  assert.equal(prepared.outputTokens, 8192);
  await f.port.invoke(f.context, prepared, 'physical-key');
  assert.equal(f.calls[0].options.maxTokens, 4096);
});
test('input safety is checked before invocation and changed effective prompt configuration is rejected', async () => {
  const tiny = await fixture({ window: 100 });
  await assert.rejects(tiny.port.prepare(tiny.context), { name: 'ProductionContextBudgetError' });
  assert.equal(tiny.calls.length, 0);
  const f = await fixture(); const prepared = await f.port.prepare(f.context);
  f.changeConfig();
  await assert.rejects(f.port.invoke(f.context, prepared, 'physical-key'), { name: 'ProductionSnapshotConflictError' });
  assert.equal(f.calls.length, 0);
});
