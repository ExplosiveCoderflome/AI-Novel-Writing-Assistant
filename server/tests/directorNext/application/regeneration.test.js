const test = require('node:test');
const assert = require('node:assert/strict');
const {regenerationForStep, recoveryBoundarySeq} = require('../../../dist/modules/director/application/revision/regeneration');

const event = (seq, type, payload = {}) => ({seq, type, payload, createdAt: new Date()});
const request = (seq, scope = 'chapter:1-2', guidance = '保留结尾') => event(seq, 'gate_regeneration_requested', {scope, artifactTypes: ['chapter_task_sheet'], guidance});

test('persisted revision guidance survives recovery, stays scoped and expires only when its step succeeds', () => {
  const events = [request(1), event(2, 'execution_failure'), event(3, 'stop_signal_cleared')];
  assert.deepEqual(regenerationForStep(events, 'chapter:1-2', 'chapter_task_sheet', 'detail'), {guidance: '保留结尾'});
  assert.equal(regenerationForStep(events, 'chapter:3-4', 'chapter_task_sheet', 'detail'), undefined);
  assert.equal(regenerationForStep(events, 'chapter:1-2', 'chapter_draft', 'body'), undefined);
  events.push(event(4, 'step_finished', {stepId: 'other'}));
  assert.ok(regenerationForStep(events, 'chapter:1-2', 'chapter_task_sheet', 'detail'));
  events.push(event(5, 'step_finished', {stepId: 'detail'}));
  assert.equal(regenerationForStep(events, 'chapter:1-2', 'chapter_task_sheet', 'detail'), undefined);
  events.push(request(6, 'chapter:1-2', '  '));
  assert.deepEqual(regenerationForStep(events, 'chapter:1-2', 'chapter_task_sheet', 'detail'), {});
});

test('only intentional regeneration or explicit resume resets the automatic attempt series', () => {
  const events = [event(1, 'execution_failure'), event(2, 'step_started')];
  assert.equal(recoveryBoundarySeq(events), 0);
  events.push(request(3), event(4, 'execution_failure'));
  assert.equal(recoveryBoundarySeq(events), 3);
  events.push(event(5, 'stop_signal_cleared'), event(6, 'step_finished'));
  assert.equal(recoveryBoundarySeq(events), 5);
});
