const test = require('node:test'), assert = require('node:assert/strict');
const { fixture } = require('./preparation/fixture.cjs');
const { createPreparationSteps } = require('../../dist/modules/production/infrastructure/preparation/steps');
const api = () => require('../../dist/app/director/productionKernel/rag');

// Regression (2026-10-31 real-model resume incident): a run frozen while RAG
// was disabled could never resume on a server whose process environment
// differed (retrieval candidate counts / top-K are env-derived), because the
// RAG context asserted the frozen configuration against a live re-read even
// though a disabled configuration cannot influence execution at all.
test('disabled retrieval configuration drift does not block a resumed context', async t => {
  const f = await fixture(t);
  const fence = async () => { await f.db.$transaction(tx => f.assertOwnership(tx, { executionToken: 'lease-1' })); };
  const steps = createPreparationSteps({ checkpoints: f.checkpoints, executionToken: () => 'lease-1', fence }, f.run,
    { content: f.context.content, updatedAt: new Date(0).toISOString(), protectedUserContent: false }, 'prepare-request', 'frozen-source', true).steps;
  const frozen = { version: 1, enabled: false, targets: [], windows: [], retrievalIdentity: 'frozen-identity' };
  const deps = { run: f.run, runId: 'director-test', steps, configuration: structuredClone(frozen),
    readConfiguration: async () => ({ ...frozen, retrievalIdentity: 'drifted-identity' }),
    readSources: async () => 'source', assertIndex: async () => { throw new Error('index must not be asserted while disabled'); },
    fence, recordUsage: async () => {},
    budget: { reserve: async () => true, observe: async () => {}, releaseUndispatched: async () => {} } };
  const result = await api().withKernelRagContext(deps, async () => 'assembled');
  assert.equal(result, 'assembled');

  // Enabled configurations keep the strict drift guard.
  const enabledDeps = { ...deps, configuration: { ...frozen, enabled: true, retrievalIdentity: 'frozen-identity' },
    readConfiguration: async () => ({ ...frozen, enabled: true, retrievalIdentity: 'drifted-identity' }),
    assertIndex: async () => {} };
  await assert.rejects(api().withKernelRagContext(enabledDeps, async () => 'assembled'), /does not match/);
});
