const test = require('node:test'), assert = require('node:assert/strict');
const {ChapterExecutionContractService} = require('../../../dist/services/novel/volume/ChapterExecutionContractService');
const {fixture, view} = require('./contractServiceFixture.cjs');
const baseline = require('./fixtures/executionContractBaseline.json');

test('the native execution contract facade preserves generation and transaction projection', async t => {
  const f = fixture(); f.install(t);
  const result = await new ChapterExecutionContractService(f.deps).ensureChapterExecutionContract('novel-1', 'chapter-1');
  assert.deepEqual(view({result, captures: f.captures}), baseline);
});

test('contract preparation and evaluation are read only and preserve native publication input', async t => {
  const f = fixture(); f.install(t);
  const service = new ChapterExecutionContractService(f.deps);
  const prepared = await service.prepareChapterExecutionContract('novel-1', 'chapter-1', {}, f.ports);
  assert.deepEqual(f.captures, {});
  const outcome = await service.evaluatePreparedChapterExecutionContract(JSON.parse(JSON.stringify(prepared)), {}, f.ports);
  assert.equal(outcome.kind, 'write');
  assert.equal(f.captures.chapter, undefined);
  assert.equal(f.captures.workspace, undefined);
  const points = [];
  const result = await service.commitPreparedChapterExecutionContract(f.db, prepared, outcome, async (tx, point) => {
    assert.equal(tx, f.db); points.push(point);
  });
  assert.deepEqual(points, ['before', 'after']);
  assert.deepEqual(view(result), baseline.result);
  for (const key of ['chapter', 'workspace', 'version', 'versionUpdate']) assert.deepEqual(view(f.captures[key]), baseline.captures[key]);
  assert.equal(f.captures.event, undefined, 'publication event belongs after the caller transaction');
});
