const test = require('node:test');
const assert = require('node:assert/strict');
const { z } = require('zod');
const { HumanMessage } = require('@langchain/core/messages');
const factory = require('../../dist/llm/factory');
const settings = require('../../dist/llm/structuredFallbackSettings');
const { resolveStructuredOutputProfile } = require('../../dist/llm/structuredOutput');
const { invokeStructuredLlmDetailed } = require('../../dist/llm/structuredInvoke');
const { runStructuredPrompt } = require('../../dist/prompting/core/promptRunner');
const { createTransientChapterReviewRetryBudget, createPersistedChapterReviewRetryBudget,
  ReviewRetryPersistenceError } = require('../../dist/services/novel/runtime/acceptance');
const { claimModelRequest } = require('../../dist/platform/llm/retries');
const { prisma } = require('../../dist/db/prisma');
const { directorIssuePolicySchema, resolveChapterReviewRetryPolicy, mergeDirectorIssuePolicy,
  DIRECTOR_ISSUE_POLICY_PRESETS } = require('../../../shared/dist/types/directorIssue');

function models(t, response) {
  const originals = [factory.resolveLLMClientOptions, factory.createLLMFromResolvedOptions, factory.getLLM, settings.getStructuredFallbackSettings];
  const calls = [];
  factory.resolveLLMClientOptions = async (provider, options = {}) => ({ provider: provider || 'deepseek',
    model: options.model || 'offline-model', apiKey: 'offline-mock', baseURL: 'https://api.deepseek.com/v1',
    temperature: 0.1, requestProtocol: 'chat_completions',
    structuredProfile: resolveStructuredOutputProfile({ provider: 'deepseek', model: 'deepseek-chat', executionMode: 'structured' }) });
  const client = (kind, model) => ({ stream: async function* (messages, options) {
    calls.push({ kind, model, messages, strategy: options?.response_format?.type || 'prompt_json' });
    const output = response(calls.at(-1), calls.length);
    if (output instanceof Error) throw output;
    yield { content: output };
  } });
  factory.createLLMFromResolvedOptions = options => client('main', options.model);
  factory.getLLM = async (_provider, options) => client('repair', options.model);
  settings.getStructuredFallbackSettings = async () => ({ enabled: false, retryCount: 0 });
  t.after(() => { [factory.resolveLLMClientOptions, factory.createLLMFromResolvedOptions, factory.getLLM, settings.getStructuredFallbackSettings] = originals; });
  return calls;
}

const invoke = (patch = {}) => invokeStructuredLlmDetailed({ provider: 'deepseek', model: 'offline-model',
  schema: z.object({ value: z.string() }), systemPrompt: 'Offline fixture', userPrompt: '当前候选正文：手抄件在林砚手里。',
  label: 'offline.review.budget', maxRepairAttempts: 1, disableFallbackModel: true, ...patch });

test('non-voice style metadata does not spend a format correction or hide the issue', async t => {
  const { chapterAcceptanceModelSchema } = require('../../dist/prompting/prompts/novel/chapterAcceptance.prompts');
  const report = { status: 'repairable', score: { coherence: 70, pacing: 70, repetition: 70, engagement: 70, voice: 70, overall: 70 },
    summary: '保密边界有缺口', continuePolicy: 'repair_once', styleReview: null,
    assetSyncRecommendation: { reason: '保留事实' },
    blockingIssues: [{ code: 'protected_reveal_crossing', category: 'plot', severity: 'high', layer: 'plot',
      styleRuleId: null, canAutoRewrite: true, evidence: '字迹指向父亲', currentEvidence: '字迹指向父亲', fixSuggestion: '保留来源疑点' }] };
  const calls = models(t, () => JSON.stringify(report));
  const budget = createTransientChapterReviewRetryBudget({ maxRetries: 1, onExhausted: 'continue_with_warning' });
  const result = await budget.runCheck('candidate', () => invoke({ schema: chapterAcceptanceModelSchema }));
  assert.equal(calls.length, 1);
  assert.equal(budget.summary().used, 0);
  assert.equal(result.data.blockingIssues[0].code, 'protected_reveal_crossing');
  assert.equal(result.data.blockingIssues[0].currentEvidence, '字迹指向父亲');
  assert.equal(result.data.blockingIssues[0].layer, undefined);
  assert.equal(result.data.blockingIssues[0].canAutoRewrite, undefined);
  const invalidVoice = structuredClone(report); invalidVoice.blockingIssues[0].category = 'voice';
  assert.equal(chapterAcceptanceModelSchema.safeParse(invalidVoice).success, false);
  const invalidCategory = structuredClone(report); invalidCategory.blockingIssues[0].category = 'unknown';
  assert.equal(chapterAcceptanceModelSchema.safeParse(invalidCategory).success, false);
});

