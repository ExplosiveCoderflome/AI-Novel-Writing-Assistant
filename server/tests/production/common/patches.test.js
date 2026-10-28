const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('./load.cjs');

test('patches are located together in the original text, then applied from the end', () => {
  const patches = [{ before: '甲', after: '乙' }, { before: '乙', after: '丙' }];
  assert.deepEqual(api('applyTextPatches')('甲-乙', patches), { ok: true, content: '乙-丙', changed: true });
  assert.deepEqual(patches, [{ before: '甲', after: '乙' }, { before: '乙', after: '丙' }]);
});
for (const [label, text, patches, reason] of [
  ['missing anchor', 'abc', [{ before: 'missing', after: 'x' }], 'missing_anchor'],
  ['ambiguous anchor', 'aba', [{ before: 'a', after: 'x' }], 'ambiguous_anchor'],
  ['overlap', 'abcd', [{ before: 'abc', after: 'x' }, { before: 'bcd', after: 'y' }], 'overlapping_patches'],
  ['nested', 'abcd', [{ before: 'abc', after: 'x' }, { before: 'b', after: 'y' }], 'overlapping_patches'],
  ['duplicate', 'abcd', [{ before: 'ab', after: 'x' }, { before: 'ab', after: 'y' }], 'overlapping_patches'],
  ['empty anchor', 'abc', [{ before: '', after: 'x' }], 'empty_anchor'],
  ['overlapping occurrences count as ambiguous', 'aaa', [{ before: 'aa', after: 'x' }], 'ambiguous_anchor'],
]) test(`failed ${label} retains the entire original`, () => {
  const result = api('applyTextPatches')(text, patches);
  assert.equal(result.ok, false);
  assert.equal(result.content, text);
  assert.equal(result.reason, reason);
});
test('deletion, unchanged and empty patch sets are explicit', () => {
  const apply = api('applyTextPatches');
  assert.deepEqual(apply('abc', [{ before: 'b', after: '' }]), { ok: true, content: 'ac', changed: true });
  assert.deepEqual(apply('abc', [{ before: 'b', after: 'b' }]), { ok: true, content: 'abc', changed: false });
  assert.deepEqual(apply('abc', []), { ok: true, content: 'abc', changed: false });
});
test('a later invalid patch never leaks an earlier replacement', () => {
  const result = api('applyTextPatches')('abc', [{ before: 'a', after: 'x' }, { before: 'z', after: 'y' }]);
  assert.equal(result.content, 'abc');
  assert.equal(result.ok, false);
});
