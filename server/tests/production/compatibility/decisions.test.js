const test = require('node:test');
const assert = require('node:assert/strict');
const { fixtures } = require('./fixtures.cjs');
const { compare } = require('./compare.cjs');
for (const fixture of fixtures) test(`decision comparison: ${fixture.id}`, async () => {
  const result = await compare(fixture);
  assert.ok(['original', 'candidate'].includes(result.old.selected));
  assert.ok(['original', 'candidate'].includes(result.kernel.selected));
  if (fixture.id === 'score_only') { assert.equal(result.old.repairs, 1); assert.equal(result.kernel.repairs, 0); }
  if (fixture.id === 'facts_unknown' || fixture.id === 'facts_changed') { assert.equal(result.old.selected, 'candidate'); assert.equal(result.kernel.selected, 'original'); }
  if (fixture.id === 'facts_preserved') { assert.equal(result.old.selected, 'candidate'); assert.equal(result.kernel.selected, 'candidate'); }
  if (fixture.id === 'new_severe' || fixture.id === 'new_obligation') { assert.equal(result.old.selected, 'original'); assert.equal(result.kernel.selected, 'original'); }
  if (fixture.manual) { assert.equal(result.kernel.status, 'paused'); assert.equal(result.kernel.synced, false); assert.equal(result.old.synced, true); }
});