for (const maxRetries of [0, 1, 3, 5]) {
  test(`all protocol and structural requests obey the user allowance ${maxRetries}`, async t => {
    const calls = models(t, () => '{"value":0}');
    const budget = createTransientChapterReviewRetryBudget({ maxRetries, onExhausted: 'continue_with_warning' });
    await assert.rejects(budget.runCheck('initial', invoke));
    await budget.recordResult('initial', false);
    assert.equal(calls.length, 1 + maxRetries);
    assert.deepEqual(budget.summary(), { maxRetries, used: maxRetries, exhausted: true, onExhausted: 'continue_with_warning' });
    for (const repair of calls.filter(c => c.kind === 'repair')) {
      assert.ok(repair.messages.some(message => String(message.content).includes('手抄件在林砚手里')));
    }
  });
}

test('semantic correction and candidate verification share the same chapter allowance', async t => {
  const calls = models(t, () => '{"value":"wrong"}');
  const budget = createTransientChapterReviewRetryBudget({ maxRetries: 2, onExhausted: 'pause_for_manual' });
  const asset = { id: 'novel.chapter.acceptance_assessment', version: 'v24', taskType: 'review', mode: 'structured',
    contextPolicy: { maxTokensBudget: 100 }, outputSchema: z.object({ value: z.string() }),
    render: () => [new HumanMessage('offline evidence fixture')], semanticRetryPolicy: { maxAttempts: 1, sharedCorrectionBudget: 1 },
    postValidate: () => { throw new Error('evidence is not from the candidate'); } };
  const options = { provider: 'deepseek', model: 'offline-model' };
  await assert.rejects(budget.runCheck('initial', () => runStructuredPrompt({ asset, promptInput: {}, options })));
  assert.equal(calls.length, 3);
  assert.equal(budget.summary().used, 2);
  // A repaired candidate has one normal first verification, but no new correction allowance.
  await assert.rejects(budget.runCheck('candidate', () => runStructuredPrompt({ asset, promptInput: {}, options })));
  assert.equal(calls.length, 4);
  assert.equal(budget.summary().used, 2);
});

test('transport retries cannot bypass a zero retry allowance', async t => {
  const calls = models(t, () => new Error('temporary network error'));
  settings.getStructuredFallbackSettings = async () => ({ enabled: true, provider: 'deepseek', model: 'fallback', retryCount: 3 });
  const budget = createTransientChapterReviewRetryBudget({ maxRetries: 0, onExhausted: 'pause_for_manual' });
  await assert.rejects(budget.runCheck('initial', () => invoke({ disableFallbackModel: false })));
  assert.equal(calls.length, 1);
});

test('a configured fallback model shares the primary allowance instead of renewing it', async t => {
  const calls = models(t, () => '{"value":0}');
  settings.getStructuredFallbackSettings = async () => ({ enabled: true, provider: 'deepseek', model: 'fallback', retryCount: 0 });
  const budget = createTransientChapterReviewRetryBudget({ maxRetries: 4, onExhausted: 'pause_for_manual' });
  await assert.rejects(budget.runCheck('initial', () => invoke({ disableFallbackModel: false, fallbackMaxRepairAttempts: 0 })));
  assert.equal(calls.length, 5);
  assert.equal(calls.at(-1).model, 'fallback');
  assert.equal(budget.summary().used, 4);
});

