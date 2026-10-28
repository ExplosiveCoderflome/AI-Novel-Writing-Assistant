const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./persistence/sqliteFixture.cjs');
const { output } = require('./persistence/outputs.cjs');

async function consumerFixture(t, options = {}) {
  const f = await setup(t);
  assert.equal(typeof f.kernel.createArtifactConsumers, 'function', 'durable consumer factory must exist');
  await f.db.character.create({ data: { id: 'hero', novelId: 'novel-1', name: '主角', role: '主角', personality: '', background: '', development: '' } });
  const consumers = f.kernel.createArtifactConsumers({ checkpoints: f.checkpoints, ...options });
  const apply = async (name, value = output(), previous = {}) => {
    const claimed = await f.checkpoints.claim(f.identity(name));
    if (claimed.status === 'cached') return claimed.value;
    return consumers[name].apply({ context: f.context, output: value, previous, stepKey: f.identity(name).stepKey, claim: claimed.claim });
  };
  return { ...f, consumers, apply };
}
test('recovery distinguishes an unstarted model checkpoint from an unknown dispatched claim without creating rows',async t=>{
 const f=await setup(t),identity={...f.identity('extraction'),kind:'model'};
 const before=await f.db.chapterArtifactSyncCheckpoint.count();
 assert.equal((await f.checkpoints.claim(identity,{existingOnly:true})).status,'not_started');
 assert.equal(await f.db.chapterArtifactSyncCheckpoint.count(),before);
 const claimed=await f.checkpoints.claim(identity);
 assert.equal((await f.checkpoints.claim(identity,{existingOnly:true})).status,'unknown');
 await f.checkpoints.release(claimed.claim);
 assert.equal((await f.checkpoints.claim(identity,{existingOnly:true})).status,'not_started');
});

test('consumer write and claim receipt commit together and a repeated acknowledgement is idempotent', async t => {
  const f = await setup(t);
  assert.equal(typeof f.checkpoints.applyConsumer, 'function', 'atomic consumer writer must exist');
  const claimed = await f.checkpoints.claim(f.identity('summary_facts'));
  const result = await f.checkpoints.applyConsumer(claimed.claim, async tx => {
    await tx.chapterSummary.create({ data: { novelId: 'novel-1', chapterId: 'chapter-1', summary: '已保存' } });
    return { concreteFactCount: 0 };
  });
  assert.deepEqual(result, { concreteFactCount: 0 });
  await f.checkpoints.succeed(claimed.claim, result);
  assert.deepEqual(await f.checkpoints.claim(f.identity('summary_facts')), { status: 'cached', value: result });
  assert.deepEqual(await f.checkpoints.applyConsumer(claimed.claim, async () => { throw new Error('must not repeat business write'); }), result);
  assert.equal(await f.db.chapterSummary.count(), 1);
});

