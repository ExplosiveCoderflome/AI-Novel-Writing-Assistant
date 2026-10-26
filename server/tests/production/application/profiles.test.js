const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const target = path.resolve(__dirname, '../../../dist/modules/production/profiles/longChapter.js');
const profiles = fs.existsSync(target) ? require(target) : {};

test('long chapter profiles preserve existing stage output budgets and one repair ceiling', () => {
  assert.equal(typeof profiles.createLongChapterProfile, 'function');
  const profile = profiles.createLongChapterProfile('standard');
  assert.equal(profile.id, 'long_chapter@1');
  assert.deepEqual(profile.outputBudgets, { draft: 6000, accept: 4096, repair: 4200, verify: 6144 });
  assert.deepEqual(profile.repair, { maxAttempts: 1, mode: 'light_repair' });
  assert.equal(profile.reconcile, 'adaptive');
});
test('fast keeps audit but omits repair; strict changes reconciliation without overriding issue policy', () => {
  assert.equal(typeof profiles.createLongChapterProfile, 'function');
  const fast = profiles.createLongChapterProfile('fast');
  assert.ok(fast.stages.includes('accept'));
  assert.ok(!fast.stages.includes('repair'));
  assert.ok(!fast.stages.includes('verify'));
  assert.ok(!fast.stages.includes('select'));
  assert.equal(fast.repair.maxAttempts, 0);
  assert.equal(fast.reconcile, 'deferred');
  const strict = profiles.createLongChapterProfile('strict');
  assert.equal(strict.repair.maxAttempts, 1);
  assert.equal(strict.reconcile, 'strict');
  assert.equal(strict.blockingAction, undefined);
});
test('profiles have independent data and reject unknown variants', () => {
  assert.equal(typeof profiles.createLongChapterProfile, 'function');
  const first = profiles.createLongChapterProfile('standard');
  first.stages.pop(); first.capabilities.pop(); first.outputBudgets.draft = 1;
  const next = profiles.createLongChapterProfile('standard');
  assert.ok(next.stages.includes('reconcile'));
  assert.equal(next.outputBudgets.draft, 6000);
  assert.equal(next.capabilities.length, 7);
  assert.throws(() => profiles.createLongChapterProfile('unsupported'), { name: 'InvalidProductionProfileError' });
});