test('persistent reservations survive restart and concurrent claimers without renewing first attempts', async t => {
  const table = prisma.chapterArtifactSyncCheckpoint;
  const original = [table.upsert, table.findUniqueOrThrow, table.updateMany];
  let saved;
  table.upsert = async ({ create }) => { saved ??= { metadataJson: create.metadataJson }; return { ...saved }; };
  table.findUniqueOrThrow = async () => ({ ...saved });
  table.updateMany = async ({ where, data }) => {
    if (saved.metadataJson !== where.metadataJson) return { count: 0 };
    saved = { ...data }; return { count: 1 };
  };
  t.after(() => { [table.upsert, table.findUniqueOrThrow, table.updateMany] = original; });
  const input = { novelId: 'offline', chapterId: 'c', executionId: 'job', policy: { maxRetries: 1, onExhausted: 'pause_for_manual' } };
  const first = createPersistedChapterReviewRetryBudget(input);
  await first.runCheck('initial', claimModelRequest);
  const resumed = createPersistedChapterReviewRetryBudget({ ...input, policy: { maxRetries: 20, onExhausted: 'continue_with_warning' } });
  const results = await Promise.allSettled([first.runCheck('initial', claimModelRequest), resumed.runCheck('initial', claimModelRequest)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(JSON.parse(saved.metadataJson).used, 1);
  assert.equal(JSON.parse(saved.metadataJson).policy.maxRetries, 1);
  await assert.rejects(resumed.runCheck('initial', claimModelRequest));
});

test('reservation failures stop the request rather than degrading into a quality warning', async t => {
  const table = prisma.chapterArtifactSyncCheckpoint, original = table.upsert;
  table.upsert = async () => { throw new Error('offline storage unavailable'); };
  t.after(() => { table.upsert = original; });
  const budget = createPersistedChapterReviewRetryBudget({ novelId: 'offline', chapterId: 'c', executionId: 'job',
    policy: { maxRetries: 1, onExhausted: 'continue_with_warning' } });
  let paidRequests = 0;
  await assert.rejects(budget.runCheck('initial', async () => { await claimModelRequest(); paidRequests++; }), ReviewRetryPersistenceError);
  assert.equal(paidRequests, 0);
});

test('review preferences round-trip independently of runtime recovery and preserve old quality-first tasks', () => {
  for (const maxRetries of [0, 1, 7, 20]) for (const onExhausted of ['continue_with_warning', 'pause_for_manual']) {
    const nested = { maxRetries, onExhausted };
    const policy = directorIssuePolicySchema.parse({ maxAutomaticRetries: 1, chapterReviewRetryPolicy: nested });
    assert.deepEqual(resolveChapterReviewRetryPolicy(JSON.parse(JSON.stringify(policy))), nested);
    assert.deepEqual(mergeDirectorIssuePolicy(policy, { chapterReviewRetryPolicy: { maxRetries: 3, onExhausted } }).chapterReviewRetryPolicy,
      { maxRetries: 3, onExhausted });
  }
  assert.equal(directorIssuePolicySchema.safeParse({ chapterReviewRetryPolicy: { maxRetries: -1, onExhausted: 'pause_for_manual' } }).success, false);
  const old = { ...DIRECTOR_ISSUE_POLICY_PRESETS[1].policy }; delete old.chapterReviewRetryPolicy;
  assert.equal(resolveChapterReviewRetryPolicy(old).onExhausted, 'pause_for_manual');
});

test('a token or cancellation guard stops before reservation and keeps its original error identity', async t => {
  const calls = models(t, () => '{"value":"unused"}');
  const guardError = new Error('offline token limit');
  const budget = createPersistedChapterReviewRetryBudget({ novelId: 'offline', chapterId: 'c', executionId: 'job',
    policy: { maxRetries: 3, onExhausted: 'continue_with_warning' }, beforeRequest: async () => { throw guardError; } });
  await assert.rejects(budget.runCheck('initial', invoke), error => error === guardError);
  assert.equal(calls.length, 0);
  assert.equal(budget.summary().used, 0);
});

test('exhaustion choices control saved-boundary closure independently of the selected preset', async t => {
  const { chapterQualityLoopService } = require('../../dist/services/novel/quality/ChapterQualityLoopService');
  const { applyChapterQualityClosure } = require('../../dist/services/novel/production/qualityClosure/ChapterQualityClosure');
  const original = chapterQualityLoopService.recordAssessment;
  chapterQualityLoopService.recordAssessment = async () => undefined;
  t.after(() => { chapterQualityLoopService.recordAssessment = original; });
  for (const preset of DIRECTOR_ISSUE_POLICY_PRESETS) for (const maxRetries of [0, 1, 3]) {
    for (const onExhausted of ['continue_with_warning', 'pause_for_manual']) {
      const decisions = [], alerts = [];
      const result = await applyChapterQualityClosure({ governance: { novelId: 'offline', issueGovernanceVersion: 1,
        policy: preset.policy, policySource: 'task_snapshot' }, novelId: 'offline', jobId: 'job', chapter: { id: 'c', order: 4 },
        chapterResult: { reviewExecuted: false, pass: false, score: {}, issues: [], runtimePackage: null, retryCountUsed: 1,
          reviewRetries: { maxRetries, used: maxRetries, onExhausted, exhausted: true },
          recoverableRepairFailure: { message: 'candidate verification unavailable', failureTypes: ['evidence_invalid'] } },
        qualityThreshold: 75, runtimePayload: { autoReview: true }, qualityAlertDetails: alerts,
        replanAlertDetails: [], recoverableRepairDetails: [], onIssueDecision: decision => decisions.push(decision),
        runLocalReplan: async () => { throw new Error('exhaustion must not start a replan'); } });
      assert.equal(result.shouldStopAfterCurrentChapter, onExhausted === 'pause_for_manual');
      assert.equal(decisions.at(-1).action, onExhausted);
      assert.ok(alerts.at(-1).includes(`${maxRetries}/${maxRetries}`));
    }
  }
});

test('completion-first accepts an explicit exhaustion pause and still rejects unsolicited quality pauses', () => {
  const { checkAction } = require('../../dist/modules/director/domain/guard');
  const input = { action: { kind: 'pause', pause: { kind: 'manual_recovery', reason: 'review retries exhausted' } },
    plan: { steps: [] }, contract: { rejectionBudget: 3, issuePolicy: { mode: 'completion_first',
      pipelinePolicy: { chapterReviewRetryPolicy: { maxRetries: 2, onExhausted: 'pause_for_manual' } } } },
    control: { status: 'running' }, facts: { artifacts: [], debts: [],
      stopSignal: { kind: 'manual_recovery', action: 'pause_for_manual', source: 'retry_policy', reason: 'review retries exhausted' } },
    rejections: 0, tokensUsed: 0 };
  assert.equal(checkAction(input).ok, true);
  assert.equal(checkAction({ ...input, facts: { ...input.facts, stopSignal: { ...input.facts.stopSignal, source: 'quality' } } }).ok, false);
  input.contract.issuePolicy.pipelinePolicy.chapterReviewRetryPolicy.onExhausted = 'continue_with_warning';
  assert.equal(checkAction(input).ok, false);
});

test('a trusted final assessment is not labelled exhausted because an earlier check failed', async () => {
  const { createPipelineHarness } = require('./sourceHarness.cjs');
  const h = createPipelineHarness({ scores: [90], reviewRetrySummary: {
    maxRetries: 1, used: 1, onExhausted: 'pause_for_manual', exhausted: true } });
  const result = await h.run();
  assert.equal(result.pass, true);
  assert.equal(result.reviewRetries.exhausted, false);
  assert.equal(result.reviewRetries.used, 1);
});