test('timeline writes, legacy checkpoint and kernel receipt share a guarded transaction', async t => {
  const f = await setup(t);
  assert.equal(typeof f.kernel.createTimelineConsumer, 'function');
  const bind = require('./persistence/nativeServices.cjs').timeline();
  const consumer = f.kernel.createTimelineConsumer({ checkpoints: f.checkpoints, forTransaction: bind });
  const identity = f.identity('timeline_boundary'); const claimed = await f.checkpoints.claim(identity);
  const saved = { contentHash: f.context.contentHash, timelineGate: { result: { status: 'passed', score: 1, issues: [] },
    extractedEvents: [], extractedHooks: [], addressedHookIds: [], resolvedHookIds: [], extractorSucceeded: true,
    timelineContext: { chapterIndex: 1, previousEvents: [], openHooks: [], plannedEventsThisChapter: [], forbiddenEvents: [] } } };
  const input = { context: f.context, output: saved, previous: {}, stepKey: identity.stepKey, claim: claimed.claim };
  const result = await consumer.apply(input);
  assert.equal(result.syncMode, 'stable');
  assert.equal(await f.db.chapterTimeAnchor.count(), 1);
  assert.equal(await f.db.timelineCheckReport.count(), 1);
  assert.equal(await f.db.chapterArtifactSyncCheckpoint.count({ where: { artifactType: 'timeline_finalization', status: 'succeeded' } }), 1);
  await consumer.apply(input);
  assert.equal(await f.db.timelineCheckReport.count(), 1);
  await f.revoke();
  await assert.rejects(consumer.apply(input), /ownership lost/);
});
test('revoking ownership after the outer claim prevents the actual consumer transaction', async t => {
  const f = await setup(t);
  assert.equal(typeof f.checkpoints.applyConsumer, 'function', 'atomic consumer writer must exist');
  const claimed = await f.checkpoints.claim(f.identity('summary_facts'));
  await f.revoke(); let wrote = false;
  await assert.rejects(f.checkpoints.applyConsumer(claimed.claim, async tx => {
    wrote = true; await tx.chapterSummary.create({ data: { novelId: 'novel-1', chapterId: 'chapter-1', summary: '过期' } }); return {};
  }), /ownership lost/);
  assert.equal(wrote, false);
  assert.equal(await f.db.chapterSummary.count(), 0);
});
test('a failed consumer transaction rolls back every business row and leaves no success receipt', async t => {
  const f = await setup(t);
  assert.equal(typeof f.checkpoints.applyConsumer, 'function', 'atomic consumer writer must exist');
  const identity = f.identity('summary_facts'); const claimed = await f.checkpoints.claim(identity);
  await assert.rejects(f.checkpoints.applyConsumer(claimed.claim, async tx => {
    await tx.chapterSummary.create({ data: { novelId: 'novel-1', chapterId: 'chapter-1', summary: '回滚' } });
    await tx.$executeRaw`UPDATE "KernelTestLease" SET "active" = ${0} WHERE "id" = ${1}`;
    return {};
  }), /ownership lost/);
  assert.equal(await f.db.chapterSummary.count(), 0);
  assert.equal((await f.checkpoints.claim(identity)).status, 'busy');
});

for (const change of ['manuscript', 'stage']) test(`an in-transaction ${change} change rolls back business writes and the success receipt`, async t => {
  const f = await setup(t); const identity = f.identity('summary_facts'); const claimed = await f.checkpoints.claim(identity);
  await assert.rejects(f.checkpoints.applyConsumer(claimed.claim, async tx => {
    await tx.chapterSummary.create({ data: { novelId: 'novel-1', chapterId: 'chapter-1', summary: '必须回滚' } });
    if (change === 'manuscript') await tx.chapter.update({ where: { id: 'chapter-1' }, data: { content: '用户编辑' } });
    else await tx.productionUnitRun.update({ where: { id: f.context.run.id }, data: { activeRequestKey: 'other-stage-request' } });
    return {};
  }), { name: 'ProductionVersionConflictError' });
  assert.equal(await f.db.chapterSummary.count(), 0);
  assert.equal((await f.db.chapter.findFirst()).content, f.context.content);
  assert.equal((await f.checkpoints.claim(identity)).status, 'busy');
});

test('a failed timeline check commits a degraded anchor under the same guarded receipt', async t => {
  const f = await setup(t); const identity = f.identity('timeline_boundary'); const claim = await f.checkpoints.claim(identity);
  const consumer = f.kernel.createTimelineConsumer({ checkpoints: f.checkpoints, forTransaction: require('./persistence/nativeServices.cjs').timeline() });
  const result = await consumer.apply({ context: f.context, output: { contentHash: f.context.contentHash,
    timelineGate: { result: { status: 'failed', score: 0.4, issues: [] }, extractedEvents: [], extractedHooks: [], addressedHookIds: [], resolvedHookIds: [], extractorSucceeded: true,
      timelineContext: { currentTime: { storyDayIndex: 2, label: '次日' }, previousEvents: [], openHooks: [], plannedEventsThisChapter: [], forbiddenEvents: [] } } },
    previous: {}, stepKey: identity.stepKey, claim: claim.claim });
  assert.equal(result.syncMode, 'degraded');
  assert.equal((await f.db.chapterTimeAnchor.findFirst()).timeLabel, '次日');
  assert.equal(await f.db.storyTimelineEvent.count(), 0);
  assert.equal(await f.db.chapterArtifactSyncCheckpoint.count({ where: { artifactType: 'timeline_finalization', syncMode: 'degraded', status: 'succeeded' } }), 1);
});

