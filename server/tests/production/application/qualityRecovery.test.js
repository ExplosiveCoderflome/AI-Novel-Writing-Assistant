const test = require('node:test');
const assert = require('node:assert/strict');
const { api, request, harness, hash } = require('./harness.cjs');
function req() { return request({ policy: { blockingAction: 'pause_for_manual' } }); }
function ports() { return harness({ originalVerdict: { issues: [{ code: 'risk', severity: 'high', patchable: false }] } }); }
test('quality pause preserves the saved manuscript and cannot be cleared by automatic restart', async () => {
  const p = ports();
  const first = await api('runUnit')(req(), p);
  assert.equal(first.status, 'paused');
  assert.equal(first.progress.committedContentHash, hash('original'));
  assert.equal(first.progress.qualityPause.acknowledged, false);
  assert.equal((await api('runUnit')(req(), p)).status, 'paused');
  assert.equal(p.calls.filter(x => x === 'commit').length, 1);
  assert.equal(p.calls.includes('reconcile'), false);
});
test('explicit authorized recovery acknowledges the existing hash without changing policy snapshots', async () => {
  const p = ports(); await api('runUnit')(req(), p);
  const row = [...p.rows.values()][0]; let authorized = 0;
  await api('acknowledgeUnitQualityPause')({ run: row, contentHash: hash('original') }, {
    store: p.store, authorizeExplicitRecovery: async current => { assert.equal(current.id, row.id); authorized++; },
  });
  assert.equal(authorized, 1);
  assert.equal((await api('runUnit')(req(), p)).status, 'completed');
  assert.equal([...p.rows.values()][0].snapshots.policy.blockingAction, 'pause_for_manual');
});
test('missing recovery authorization or a stale version cannot clear the quality pause', async () => {
  const p = ports(); await api('runUnit')(req(), p);
  const row = [...p.rows.values()][0];
  await assert.rejects(api('acknowledgeUnitQualityPause')({ run: row, contentHash: hash('original') }, {
    store: p.store, authorizeExplicitRecovery: async () => { throw new Error('no explicit command'); },
  }), /no explicit command/);
  assert.equal([...p.rows.values()][0].progress.qualityPause.acknowledged, false);
  await api('acknowledgeUnitQualityPause')({ run: row, contentHash: hash('original') }, { store: p.store, authorizeExplicitRecovery: async () => {} });
  await assert.rejects(api('acknowledgeUnitQualityPause')({ run: row, contentHash: hash('original') }, {
    store: p.store, authorizeExplicitRecovery: async () => {},
  }), { name: 'ProductionVersionConflictError' });
});
