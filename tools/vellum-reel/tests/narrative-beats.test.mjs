import test from 'node:test';
import assert from 'node:assert/strict';
import {activeBeatAt, validateNarrativeBeats} from '../scripts/narrative-beats.mjs';

const beats = [
  {id: 'one', startMs: 1000, endMs: 3000},
  {id: 'two', startMs: 3000, endMs: 5000},
];

test('按时间选择当前叙事节拍', () => {
  assert.equal(activeBeatAt(beats, 2500)?.id, 'one');
  assert.equal(activeBeatAt(beats, 3000)?.id, 'two');
  assert.equal(activeBeatAt(beats, 7000), null);
});

test('拒绝重叠或超出成片的叙事节拍', () => {
  const errors = validateNarrativeBeats([
    {id: 'one', startMs: 0, endMs: 3000},
    {id: 'two', startMs: 2500, endMs: 6200},
  ], 6000);
  assert.equal(errors.length, 2);
});
