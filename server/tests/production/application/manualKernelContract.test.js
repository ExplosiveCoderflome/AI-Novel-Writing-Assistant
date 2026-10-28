const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const file = require('node:path').resolve(__dirname, '../../../dist/app/director/productionKernel/manual/contract.js');
const api = fs.existsSync(file) ? require(file) : {};
const {createLongChapterProfile} = require('../../../dist/modules/production');
function contract(extra = {}) {
  return {planVersion: 'production-kernel-manual@1', novelId: 'book', chapterRange: {from: 2, to: 2},
    stepIdsInScope: ['chapter_batch'], launchInput: {manualChapter: {operation: 'audit', chapterId: 'chapter',
      baseline: {content: '已保存正文', updatedAt: '2026-10-28T01:00:00.000Z'}, options: {temperature: 0.4}}}, ...extra};
}
test('manual contract retains the authorized operation and exact saved manuscript', () => {
  assert.equal(typeof api.readManualChapterRequest, 'function');
  assert.deepEqual(api.readManualChapterRequest(contract()), contract().launchInput.manualChapter);
  assert.equal(api.readManualChapterRequest({planVersion: 'director-next-production-v1'}), undefined);
});
test('manual request cannot borrow an automatic run or a multi chapter scope', () => {
  assert.equal(typeof api.readManualChapterRequest, 'function');
  assert.throws(() => api.readManualChapterRequest(contract({planVersion: 'director-next-production-v1'})));
  assert.throws(() => api.readManualChapterRequest(contract({chapterRange: {from: 2, to: 3}})));
  assert.throws(() => api.readManualChapterRequest(contract({stepIdsInScope: null})));
});
test('reaudit uses the long chapter rules without allowing a prose repair', () => {
  assert.equal(typeof api.configureManualChapterProfile, 'function');
  const source = createLongChapterProfile(), before = structuredClone(source);
  const audit = api.configureManualChapterProfile(source, 'audit');
  assert.equal(audit.repair.maxAttempts, 0); assert.equal(audit.repair.mode, 'detect_only');
  assert.deepEqual(audit.capabilities, source.capabilities); assert.deepEqual(audit.stages, source.stages);
  assert.deepEqual(source, before);
  assert.deepEqual(api.configureManualChapterProfile(source, 'repair'), source);
  assert.deepEqual(api.configureManualChapterProfile(source), source);
});
test('two explicit manual operations cannot share a completed artifact scope', () => {
  const factory = require('../../../dist/app/director/productionComposition').createDirectorProductionOptions().contractFactory;
  const input = {novelId: 'book', driver: 'auto', stepIdsInScope: ['chapter_batch'], launchInput: {
    ...contract().launchInput, storyInput: '故事', estimatedChapterCount: 2, worldMode: 'skip', targetMode: 'opening',
    provider: 'openai', model: 'fixture-model', executionRange: {from: 2, to: 2}}};
  assert.notEqual(factory({...input, runId: 'manual-one'}).scope, factory({...input, runId: 'manual-two'}).scope);
});