test('real summary, state, payoff, dynamics, knowledge, mind and projections persist with per-consumer receipts', async t => {
  const f = await consumerFixture(t); const previous = {};
  for (const name of f.kernel.ARTIFACT_CONSUMERS) previous[name] = await f.apply(name, output(), previous);
  assert.equal((await f.db.chapterSummary.findFirst()).summary, '主角交出钥匙并约定返回');
  assert.equal(await f.db.novelFactEntry.count(), 1);
  assert.equal(await f.db.ragIndexJob.count(), 2);
  assert.equal(await f.db.storyStateSnapshot.count(), 1);
  assert.equal(await f.db.characterState.count(), 1);
  assert.equal(await f.db.informationState.count(), 1);
  assert.equal(await f.db.payoffLedgerItem.count(), 1);
  assert.equal(await f.db.characterFactionTrack.count(), 1);
  assert.equal(await f.db.characterMindSnapshot.count(), 1);
  assert.match((await f.db.character.findFirst()).currentState, /约定返回/);
  assert.equal(previous.character_appearances.coverage, 'recorded');
  const legacyHash = require('../../dist/services/novel/runtime/artifactSync/ChapterArtifactContentVersion').buildChapterArtifactContentHash(f.context.content);
  const projections = await f.db.chapterArtifactSyncCheckpoint.findMany({ where: { artifactType: { in: ['character_location_projection:v1', 'director_v2_character_appearances:v1', 'artifact_delta_extraction:v1'] } } });
  assert.equal(projections.length, 3);
  assert.ok(projections.every(row => row.contentHash === legacyHash));
  assert.equal((await f.db.chapterArtifactSyncCheckpoint.findMany({ where: { artifactType: { startsWith: 'production_kernel@1:' }, status: 'succeeded' } })).length, 10);
  for (const name of f.kernel.ARTIFACT_CONSUMERS) await f.apply(name, output(), previous);
  assert.equal(await f.db.characterMindSnapshot.count(), 1);
  assert.equal(await f.db.characterFactionTrack.count(), 1);
  assert.equal(await f.db.ragIndexJob.count(), 2);
});
test('all real consumers reject a revoked lease even when the manuscript is unchanged', async t => {
  const f = await consumerFixture(t);
  const claims = await Promise.all(f.kernel.ARTIFACT_CONSUMERS.map(name => f.checkpoints.claim(f.identity(name))));
  await f.revoke();
  for (let index = 0; index < claims.length; index++) {
    const name = f.kernel.ARTIFACT_CONSUMERS[index];
    await assert.rejects(f.consumers[name].apply({ context: f.context, output: output(), previous: {}, stepKey: f.identity(name).stepKey, claim: claims[index].claim }), /ownership lost/);
  }
  for (const model of ['chapterSummary', 'novelFactEntry', 'storyStateSnapshot', 'payoffLedgerItem', 'characterFactionTrack', 'characterMindSnapshot']) assert.equal(await f.db[model].count(), 0, model);
});
test('foreign structured identities cannot become this novel character state or appearance', async t => {
  const f = await consumerFixture(t);
  const changed = output({ stateDeltas: { characterStates: [{ characterId: 'foreign', characterName: '主角', currentGoal: '错误目标' }] },
    characterAppearances: [{ characterId: 'foreign', characterName: '主角', kind: 'present', summary: '交出钥匙', evidence: '主角在城门' }] });
  assert.equal((await f.apply('state_snapshot', changed)).unresolvedIdentityCount, 1);
  assert.equal(await f.db.characterState.count(), 0);
  const appearances = await f.apply('character_appearances', changed);
  assert.equal(appearances.coverage, 'untracked');
});

