const test = require('node:test');
const assert = require('node:assert/strict');
const { api, request, harness, hash, verdict, copy } = require('./harness.cjs');

test('executor persists direct pass, selection and all stage receipts', async () => {
  const ports = harness();
  const outcome = await api('runUnit')(request(), ports);
  assert.equal(outcome.status, 'completed');
  assert.equal(outcome.progress.selected, 'original');
  assert.equal(outcome.progress.committedContentHash, hash('original'));
  assert.deepEqual(ports.calls, ['prepare', 'draft', 'accept', 'commit', 'reconcile']);
  assert.equal(ports.reservations.length, 2);
  assert.deepEqual(ports.reservations.map(x => x.stage), ['draft', 'accept']);
  assert.equal([...ports.rows.values()][0].activeRequestKey, null);
});
test('changed candidate is verified and selected with the one reserved repair allowance', async () => {
  const ports = harness({ originalVerdict: { issues: [{ code: 'fact-gap', severity: 'high', patchable: true }] } });
  const outcome = await api('runUnit')(request(), ports);
  assert.equal(outcome.status, 'completed');
  assert.equal(outcome.progress.selected, 'candidate');
  assert.equal(outcome.progress.repairAttemptsUsed, 1);
  assert.deepEqual(ports.calls, ['prepare', 'draft', 'accept', 'repair', 'verify', 'commit', 'reconcile']);
  assert.equal(ports.reservations.filter(x => x.stage === 'repair').length, 1);
});
for (const crashAfter of ['draft', 'repair', 'commit']) test(`restart after saved ${crashAfter} reuses saved results`, async () => {
  let crashed = false;
  const ports = harness({ originalVerdict: { issues: [{ code: 'gap', severity: 'high', patchable: true }] },
    afterSave: async row => { if (!crashed && row.progress.completed.includes(crashAfter)) { crashed = true; throw new Error('simulated process exit'); } },
  });
  const run = api('runUnit');
  await assert.rejects(run(request(), ports), /simulated process exit/);
  const outcome = await run(request(), ports);
  assert.equal(outcome.status, 'completed');
  assert.equal(outcome.progress.selected, 'candidate');
  for (const stage of ['draft', 'repair', 'commit']) assert.equal(ports.calls.filter(x => x === stage).length, 1);
});
test('unknown model outcome retains its claim and recovery never automatically resends', async () => {
  const ports = harness({ execute: async stage => { if (stage === 'draft') throw new Error('transport closed after sending'); } });
  const run = api('runUnit');
  assert.equal((await run(request(), ports)).status, 'unknown');
  assert.equal((await run(request(), ports)).status, 'unknown');
  assert.equal(ports.calls.filter(x => x === 'draft').length, 1);
  assert.equal([...ports.rows.values()][0].activeStage, 'draft');
});
test('recovery accepts only durable matching results and does not execute an active stage', async () => {
  let fail = true;
  const ports = harness({ execute: async stage => { if (stage === 'draft' && fail) { fail = false; throw new Error('crash'); } },
    recover: async stage => stage === 'draft' ? { result: { stage, contentHash: hash('original') }, artifacts: { original: 'original' } } : undefined,
  });
  const run = api('runUnit');
  assert.equal((await run(request(), ports)).status, 'unknown');
  assert.equal((await run(request(), ports)).status, 'completed');
  assert.equal(ports.calls.filter(x => x === 'draft').length, 1);
});
test('resuming with a changed model, policy or profile fails instead of reusing stale results', async () => {
  const ports = harness(); const req = request(); const run = api('runUnit');
  await run(req, ports);
  for (const change of [
    { model: { ...req.model, model: 'other' } },
    { policy: { blockingAction: 'pause_for_manual' } },
    { profile: { ...req.profile, context: 'other' } },
    { policySource: { issueActions: { 'quality.obligation_gap': 'pause_for_manual' } } },
  ]) await assert.rejects(run({ ...req, ...change }, ports), { name: 'ProductionSnapshotConflictError' });
  assert.equal(ports.calls.filter(x => x === 'draft').length, 1);
});
test('model snapshots reject unknown fields including credentials before creating a run', async () => {
  const ports = harness(); const req = request();
  await assert.rejects(api('runUnit')({ ...req, model: { ...req.model, apiKey: 'do-not-store' } }, ports), { name: 'InvalidProductionRequestError' });
  assert.equal(ports.rows.size, 0);
});
test('ownership lost during a model call prevents saving its response', async () => {
  let edited = false;
  const ports = harness({ execute: async stage => { if (stage === 'draft') edited = true; },
    fence: async () => { if (edited) throw new Error('protected content changed'); },
  });
  await assert.rejects(api('runUnit')(request(), ports), /protected content changed/);
  assert.equal([...ports.rows.values()][0].progress.original, undefined);
  assert.equal(ports.calls.includes('commit'), false);
});
test('denied budget never calls a model or consumes repair progress', async () => {
  const ports = harness({ denyBudget: true });
  const outcome = await api('runUnit')(request(), ports);
  assert.equal(outcome.status, 'budget_exhausted');
  assert.deepEqual(ports.calls, ['prepare']);
  assert.equal(outcome.progress.repairAttemptsUsed, 0);
});
test('two concurrent executors cannot both dispatch the same stage', async () => {
  const ports = harness(); const run = api('runUnit');
  const outcomes = await Promise.all([run(request(), ports), run(request(), ports)]);
  assert.ok(outcomes.some(x => x.status === 'completed'));
  assert.ok(outcomes.some(x => x.status === 'busy' || x.status === 'unknown'));
  assert.equal(ports.calls.filter(x => x === 'draft').length, 1);
});
test('stage content hash mismatch never advances or commits', async () => {
  const ports = harness({ execute: async stage => stage === 'draft' ? { result: { stage, contentHash: hash('different') }, artifacts: { original: 'actual' } } : undefined });
  await assert.rejects(api('runUnit')(request(), ports), { name: 'InvalidUnitTransitionError' });
  assert.equal([...ports.rows.values()][0].progress.original, undefined);
});
test('request identity includes all actual stage inputs and canonical configuration', () => {
  const key = api('createStageRequestKey');
  const req = request();
  const descriptor = { callsModel: true, outputTokens: 4096, inputFingerprint: 'full-prompt-v1', promptVersion: 'v1', configVersion: 'v1' };
  const first = key(req, 'accept', descriptor, hash('original'));
  for (const variant of [
    { ...descriptor, inputFingerprint: 'full-prompt-v2' }, { ...descriptor, promptVersion: 'v2' }, { ...descriptor, configVersion: 'v2' },
  ]) assert.notEqual(key(req, 'accept', variant, hash('original')), first);
  assert.notEqual(key(req, 'accept', descriptor, hash('candidate')), first);
  assert.equal(key({ ...req, model: Object.fromEntries(Object.entries(req.model).reverse()) }, 'accept', descriptor, hash('original')), first);
});
test('empty draft produces an explicit unusable failure without committing', async () => {
  const ports = harness({ execute: async stage => stage === 'draft' ? { result: { stage, contentHash: null } } : undefined });
  const outcome = await api('runUnit')(request(), ports);
  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.reason, 'no_usable_content');
  assert.equal(ports.calls.includes('commit'), false);
});
test('known repair failure retains original, records debt and finishes', async () => {
  const ports = harness({ originalVerdict: { issues: [{ code: 'gap', severity: 'high', patchable: true }] },
    execute: async stage => stage === 'repair' ? { result: { stage, outcome: 'failed' } } : undefined,
  });
  const outcome = await api('runUnit')(request(), ports);
  assert.equal(outcome.status, 'completed');
  assert.equal(outcome.progress.selected, 'original');
  assert.equal(outcome.progress.debtRecorded, true);
});
test('failure saving a model response leaves an unknown claim instead of dispatching again', async () => {
  let failing = true;
  const ports = harness({ beforeSave: async (row, next) => {
    if (failing && row.activeStage === 'draft' && next.progress.completed.includes('draft')) { failing = false; throw new Error('disk full'); }
  } });
  const run = api('runUnit');
  await assert.rejects(run(request(), ports), /disk full/);
  assert.equal((await run(request(), ports)).status, 'unknown');
  assert.equal(ports.calls.filter(x => x === 'draft').length, 1);
});
test('a model stage without a resolved output budget fails before dispatch', async () => {
  const req = request(); delete req.profile.outputBudgets.draft;
  const ports = harness();
  await assert.rejects(api('runUnit')(req, ports), { name: 'InvalidProductionRequestError' });
  assert.equal(ports.calls.includes('draft'), false);
});
test('actual stage output budget is reserved and cannot exceed the frozen profile cap', async () => {
  const ports = harness(); const describe = ports.stages.draft.describe;
  ports.stages.draft.describe = async row => ({ ...await describe(row), outputTokens: 5000 });
  assert.equal((await api('runUnit')(request(), ports)).status, 'completed');
  assert.equal(ports.reservations.find(x => x.stage === 'draft').outputTokens, 5000);
  const excessive = harness();
  excessive.stages.draft.describe = async row => ({ ...await describe(row), outputTokens: 7000 });
  await assert.rejects(api('runUnit')(request(), excessive), { name: 'InvalidProductionRequestError' });
  assert.equal(excessive.calls.includes('draft'), false);
});
test('a persisted active request cannot recover under a different actual input fingerprint', async () => {
  let lookups = 0;
  const ports = harness({ execute: async stage => { if (stage === 'draft') throw new Error('unknown'); },
    recover: async () => { lookups++; return undefined; },
  });
  const run = api('runUnit');
  assert.equal((await run(request(), ports)).status, 'unknown');
  [...ports.rows.values()][0].artifacts.activeDescriptor.inputFingerprint = 'changed';
  await assert.rejects(run(request(), ports), { name: 'InvalidProductionRequestError' });
  assert.equal(lookups, 0);
});
