const test = require('node:test'), assert = require('node:assert/strict');
const api = require('../../../dist/app/director/productionKernel');
const common = require('../../../dist/modules/production/common');
const { request } = require('./harness.cjs');

// Regression: resuming a preparation whose upstream contract was regenerated
// (new task sheet / word count) must give the downstream quality request its
// own key instead of aliasing it onto the saved request snapshot, where the
// strict candidate comparison in steps.model false-conflicts forever.
test('preparation quality request keyed by its full candidate, not only round feedback', async t => {
  const runner = require('../../../dist/prompting/core/promptRunner'), factory = require('../../../dist/llm/factory');
  const route = require('../../../dist/llm/modelRouter'), policy = require('../../../dist/platform/llm/execution');
  const slots = require('../../../dist/prompting/slots/PromptSlotOverrideService').promptSlotOverrideService;
  const saved = { resolve: route.resolveModel, create: factory.createLLMFromResolvedOptions, get: factory.getLLM,
    metadata: factory.getResolvedLLMClientOptionsFromInstance, slots: slots.resolveForRuntime };
  const clients = new WeakMap(), state = { models: 0, reserved: [], observed: [] };
  const usage = require('../../../dist/llm/usageTracking');
  const repository = require('../../../dist/platform/llm/usage').PrismaInvocationUsageRepository;
  const originalRecord = repository.prototype.record; repository.prototype.record = async () => {};
  route.resolveModel = async (_task, options) => ({ provider: options.provider ?? 'openai', model: options.model ?? 'fixture-model',
    temperature: options.temperature ?? 0.2, maxTokens: options.maxTokens, requestProtocol: 'openai_compatible',
    structuredResponseFormat: 'auto', routeKey: 'fixture', routeDegraded: false });
  factory.setProviderSecretCache('openai', { key: 'fixture-key', baseURL: 'https://models.invalid/v1', reasoningEnabled: false });
  slots.resolveForRuntime = async () => ({ appendBlocks: [] });
  const assessment = require('../planning/contractFixture.cjs').safe;
  const make = configuration => {
    policy.assertLlmExecutionConfiguration(configuration);
    const tracked = usage.attachLLMUsageTracking({ invoke: async () => { throw Error('Expected streaming transport'); },
      batch: async () => { throw Error('Expected one model call'); }, stream: async function* () { state.models++; yield { content: JSON.stringify(assessment) }; } }, configuration);
    const client = policy.attachLlmExecutionPolicy(tracked, configuration);
    clients.set(client, configuration); return client;
  };
  factory.createLLMFromResolvedOptions = make;
  factory.getLLM = async (provider, options) => make(await factory.resolveLLMClientOptions(provider, options));
  factory.getResolvedLLMClientOptionsFromInstance = client => clients.get(client);
  t.after(() => { route.resolveModel = saved.resolve; factory.createLLMFromResolvedOptions = saved.create; factory.getLLM = saved.get;
    factory.getResolvedLLMClientOptionsFromInstance = saved.metadata; slots.resolveForRuntime = saved.slots; factory.setProviderSecretCache('openai', null); repository.prototype.record = originalRecord; });
  const req = request({ model: { provider: 'openai', model: 'fixture-model', promptVersion: 'native', configVersion: 'saved', inputFingerprint: 'input' } });
  const run = { id: 'unit-1', ownerKey: req.ownerKey, version: 1, snapshots: { profile: req.profile, policy: req.policy, model: req.model },
    progress: { unit: req.unit, completed: [], repairAttemptsUsed: 0 }, artifacts: { receipts: {} }, activeStage: 'prepare', activeRequestKey: 'prepare-request' };
  const preflight = api.createKernelPromptPreparer({ contextWindowFor: async () => 1000000,
    readFallback: async () => ({ enabled: false, provider: 'openai', model: '', temperature: 0.2, maxTokens: 3000, retryCount: 0 }) });
  // Mimic the real steps.model contract: one key owns one saved request; a
  // different description under the same key is a snapshot conflict.
  const cache = new Map(), steps = { model: async (key, description, invoke) => {
    const existing = cache.get(key);
    if (existing) {
      assert.equal(common.canonicalProductionJson(description), common.canonicalProductionJson(existing.description),
        `same key ${key} must carry the same request`);
      return existing.value;
    }
    const value = await invoke(description, 'physical-request-1'); cache.set(key, { description, value }); return value;
  } };
  const deps = { preflight, requestLimit: () => 4, fence: async () => {}, budget: {
    reserve: async (unit, key, tokens) => { state.reserved.push({ unit, key, tokens }); return true; },
    observe: async (unit, key, record) => state.observed.push({ unit, key, chapterId: record.chapterId }),
    releaseUndispatched: async () => { throw Error('No budget rejection expected'); } }, invokePrompt: runner.runStructuredPrompt };
  const native = require('../../../dist/services/novel/volume/ChapterTaskSheetQualityGateService').buildChapterTaskSheetQualityPromptRequest;
  const fixture = require('../planning/contractFixture.cjs');
  const previous = { chapterOrder: 1, title: '前章', summary: '纸条来自钟内', tail: '结束', content: '完整前文。'.repeat(800) };
  const inputFor = candidate => {
    const input = native({ candidate, mode: 'full_book_autopilot', options: { provider: 'openai', model: 'fixture-model' } });
    input.options.maxTokens = 4096; return input;
  };
  const candidateA = fixture.candidate({ chapterId: 'volume-plan-chapter-1', previousChapterResult: previous, targetWordCount: 3200, taskSheet: '第一版任务单。' });
  const candidateB = fixture.candidate({ chapterId: 'volume-plan-chapter-1', previousChapterResult: previous, targetWordCount: 3000, taskSheet: '重新生成的第二版任务单。' });

  const first = await api.createKernelPreparationPromptInvoker(deps, run, steps)(inputFor(candidateA));
  assert.deepEqual(first.output, assessment);
  assert.equal(state.models, 1);

  // Resume: the upstream contract was regenerated under its own new key, so
  // the quality request now carries candidate B. It must be dispatched as its
  // own request, not aliased onto candidate A's saved snapshot.
  const resumed = await api.createKernelPreparationPromptInvoker(deps, run, steps)(inputFor(candidateB));
  assert.deepEqual(resumed.output, assessment);
  assert.equal(state.models, 2);

  // Repeating either exact request still reuses its own cached result.
  assert.deepEqual(await api.createKernelPreparationPromptInvoker(deps, run, steps)(inputFor(candidateB)), resumed);
  assert.deepEqual(await api.createKernelPreparationPromptInvoker(deps, run, steps)(inputFor(candidateA)), first);
  assert.equal(state.models, 2);

  // Live context blocks carry undefined-valued fields (reuseScope, freshness,
  // ...) that the strict production JSON clone rejects; the digest must
  // serialize blocks as plain JSON data, stay stable for equal content, and
  // still separate different content.
  const withBlock = text => ({ ...inputFor(candidateA),
    contextBlocks: [{ id: 'previous_chapter_result', group: 'previous_chapter_result', priority: 100, required: true,
      content: text, reuseScope: undefined, conflictGroup: undefined, freshness: undefined }] });
  const blockedFirst = await api.createKernelPreparationPromptInvoker(deps, run, steps)(withBlock('前章内容'));
  assert.equal(state.models, 3);
  assert.deepEqual(await api.createKernelPreparationPromptInvoker(deps, run, steps)(withBlock('前章内容')), blockedFirst);
  assert.equal(state.models, 3);
  await api.createKernelPreparationPromptInvoker(deps, run, steps)(withBlock('改动后的前章内容'));
  assert.equal(state.models, 4);
});