function resource(extra = {}) {
  return { resourceName: '城门钥匙', resourceType: 'credential', updateType: 'used', holderCharacterName: '主角',
    ownerType: 'character', ownerName: '主角', statusAfter: 'available', readerKnows: true, holderKnows: true,
    narrativeFunction: 'key', narrativeImpact: '交出钥匙后约定返回', evidence: ['主角在城门交出钥匙'],
    riskLevel: 'low', confidence: 0.9, reviewDecision: 'commit', ...extra };
}
test('approved resource writes create a real full canonical version and are not repeated on recovery', async t => {
  const f = await setup(t);
  const native = require('./persistence/nativeServices.cjs').resources();
  assert.equal(typeof f.kernel.createResourceVersionRecorder, 'function');
  const versions = f.kernel.createResourceVersionRecorder(native);
  const consumers = f.kernel.createArtifactConsumers({ checkpoints: f.checkpoints, resources: versions });
  await f.db.character.create({ data: { id: 'hero', novelId: 'novel-1', name: '主角', role: '主角', personality: '', background: '', development: '' } });
  const claim = await f.checkpoints.claim(f.identity('character_resources'));
  const input = { context: f.context, output: output({ characterResourceDeltas: [resource()] }), previous: {}, stepKey: f.identity('character_resources').stepKey, claim: claim.claim };
  const result = await consumers.character_resources.apply(input);
  assert.equal(result.committedCount, 1);
  assert.equal(await f.db.characterResourceEvent.count(), 1);
  const proposal = await f.db.stateChangeProposal.findFirst();
  const version = await f.db.canonicalStateVersion.findFirst();
  assert.equal(proposal.committedVersionId, version.id);
  const snapshot = JSON.parse(version.snapshotJson);
  assert.equal(snapshot.novelId, 'novel-1');
  assert.equal(snapshot.characters[0].resources[0].name, '城门钥匙');
  assert.deepEqual(JSON.parse(version.acceptedProposalIdsJson), [proposal.id]);
  await consumers.character_resources.apply(input);
  assert.equal(await f.db.canonicalStateVersion.count(), 1);
  assert.equal(await f.db.characterResourceEvent.count(), 1);
});
test('resource hold, unsupported evidence, unresolved identities and high risk remain pending', async t => {
  const f = await consumerFixture(t);
  const updates = [resource({ resourceName: '待确认', reviewDecision: 'hold' }), resource({ resourceName: '缺证据', evidence: ['正文没有这句话'] }),
    resource({ resourceName: '未知人物', holderCharacterName: '他书人物' }), resource({ resourceName: '高风险', riskLevel: 'high' })];
  const result = await f.apply('character_resources', output({ characterResourceDeltas: updates }));
  assert.equal(result.pendingCount, 4);
  assert.equal(await f.db.stateChangeProposal.count({ where: { status: 'pending_review' } }), 4);
  assert.equal(await f.db.characterResourceLedgerItem.count(), 0);
  assert.equal(await f.db.canonicalStateVersion.count(), 0);
});
test('resource version failure rolls back ledger, proposals, events and receipt together', async t => {
  const f = await consumerFixture(t, { resources: { recordVersion: async () => { throw new Error('version failed'); } } });
  await assert.rejects(f.apply('character_resources', output({ characterResourceDeltas: [resource()] })), /version failed/);
  for (const model of ['stateChangeProposal', 'characterResourceLedgerItem', 'characterResourceEvent', 'canonicalStateVersion']) assert.equal(await f.db[model].count(), 0, model);
  assert.equal(await f.db.chapterArtifactSyncCheckpoint.count({ where: { status: 'succeeded' } }), 0);
});

