const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('./load.cjs');

test('debt envelope preserves long chapter attribution, obligations and short story messages without guessing', () => {
  const longChapter = {
    source: 'repair_recheck', evaluatedAt: '2026-10-22T07:00:00Z', overallStatus: 'risk',
    rootCauseCode: 'local_patch_plan', recommendedAction: 'patch_repair', terminalAction: 'defer_and_continue',
    blockingObligations: [{ kind: 'promise', summary: '兑现约定', repairability: 'patchable_obligation_gap' }],
    qualityDebtAttribution: { repairAttemptsUsed: 1, repairAttemptsAllowed: 1, firstFailureIssueCodes: ['a'], secondFailureIssueCodes: ['b'] },
    signals: [{ artifactType: 'acceptance', status: 'risk', reason: '遗留项', issueCodes: ['b'] }],
  };
  const input = { longChapter, shortStory: ['节奏偏慢', '保留人物动机'] };
  const envelope = api('createQualityDebtEnvelope')(input);
  assert.deepEqual(JSON.parse(JSON.stringify(envelope)), { version: 1, ...input });
  envelope.longChapter.blockingObligations[0].summary = 'changed';
  assert.equal(longChapter.blockingObligations[0].summary, '兑现约定');
});
test('debt serialization rejects non-JSON values instead of silently discarding evidence', () => {
  const create = api('createQualityDebtEnvelope');
  for (const value of [NaN, Infinity, undefined, () => {}, new Date()]) {
    assert.throws(() => create({ longChapter: { value } }), { name: 'InvalidProductionDataError' });
  }
  const cycle = {}; cycle.self = cycle;
  assert.throws(() => create({ longChapter: cycle }), { name: 'InvalidProductionDataError' });
});
for (const [input, expected] of [
  [{ hasUsableContent: true, replan: 'none', manualPause: false }, 'continue'],
  [{ hasUsableContent: true, replan: 'local_window', manualPause: false }, 'continue'],
  [{ hasUsableContent: true, replan: 'none', manualPause: true }, 'pause_for_manual'],
  [{ hasUsableContent: true, replan: 'global_book', manualPause: false }, 'stop_for_replan'],
  [{ hasUsableContent: false, replan: 'none', manualPause: false }, 'fail'],
  [{ hasUsableContent: true, replan: 'none', manualPause: false, integrityFailure: true }, 'fail'],
  [{ hasUsableContent: true, replan: 'none', manualPause: false, runtimeFailure: true }, 'fail'],
]) test(`structured stop contract: ${JSON.stringify(input)}`, () => {
  assert.equal(api('decideProductionStop')(input).kind, expected);
});
test('fenced save passes both version and edit baseline to atomic repository and checks ownership twice', async () => {
  const events = [];
  const expected = { version: 7, userEditedAt: null };
  const result = await api('saveWithFence')({
    expected, value: '正文', purpose: 'automatic',
    fence: async () => { events.push('fence'); },
    compareAndSave: async (input) => { events.push(input); return { saved: true, value: 8 }; },
  });
  assert.equal(result, 8);
  assert.deepEqual(events, ['fence', { expected, value: '正文' }, 'fence']);
});
test('automatic saves never overwrite human edited baselines and CAS conflicts are not retried', async () => {
  const save = api('saveWithFence');
  let calls = 0;
  const base = { value: 'new', fence: async () => {}, compareAndSave: async () => { calls++; return { saved: false }; } };
  await assert.rejects(save({ ...base, purpose: 'automatic', expected: { version: 2, userEditedAt: 'human' } }), { name: 'ProtectedProductionContentError' });
  assert.equal(calls, 0);
  await assert.rejects(save({ ...base, purpose: 'user_requested', expected: { version: 2, userEditedAt: 'human' } }), { name: 'ProductionVersionConflictError' });
  assert.equal(calls, 1);
});
test('lost ownership prevents any save', async () => {
  let writes = 0;
  await assert.rejects(api('saveWithFence')({ expected: { version: 1, userEditedAt: null }, value: 'x', purpose: 'automatic',
    fence: async () => { throw new Error('cancelled'); }, compareAndSave: async () => { writes++; return { saved: true, value: 2 }; },
  }), /cancelled/);
  assert.equal(writes, 0);
});
