const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { request, harness } = require('./harness.cjs');
const target = path.resolve(__dirname, '../../../dist/modules/production/infrastructure/services/preparation.js');
const moduleApi = fs.existsSync(target) ? require(target) : {};
async function fixture(options = {}) {
  assert.equal(typeof moduleApi.createChapterPreparationAdapter, 'function', 'createChapterPreparationAdapter must be exported');
  const calls = []; const run = await harness().store.loadOrCreate(request());
  const requestInput = { provider: 'test', model: 'fake-model', controlPolicy: { advanceMode: 'auto_to_execution', kickoffMode: 'director_start' } };
  const adapter = moduleApi.createChapterPreparationAdapter({
    db: { chapter: { findFirst: async input => { calls.push(['baseline', input]); return { content: '', updatedAt: new Date(1), order: 1 }; } } },
    protectedContent: async () => !!options.protected,
    request: async () => requestInput,
    preparation: { prepare: async (...args) => { calls.push(['prepare', ...args]); } },
    assembler: { assemble: async (...args) => { calls.push(['assemble', ...args]); return { novel: { id: 'novel-1', title: '书' }, chapter: { id: 'chapter-1', title: '章', order: options.order ?? 1 }, contextPackage: { plan: { id: 'plan-1' } } }; } },
  });
  return { adapter, run, calls, requestInput };
}
test('preparation adapter calls planning before the read-only context assembler with the frozen request', async () => {
  const f = await fixture();
  assert.deepEqual(await f.adapter.readBaseline(f.run.progress.unit), { content: '', updatedAt: new Date(1).toISOString(), protectedUserContent: false });
  const value = await f.adapter.prepare(f.run);
  assert.deepEqual(f.calls.map(item => item[0]), ['baseline', 'prepare', 'assemble']);
  assert.deepEqual(f.calls[1].slice(1), ['novel-1', 'chapter-1', f.requestInput]);
  assert.equal(value.contextPackage.plan.id, 'plan-1');
});
test('preparation adapter preserves caller edit protection and rejects a changed assembled chapter', async () => {
  const f = await fixture({ protected: true, order: 2 });
  assert.equal((await f.adapter.readBaseline(f.run.progress.unit)).protectedUserContent, true);
  await assert.rejects(f.adapter.prepare(f.run), { name: 'InvalidProductionRequestError' });
});
