const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const target = path.resolve(__dirname, '../../../dist/app/director/productionKernel/outcomeMapping');
const api = fs.existsSync(target + '.js') ? require(target) : {};
function map(outcome) { assert.equal(typeof api.mapProductionUnitOutcome, 'function'); return api.mapProductionUnitOutcome(outcome); }
function finished(extra = {}) {
  return { unit: { novelId: 'n', chapterId: 'c', order: 2 }, completed: ['commit', 'reconcile'], repairAttemptsUsed: 1,
    selected: 'original', selectedContentHash: 'saved', committedContentHash: 'saved', reconcileStatus: 'completed', ...extra };
}
test('completed and degraded units close with local debts and preserve the original progress', () => {
  const progress = finished({ reconcileStatus: 'degraded', debts: [{ code: 'local_gap', severity: 'high', source: 'accept' }] });
  const before = JSON.stringify(progress); const result = map({ status: 'completed', progress });
  assert.equal(result.closed, true); assert.equal(result.stopSignal, undefined);
  assert.deepEqual(result.debts, [{ chapterOrder: 2, code: 'local_gap', action: 'defer_and_continue' }]);
  assert.equal(JSON.stringify(progress), before);
});
test('pending, unknown, busy and exhausted budget remain recoverable and cannot close a chapter', () => {
  for (const status of ['pending', 'unknown', 'busy', 'budget_exhausted']) {
    const result = map({ status, progress: finished() });
    assert.equal(result.closed, false);
    assert.equal(result.stopSignal.kind, 'manual_recovery');
    assert.equal(result.stopSignal.action, 'pause_for_manual');
    assert.equal(result.stopSignal.source, 'runtime');
  }
});
test('quality pause only projects after the retained manuscript was saved', () => {
  const progress = finished({ completed: ['commit'], qualityPause: { contentHash: 'saved', acknowledged: false, reason: 'blocking_quality_policy' } });
  const result = map({ status: 'paused', progress });
  assert.equal(result.stopSignal.kind, 'manual_recovery'); assert.equal(result.stopSignal.source, 'quality');
  assert.equal(result.closed, false);
  assert.equal(map({ status: 'paused', progress: { ...progress, committedContentHash: null } }).stopSignal.kind, 'data_integrity');
});
test('only an explicit global-book replan can project a director replan', () => {
  assert.equal(map({ status: 'stopped', progress: finished(), reason: 'global_book' }).stopSignal.kind, 'replan');
  assert.notEqual(map({ status: 'stopped', progress: finished(), reason: 'local_window' }).stopSignal.kind, 'replan');
  assert.equal(map({ status: 'failed', progress: finished(), reason: 'no_usable_content' }).stopSignal.kind, 'no_usable_content');
  assert.equal(map({ status: 'failed', progress: finished(), reason: 'data_integrity' }).stopSignal.kind, 'data_integrity');
});
test('a completed label cannot hide missing reconciliation or a mismatched retained manuscript', () => {
  for (const progress of [finished({ completed: ['commit'] }), finished({ reconcileStatus: 'pending' }), finished({ selectedContentHash: 'other' })]) {
    const result = map({ status: 'completed', progress });
    assert.equal(result.closed, false); assert.equal(result.stopSignal.kind, 'data_integrity');
  }
});
