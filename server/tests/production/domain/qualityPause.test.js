const { test } = require('node:test');
const { assert, call, profile, accepted, next } = require('./fixtures.cjs');
const manual = { blockingAction: 'pause_for_manual' };
function savedRisk() {
  let p = accepted({ repairAttemptsUsed: 1 });
  p = call('applyUnitAction', p, { kind: 'select_final', selected: 'original', contentHash: 'original', reasonCode: 'original_retained' });
  p = call('applyUnitAction', p, next(p));
  return call('applyStageResult', p, { stage: 'commit', contentHash: 'original' });
}
test('quality-first spends its allowed repair before deciding to pause at the saved chapter boundary', () => {
  assert.deepEqual(next(accepted(), profile(), manual), { kind: 'run_stage', stage: 'repair' });
  assert.equal(next(accepted({ repairAttemptsUsed: 1 }), profile(), manual).kind, 'select_final');
  const saved = savedRisk();
  const action = next(saved, profile(), manual);
  assert.equal(action.kind, 'record_quality_pause');
  const paused = call('applyUnitAction', saved, action);
  assert.equal(next(paused, profile(), manual).kind, 'pause_for_manual');
  assert.ok(paused.completed.includes('commit'));
});
test('automatic recovery cannot clear a persisted manual pause', () => {
  const saved = savedRisk();
  const paused = call('applyUnitAction', saved, next(saved, profile(), manual));
  for (let i = 0; i < 3; i++) assert.equal(next(JSON.parse(JSON.stringify(paused)), profile(), manual).kind, 'pause_for_manual');
});
test('explicit quality recovery is hash-bound and only resumes the saved manuscript', () => {
  const saved = savedRisk();
  const paused = call('applyUnitAction', saved, next(saved, profile(), manual));
  const acknowledge = { kind: 'acknowledge_quality_pause', contentHash: 'original' };
  const resumed = call('applyUnitAction', paused, acknowledge);
  assert.deepEqual(next(resumed, profile(), manual), { kind: 'run_stage', stage: 'reconcile' });
  assert.deepEqual(call('applyUnitAction', resumed, acknowledge), resumed);
  assert.throws(() => call('applyUnitAction', paused, { ...acknowledge, contentHash: 'stale' }), { name: 'InvalidUnitTransitionError' });
  assert.throws(() => call('applyUnitAction', { ...paused, userEditedSinceStart: true }, acknowledge), { name: 'InvalidUnitTransitionError' });
  assert.throws(() => call('applyUnitAction', accepted(), acknowledge), { name: 'InvalidUnitTransitionError' });
});
