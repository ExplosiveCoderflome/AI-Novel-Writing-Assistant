const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('./load.cjs');

test('context budget includes complete input, output reservation and safety margin at the exact boundary', () => {
  const check = api('checkContextBudget');
  assert.deepEqual(check({ input: '你好🙂', contextWindow: 100, outputTokens: 60, safetyTokens: 30 }),
    { ok: true, estimatedInputTokens: 10, requiredTokens: 100, contextWindow: 100 });
  assert.equal(check({ input: '你好🙂', contextWindow: 99, outputTokens: 60, safetyTokens: 30 }).ok, false);
  assert.equal(check({ input: 'system + tools + user', contextWindow: 24, outputTokens: 4, safetyTokens: 0 }).ok, false);
});
test('explicit tokenizer count is accepted, unknown windows fail closed and invalid values are rejected', () => {
  const check = api('checkContextBudget');
  assert.equal(check({ input: '你好🙂', inputTokenCount: 3, contextWindow: 10, outputTokens: 7, safetyTokens: 0 }).ok, true);
  assert.deepEqual(check({ input: 'a', contextWindow: null, outputTokens: 1, safetyTokens: 0 }),
    { ok: false, reason: 'unknown_context_window', estimatedInputTokens: 1 });
  for (const input of [
    { contextWindow: 0 }, { contextWindow: NaN }, { outputTokens: -1 }, { safetyTokens: Infinity }, { inputTokenCount: 1.5 },
  ]) assert.throws(() => check({ input: 'a', contextWindow: 100, outputTokens: 1, safetyTokens: 0, ...input }), { name: 'InvalidProductionBudgetError' });
});
test('budget reservation must persist before a model call and ownership is checked after the wait', async () => {
  const events = [];
  const result = await api('invokeWithBudget')({ requestKey: 'repair:job:1',
    reserve: async (key) => { events.push(`reserve:${key}`); return { accepted: true, reservationKey: key }; },
    fence: async () => { events.push('fence'); }, invoke: async () => { events.push('model'); return 'saved response'; },
  });
  assert.equal(result, 'saved response');
  assert.deepEqual(events, ['reserve:repair:job:1', 'fence', 'model', 'fence']);
});
test('denied, mismatched or failed reservation cannot call a model', async () => {
  const invoke = api('invokeWithBudget');
  let calls = 0;
  for (const reserve of [
    async () => ({ accepted: false, reservationKey: 'key' }),
    async () => ({ accepted: true, reservationKey: 'wrong' }),
    async () => { throw new Error('database unavailable'); },
  ]) await assert.rejects(invoke({ requestKey: 'key', reserve, fence: async () => {}, invoke: async () => { calls++; } }));
  assert.equal(calls, 0);
});
test('observed failed-call usage is recorded without requiring current writing ownership', async () => {
  const usage = { requestKey: 'stage-1', invocationId: 'physical-1', status: 'failed', inputTokens: 100, outputTokens: 7 };
  const facts = [];
  await api('recordProductionUsage')(usage, async fact => { facts.push(fact); });
  assert.deepEqual(facts, [usage]);
  for (const invalid of [{ ...usage, outputTokens: -1 }, { ...usage, inputTokens: NaN }, { ...usage, invocationId: '' }]) {
    await assert.rejects(api('recordProductionUsage')(invalid, async () => {}), { name: 'InvalidProductionBudgetError' });
  }
  await api('recordProductionUsage')({ ...usage, inputTokens: null, outputTokens: null }, async fact => {
    assert.equal(fact.inputTokens, null);
    assert.equal(fact.outputTokens, null);
  });
});
