const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { request, harness } = require('./harness.cjs');
const target = path.resolve(__dirname, '../../../dist/modules/production/infrastructure/services/registeredWriter.js');
const moduleApi = fs.existsSync(target) ? require(target) : {};
async function fixture(options = {}) {
  assert.equal(typeof moduleApi.createRegisteredChapterWriter, 'function', 'createRegisteredChapterWriter must be exported');
  const run = await harness().store.loadOrCreate(request());
  const prepared = { novelTitle: '书', chapterTitle: '章', contextPackage: { chapterWriteContext: { chapterMission: { targetWordCount: 2000 } } } };
  let revision = 'config-v1'; const calls = [];
  const writer = moduleApi.createRegisteredChapterWriter({
    resolveContext: async () => [{ id: 'full-contract', priority: 100, required: true, content: '完整合同与前章'.repeat(100) }],
    describePrompt: async input => ({ identity: revision, promptVersion: 'v10', provider: 'test', model: 'fake-model',
      outputTokens: 6000, contextWindow: options.window ?? 100000, renderedInput: JSON.stringify(input) }),
    invokePrompt: async input => { calls.push(input); if (options.mutate) revision = 'config-v2'; return { output: '原始整章' }; },
  });
  return { writer, run, prepared, calls, changeConfig: () => { revision = 'config-v2'; } };
}
test('registered writer uses the frozen full context and returns one draft without invoking a finalizer', async () => {
  const f = await fixture(); const call = await f.writer.describe(f.run, f.prepared);
  assert.equal(await f.writer.invoke(f.run, f.prepared, call), '原始整章');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].asset.id, 'novel.chapter.writer');
  assert.equal(f.calls[0].promptInput.mode, 'draft');
  assert.equal(f.calls[0].promptInput.targetWordCount, 2000);
  assert.equal(f.calls[0].contextBlocks[0].content, '完整合同与前章'.repeat(100));
  assert.equal(f.calls[0].options.maxTokens, 6000);
  assert.equal(f.calls[0].options.reasoningEnabled, false);
});
test('registered writer checks complete effective context budget before a paid request', async () => {
  const f = await fixture({ window: 500 });
  await assert.rejects(f.writer.describe(f.run, f.prepared), { name: 'InvalidProductionRequestError' });
  assert.equal(f.calls.length, 0);
});
test('registered writer rejects effective prompt changes before invocation and before publishing a response', async () => {
  const before = await fixture(); const call = await before.writer.describe(before.run, before.prepared);
  before.changeConfig();
  await assert.rejects(before.writer.invoke(before.run, before.prepared, call), { name: 'ProductionSnapshotConflictError' });
  assert.equal(before.calls.length, 0);
  const after = await fixture({ mutate: true }); const described = await after.writer.describe(after.run, after.prepared);
  await assert.rejects(after.writer.invoke(after.run, after.prepared, described), { name: 'ProductionSnapshotConflictError' });
  assert.equal(after.calls.length, 1);
});