test('two jobs using the same manuscript and supplied step key never share a consumer receipt', async t => {
  const f = await setup(t);
  const first = await f.checkpoints.claim(f.identity('summary_facts'));
  await f.checkpoints.applyConsumer(first.claim, async () => ({ job: 'one' }));
  const store = new f.kernel.PrismaUnitProgressStore(f.db, { assertOwnership: f.assertOwnership });
  let other = await store.loadOrCreate(require('./application/harness.cjs').request({ ownerKey: 'job-2' }));
  other = await store.compareAndSwap(other, { progress: { ...other.progress, selected: 'original', selectedContentHash: f.context.contentHash, committedContentHash: f.context.contentHash },
    artifacts: { ...other.artifacts, original: f.context.content }, activeStage: 'reconcile', activeRequestKey: 'reconcile-request' });
  const second = await f.checkpoints.claim({ ...f.identity('summary_facts'), runId: other.id, ownerKey: other.ownerKey });
  assert.equal(second.status, 'claimed');
});

test('full payoff reconciliation applies saved model items, keeps omitted debts and guards its receipt', async t => {
  const f = await setup(t);
  assert.equal(typeof f.kernel.createFullPayoffConsumer, 'function');
  await f.db.payoffLedgerItem.create({ data: { novelId: 'novel-1', ledgerKey: 'omitted', title: '遗漏承诺', summary: '仍需兑现', scopeType: 'book', currentStatus: 'setup' } });
  const consumer = f.kernel.createFullPayoffConsumer({ checkpoints: f.checkpoints });
  const identity = f.identity('payoff_full_commit'); const claim = await f.checkpoints.claim(identity);
  const input = { context: f.context, output: { items: [{ ledgerKey: 'promise-return', title: '返回约定', summary: '承诺返回', scopeType: 'book', currentStatus: 'hinted', riskSignals: [] }] }, previous: {}, stepKey: identity.stepKey, claim: claim.claim };
  const result = await consumer.apply(input);
  assert.equal(result.payoffDeltaCount, 1);
  const omitted = await f.db.payoffLedgerItem.findFirst({ where: { ledgerKey: 'omitted' } });
  assert.equal(omitted.currentStatus, 'setup');
  assert.equal(JSON.parse(omitted.riskSignalsJson)[0].code, 'sync_stale');
  assert.equal(await f.db.payoffLedgerItem.count(), 2);
  await consumer.apply(input);
  assert.equal(await f.db.payoffLedgerItem.count(), 2);
  await f.revoke();
  await assert.rejects(consumer.apply(input), /ownership lost/);
});

