const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { request, harness, hash, copy } = require('./harness.cjs');
const target = path.resolve(__dirname, '../../../dist/modules/production/infrastructure/storyState/reconciliation.js');
const moduleApi = fs.existsSync(target) ? require(target) : {};
function api() { assert.equal(typeof moduleApi.reconcileArtifacts, 'function', 'reconcileArtifacts must be exported'); return moduleApi.reconcileArtifacts; }
async function fixture(options = {}) {
  const req = request();
  req.profile.capabilities = ['character_state'];
  const run = await harness().store.loadOrCreate(req);
  run.activeStage = 'reconcile'; run.activeRequestKey = 'unit-request'; run.progress.committedContentHash = hash('original');
  run.artifacts.original = 'original'; run.progress.selected = 'original'; run.progress.selectedContentHash = hash('original');
  const context = { run, executionToken: 'lease-1', content: 'original', contentHash: hash('original'), requestKey: 'unit-request' };
  const cache = new Map(); const calls = [];
  const checkpoints = {
    async claim(identity, options = {}) {
      const existing = cache.get(identity.stepKey);
      if (existing?.status === 'succeeded') return { status: 'cached', value: copy(existing.value) };
      if (options.existingOnly) return { status: !existing || existing.status === 'ready' ? 'not_started' : 'unknown' };
      if (existing?.status === 'running' && identity.kind === 'model') return { status: 'unknown' };
      if (existing?.status === 'running' && existing.executionToken === identity.executionToken) return { status: 'busy' };
      const token = `claim-${cache.size}-${calls.length}`;
      cache.set(identity.stepKey, { status: 'running', token, executionToken: identity.executionToken });
      return { status: 'claimed', claim: { identity, token } };
    },
    async succeed(claim, value) { cache.set(claim.identity.stepKey, { status: 'succeeded', value: copy(value) }); },
    async fail(claim) { cache.set(claim.identity.stepKey, { status: 'failed' }); },
    async release(claim) { cache.set(claim.identity.stepKey, { status: 'ready' }); },
  };
  const names = ['summary_facts', 'state_snapshot', 'character_resources', 'payoff', 'character_dynamics', 'knowledge', 'mind', 'dialogue_influence', 'character_locations', 'character_appearances'];
  const ports = {
    checkpoints,
    extraction: { prepare: async () => ({ inputFingerprint: options.fingerprint || 'full-input', outputTokens: 100, input: { content: 'original' } }),
      invoke: async () => { calls.push('extract'); if (options.extract) await options.extract(); return { summary: 'extracted' }; },
      validate: value => value },
    consumers: Object.fromEntries(names.map(name => [name, { apply: async () => { calls.push(name); if (options.apply) await options.apply(name); return { [name]: true }; } }])),
    fence: async () => { if (options.fence) await options.fence(); },
    reserve: async () => { calls.push('reserve'); return options.reserve !== false; },
  };
  return { context, ports, cache, calls };
}
test('reconciliation resumes only failed consumers and never extracts twice', async () => {
  const reconcile = api(); let first = true;
  const f = await fixture({ apply: async name => { if (name === 'payoff' && first) { first = false; throw new Error('retryable write'); } } });
  assert.equal((await reconcile(f.context, f.ports)).status, 'pending');
  assert.equal((await reconcile(f.context, f.ports)).status, 'completed');
  assert.equal(f.calls.filter(x => x === 'extract').length, 1);
  assert.equal(f.calls.filter(x => x === 'summary_facts').length, 1);
  assert.equal(f.calls.filter(x => x === 'payoff').length, 2);
  assert.equal(f.calls.filter(x => x === 'character_locations').length, 1);
  assert.equal(f.calls.filter(x => x === 'character_appearances').length, 1);
});
test('an unknown extraction response is never retried after restart', async () => {
  const f = await fixture({ extract: async () => { throw new Error('response lost'); } });
  const reconcile = api();
  assert.equal((await reconcile(f.context, f.ports)).status, 'unknown');
  f.context.executionToken = 'new-owner';
  assert.equal((await reconcile(f.context, f.ports)).status, 'unknown');
  assert.equal(f.calls.filter(x => x === 'extract').length, 1);
});
test('editing or losing ownership during extraction prevents saving or consuming its result', async () => {
  let lost = false;
  const f = await fixture({ extract: async () => { lost = true; }, fence: async () => { if (lost) throw new Error('version changed'); } });
  await assert.rejects(api()(f.context, f.ports), /version changed/);
  assert.ok([...f.cache.values()].every(x => x.status !== 'succeeded'));
  assert.equal(f.calls.includes('summary_facts'), false);
});
test('denied extraction budget cannot invoke the model and retains a safe unresolved claim', async () => {
  const f = await fixture({ reserve: false });
  assert.equal((await api()(f.context, f.ports)).status, 'budget_exhausted');
  assert.equal(f.calls.includes('extract'), false);
});
test('the full prepared fingerprint separates extraction and every consumer checkpoint', async () => {
  const f = await fixture(); const reconcile = api();
  await reconcile(f.context, f.ports);
  f.ports.extraction.prepare = async () => ({ inputFingerprint: 'changed-config', outputTokens: 100, input: { content: 'original' } });
  f.context.requestKey = 'new-unit-request'; f.context.run.activeRequestKey = 'new-unit-request';
  await reconcile(f.context, f.ports);
  assert.equal(f.calls.filter(x => x === 'extract').length, 2);
  assert.equal(f.calls.filter(x => x === 'summary_facts').length, 2);
});
test('budget approval can resume a request that was never dispatched', async () => {
  const f = await fixture({ reserve: false }); const reconcile = api();
  assert.equal((await reconcile(f.context, f.ports)).status, 'budget_exhausted');
  f.ports.reserve = async () => true;
  assert.equal((await reconcile(f.context, f.ports)).status, 'completed');
  assert.equal(f.calls.filter(x => x === 'extract').length, 1);
});
test('strict reconciliation requires and checkpoints a separate full reconciliation step', async () => {
  const f = await fixture(); f.context.run.snapshots.profile.reconcile = 'strict';
  const reconcile = api();
  assert.equal((await reconcile(f.context, f.ports)).status, 'pending');
  f.ports.fullReconcile = { prepare: async () => ({ inputFingerprint: 'full-payoff-window', outputTokens: 100, input: {} }),
    invoke: async () => { f.calls.push('full-reconcile'); return { checked: true }; }, validate: value => value };
  assert.equal((await reconcile(f.context, f.ports)).status, 'pending');
  f.ports.fullReconcileConsumer = { apply: async () => { f.calls.push('full-commit'); return { applied: true }; } };
  assert.equal((await reconcile(f.context, f.ports)).status, 'completed');
  assert.equal((await reconcile(f.context, f.ports)).status, 'completed');
  assert.equal(f.calls.filter(x => x === 'full-reconcile').length, 1);
  assert.equal(f.calls.filter(x => x === 'full-commit').length, 1);
  assert.equal(f.calls.filter(x => x === 'extract').length, 1);
});
test('an unresolved full reconciliation cannot be dispatched again when its live source fingerprint changes', async () => {
  const f = await fixture(); f.context.run.snapshots.profile.reconcile = 'strict';
  let fingerprint = 'ledger-before'; let calls = 0;
  f.ports.fullReconcile = { prepare: async () => ({ inputFingerprint: fingerprint, outputTokens: 100, input: { ledger: fingerprint } }),
    invoke: async () => { calls++; throw new Error('full response lost'); }, validate: value => value };
  assert.equal((await api()(f.context, f.ports)).status, 'unknown');
  fingerprint = 'ledger-after'; f.context.executionToken = 'lease-2';
  assert.equal((await api()(f.context, f.ports)).status, 'unknown');
  assert.equal(calls, 1);
});
test('causal closure requires a durable timeline boundary and checkpoints its model separately', async () => {
  const f = await fixture(); f.context.run.snapshots.profile.capabilities.push('causal_closure');
  assert.equal((await api()(f.context, f.ports)).status, 'pending');
  let apply = 0;
  f.ports.timeline = {
    extraction: { prepare: async () => ({ inputFingerprint: 'timeline', outputTokens: 100, input: {} }),
      invoke: async () => { f.calls.push('timeline-model'); return { timelineGate: {} }; }, validate: value => value },
    consumer: { apply: async () => { apply++; if (apply === 1) throw new Error('write failed'); return { syncMode: 'stable' }; } },
  };
  assert.equal((await api()(f.context, f.ports)).status, 'pending');
  assert.equal((await api()(f.context, f.ports)).status, 'completed');
  assert.equal(f.calls.filter(item => item === 'timeline-model').length, 1);
  assert.equal(f.calls.filter(item => item === 'extract').length, 1);
  assert.equal(apply, 2);
});
function stageApi() {
  const target = path.resolve(__dirname, '../../../dist/modules/production/infrastructure/stages/reconcile.js');
  const value = fs.existsSync(target) ? require(target) : {};
  assert.equal(typeof value.createReconcileStage, 'function', 'createReconcileStage must be exported');
  return value.createReconcileStage;
}
test('reconcile StagePort recovers consumer checkpoints without repeating extraction', async () => {
  let first = true;
  const f = await fixture({ apply: async name => { if (name === 'payoff' && first) { first = false; throw new Error('retry'); } } });
  const port = stageApi()({ ports: f.ports, executionToken: () => f.context.executionToken });
  const descriptor = await port.describe(f.context.run);
  f.context.run.artifacts.activeDescriptor = descriptor;
  const reply = await port.execute(f.context.run, { ...descriptor, requestKey: f.context.requestKey });
  assert.equal(reply.result.status, 'pending');
  const recovered = await port.recover(f.context.run, f.context.requestKey);
  assert.equal(recovered.result.status, 'completed');
  assert.equal(f.calls.filter(x => x === 'extract').length, 1);
});
test('recovering an active reconcile claim cannot dispatch extraction without an existing durable result', async () => {
  const f = await fixture();
  const port = stageApi()({ ports: f.ports, executionToken: () => 'lease' });
  f.context.run.artifacts.activeDescriptor = await port.describe(f.context.run);
  assert.equal((await port.recover(f.context.run, f.context.requestKey)).result.status, 'pending');
  assert.equal(f.calls.includes('extract'), false);
});
test('a reconcile budget refusal clears the unsent unit claim and an explicit later run can finish',async()=>{
 const f=await fixture({reserve:false}),p=harness(),req=request();
 req.profile.capabilities=['character_state'];
 p.stages.reconcile=stageApi()({ports:f.ports,executionToken:()=> 'lease-1'});
 const {runUnit}=require('../../../dist/modules/production');
 const first=await runUnit(req,p);assert.equal(first.status,'budget_exhausted');
 assert.equal([...p.rows.values()][0].activeStage,null);assert.equal(f.calls.includes('extract'),false);
 f.ports.reserve=async()=>true;
 assert.equal((await runUnit(req,p)).status,'completed');assert.equal(f.calls.filter(x=>x==='extract').length,1);
});
test('a physical pre-dispatch refusal releases the extraction claim but a dispatched unknown result stays claimed',async()=>{
 const {ProductionBudgetNotDispatchedError}=require('../../../dist/modules/production/common');
 for(const error of [new ProductionBudgetNotDispatchedError(),new Error('response lost')]) {
  const f=await fixture({extract:async()=>{throw error}});const first=await api()(f.context,f.ports);
  assert.equal(first.status,error instanceof ProductionBudgetNotDispatchedError?'budget_exhausted':'unknown');
  assert.equal([...f.cache.values()][0].status,error instanceof ProductionBudgetNotDispatchedError?'ready':'running');
 }
});
for (const category of ['malformed_json','schema_mismatch','incomplete_json','thinking_pollution','unsupported_native_json']) {
  test(`a known ${category} extraction failure releases the claim and can be retried`, async () => {
    let first = true;
    const f = await fixture({ extract: async () => { if (first) { first = false; const error = new Error(`unusable model output: ${category}`); error.category = category; throw error; } } });
    const reconcile = api();
    assert.equal((await reconcile(f.context, f.ports)).status, 'pending');
    assert.equal([...f.cache.values()][0].status, 'ready');
    assert.equal((await reconcile(f.context, f.ports)).status, 'completed');
    assert.equal(f.calls.filter(x => x === 'extract').length, 2);
  });
}
test('a semantic rejection releases the extraction claim and a later explicit execution finishes it', async () => {
  let first = true;
  const f = await fixture({ extract: async () => {
    if (first) {
      first = false;
      const error = new Error('资源变化缺少证据');
      error.promptQualityFailureKind = 'post_validate_failed';
      throw error;
    }
  } });
  const reconcile = api();
  assert.equal((await reconcile(f.context, f.ports)).status, 'pending');
  assert.equal([...f.cache.values()][0].status, 'ready');
  assert.equal((await reconcile(f.context, f.ports, { recoverOnly: true })).status, 'pending');
  assert.equal(f.calls.filter(x => x === 'extract').length, 1);
  assert.equal((await reconcile(f.context, f.ports)).status, 'completed');
  assert.equal(f.calls.filter(x => x === 'extract').length, 2);
});
test('a prompt transport marker stays claimed and is never retried', async () => {
  const f = await fixture({ extract: async () => {
    const error = new Error('socket hang up');
    error.promptQualityFailureKind = 'llm_error';
    throw error;
  } });
  assert.equal((await api()(f.context, f.ports)).status, 'unknown');
  assert.equal([...f.cache.values()][0].status, 'running');
  assert.equal((await api()(f.context, f.ports)).status, 'unknown');
  assert.equal(f.calls.filter(x => x === 'extract').length, 1);
});
test('a released extraction claim reports pending on recovery and finishes on explicit execution', async () => {
  let first = true;
  const f = await fixture({ extract: async () => { if (first) { first = false; const error = new Error('bad json'); error.category = 'malformed_json'; throw error; } } });
  const reconcile = api();
  assert.equal((await reconcile(f.context, f.ports)).status, 'pending');
  assert.equal((await reconcile(f.context, f.ports, { recoverOnly: true })).status, 'pending');
  assert.equal((await reconcile(f.context, f.ports)).status, 'completed');
  assert.equal(f.calls.filter(x => x === 'extract').length, 2);
});
test('a transport failure stays unknown and is never retried', async () => {
  for (const error of [Object.assign(new Error('connection reset'), { category: 'transport_error' }), new Error('response lost')]) {
    const f = await fixture({ extract: async () => { throw error; } });
    const reconcile = api();
    assert.equal((await reconcile(f.context, f.ports)).status, 'unknown');
    assert.equal([...f.cache.values()][0].status, 'running');
    assert.equal((await reconcile(f.context, f.ports)).status, 'unknown');
    assert.equal(f.calls.filter(x => x === 'extract').length, 1);
  }
});
test('a real StructuredOutputError with a known category is retried', async () => {
  const { StructuredOutputError } = require('../../../dist/llm/structuredOutput');
  const profile = { nativeJsonSchema: false, nativeJsonObject: false, requiresNonThinkingForStructured: false,
    supportsReasoningToggle: false, omitMaxTokensForNativeStructured: false, preferredStructuredStrategy: 'prompt_json', family: 'fixture' };
  const diagnostics = { strategy: 'prompt_json', profile, reasoningForcedOff: false, fallbackAvailable: false, fallbackUsed: false, errorCategory: 'malformed_json' };
  let first = true;
  const f = await fixture({ extract: async () => { if (first) { first = false; throw new StructuredOutputError({ message: 'bad json', category: 'malformed_json', diagnostics }); } } });
  const reconcile = api();
  assert.equal((await reconcile(f.context, f.ports)).status, 'pending');
  assert.equal((await reconcile(f.context, f.ports)).status, 'completed');
  assert.equal(f.calls.filter(x => x === 'extract').length, 2);
});
test('a crash before extraction permits a new execution only after recovery persists an unstarted pending boundary',async()=>{
 const f=await fixture(),p=harness(),req=request();req.profile.capabilities=['character_state'];
 p.stages.reconcile=stageApi()({ports:f.ports,executionToken:()=> 'lease-1'});
 let crash=true;p.fence=async(run,point)=>{if(crash&&run.activeStage==='reconcile'&&point==='before_execute'){crash=false;throw new Error('process exit')}};
 const {runUnit}=require('../../../dist/modules/production');
 await assert.rejects(()=>runUnit(req,p),/process exit/);assert.equal(f.calls.includes('extract'),false);
 assert.equal((await runUnit(req,p)).status,'pending');assert.equal(f.calls.includes('extract'),false);
 assert.equal((await runUnit(req,p)).status,'completed');assert.equal(f.calls.filter(x=>x==='extract').length,1);
});
test('granting budget after completed consumers preserves the frozen extraction input instead of repeating their model',async()=>{
 const f=await fixture(),p=harness(),req=request();req.profile.capabilities=['character_state'];req.profile.reconcile='strict';
 let source='before',reserves=0;
 f.ports.extraction.prepare=async()=>({inputFingerprint:source,outputTokens:100,input:{source}});
 f.ports.consumers.summary_facts.apply=async()=>{source='after';return{saved:true}};
 f.ports.reserve=async()=>++reserves===1;
 f.ports.fullReconcile={prepare:async()=>({inputFingerprint:'full',outputTokens:100,input:{}}),invoke:async()=>({items:[]}),validate:x=>x};
 f.ports.fullReconcileConsumer={apply:async()=>({saved:true})};
 p.stages.reconcile=stageApi()({ports:f.ports,executionToken:()=> 'lease-1'});
 const {runUnit}=require('../../../dist/modules/production');
 assert.equal((await runUnit(req,p)).status,'budget_exhausted');assert.equal(source,'after');
 f.ports.reserve=async()=>true;
 assert.equal((await runUnit(req,p)).status,'completed');assert.equal(f.calls.filter(x=>x==='extract').length,1);
});
test('reconcile StagePort freezes source inputs so its own completed consumers cannot change recovery identity', async () => {
  let first = true;
  const f = await fixture({ apply: async name => { if (name === 'payoff' && first) { first = false; throw new Error('retry'); } } });
  const port = stageApi()({ ports: f.ports, executionToken: () => 'lease' });
  const descriptor = await port.describe(f.context.run);
  const pending = await port.execute(f.context.run, { ...descriptor, requestKey: f.context.requestKey });
  assert.equal(pending.result.status, 'pending');
  Object.assign(f.context.run.artifacts, pending.artifacts);
  f.ports.extraction.prepare = async () => ({ inputFingerprint: 'changed', outputTokens: 100, input: {} });
  const resumedDescriptor = await port.describe(f.context.run);
  assert.equal(resumedDescriptor.inputFingerprint, descriptor.inputFingerprint);
  const result = await port.execute(f.context.run, { ...resumedDescriptor, requestKey: f.context.requestKey });
  assert.equal(result.result.status, 'completed');
  assert.equal(f.calls.filter(x => x === 'extract').length, 1);
});