test('an empty chapter completes all real consumers and recovers after their durable writes without another model', async t => {
  const f = await setup(t); const kernel = f.kernel;
  await f.db.chapter.update({ where: { id: 'chapter-1' }, data: { content: '' } });
  await f.db.character.create({ data: { id: 'hero', novelId: 'novel-1', name: '主角', role: '主角', personality: '', background: '', development: '' } });
  const req = require('./application/harness.cjs').request({ ownerKey: 'assembled-real-consumers' });
  req.profile.reconcile = 'strict'; req.profile.capabilities = ['causal_closure'];
  const calls = []; const manuscript = f.context.content;
  const timelineContext = { chapterIndex: 1, previousEvents: [], openHooks: [], plannedEventsThisChapter: [], forbiddenEvents: [] };
  const consumers = kernel.createArtifactConsumers({ checkpoints: f.checkpoints });
  const describePrompt = async input => ({ identity: 'saved', promptVersion: 'v1', provider: 'test', model: 'fake-model', outputTokens: 100,
    contextWindow: 100000, renderedInput: JSON.stringify(input) });
  const timeline = kernel.createTimelineArtifactPorts({ describePrompt,
    extractor: { extractFromChapter: async () => { calls.push('timeline'); return { events: [], hooks: [], addressedHookIds: [], resolvedHookIds: [] }; }, normalizeEvents: () => [], normalizeHooks: () => [] },
    checker: { checkChapter: () => ({ status: 'passed', score: 1, issues: [] }) },
    consumer: kernel.createTimelineConsumer({ checkpoints: f.checkpoints, forTransaction: require('./persistence/nativeServices.cjs').timeline() }) });
  const fullReconcile = kernel.createPayoffExtractionPort({ read: kernel.createPayoffSourceReader(f.db), describePrompt,
    invokePrompt: async () => { calls.push('full'); return { output: { items: [] } }; } });
  const fence = async run => {
    await f.db.$transaction(tx => f.assertOwnership(tx, { executionToken: 'lease-1' }));
    if (run.progress.committedContentHash) assert.equal((await f.db.chapter.findFirst()).content, manuscript);
  };
  const reconcile = kernel.createReconcileStage({ executionToken: () => 'lease-1', ports: { checkpoints: f.checkpoints,
    extraction: { prepare: async () => ({ inputFingerprint: 'registered-fixture', outputTokens: 100, input: {} }),
      invoke: async () => { calls.push('extract'); return output(); }, validate: value => value },
    consumers, timeline, fullReconcile, fullReconcileConsumer: kernel.createFullPayoffConsumer({ checkpoints: f.checkpoints }),
    fence: context => fence(context.run), reserve: async () => true } });
  const lifecycle = new kernel.ProductionChapterLifecycleService();
  const store = new kernel.PrismaUnitProgressStore(f.db, { assertOwnership: f.assertOwnership, writeChapter: lifecycle.commit.bind(lifecycle), finalizeChapter: lifecycle.finalizeSelected.bind(lifecycle) });
  const services = { purpose: 'automatic',
    readBaseline: async () => { const row = await f.db.chapter.findFirst(); return { content: row.content, updatedAt: row.updatedAt.toISOString(), protectedUserContent: false }; },
    prepare: async () => ({ novelTitle: '书', chapterTitle: '章', contextPackage: { chapter: { order: 1 }, timelineContext } }),
    describe: async (stage, _run, input) => ({ callsModel: ['draft', 'accept', 'repair', 'verify'].includes(stage),
      ...(req.profile.outputBudgets[stage] ? { outputTokens: req.profile.outputBudgets[stage] } : {}), inputFingerprint: kernel.hashProductionContent(JSON.stringify(input)), input, promptVersion: 'v1', configVersion: 'v1' }),
    scoped: async (_run, _invocation, operation) => operation(),
    write: async () => { calls.push('draft'); return manuscript; },
    assess: async () => { calls.push('accept'); return require('./application/assessmentFixture.cjs').assessmentResult(); },
    repair: async () => { throw new Error('unexpected repair'); }, knownRepairFailure: () => null };
  const ports = { store, stages: kernel.createChapterStagePorts(services, { reconcile }), fence,
    budget: { reserve: async input => ({ accepted: true, reservationKey: input.requestKey }) } };
  const save = store.compareAndSwap.bind(store); let crash = true;
  store.compareAndSwap = async (expected, next, write) => {
    if (next.artifacts.receipts.reconcile && crash) { crash = false; throw new Error('process exited before unit acknowledgement'); }
    return save(expected, next, write);
  };
  await assert.rejects(kernel.runUnit(req, ports), /process exited before unit acknowledgement/);
  store.compareAndSwap = save;
  assert.equal((await kernel.runUnit(req, ports)).status, 'completed');
  assert.deepEqual(calls, ['draft', 'accept', 'extract', 'timeline', 'full']);
  for (const model of ['chapterSummary', 'novelFactEntry', 'storyStateSnapshot', 'characterMindSnapshot', 'chapterTimeAnchor', 'timelineCheckReport']) assert.equal(await f.db[model].count(), 1, model);
  assert.equal(await f.db.ragIndexJob.count(), 2);
});
