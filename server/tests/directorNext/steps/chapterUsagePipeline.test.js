const test = require('node:test');
const assert = require('node:assert/strict');
const { prisma } = require('../../../dist/db/prisma');
const { NovelPipelineExecutor } = require('../../../dist/services/novel/production/NovelPipelineExecutor');
const { DIRECTOR_ISSUE_POLICY_PRESETS } = require('@ai-novel/shared/types/directorIssue');
const { readBatchOutcome } = require('../../../dist/app/director/batchOutcome');
const { buildChapterArtifactContentHash } = require('../../../dist/services/novel/runtime/artifactSync');
const { novelEventBus } = require('../../../dist/events');
const promptRunner = require('../../../dist/prompting/core/promptRunner');

async function exercise({ initialTokens = 0, checkpoints, chapterTokens = 100_000, futurePlanningTokens = 0, director = true, rejectBaseline = false, rolling = false, storedCompleted = 0, firstClosed = false, secondClosed = false, reviewedRisk = false, legacySaved = false, staleAcceptance = false, missingBoundary = false, qualityFirst = false, acceptancePause = false } = {}) {
  const restore = [];
  const replace = (target, key, value) => {
    const previous = target[key];
    restore.push(() => { target[key] = previous; });
    target[key] = value;
  };
  const policy = DIRECTOR_ISSUE_POLICY_PRESETS.find(item => item.id === (qualityFirst ? 'quality_first' : 'finish_full_book')).policy;
  const options = { startOrder: 1, endOrder: 2, autoReview: reviewedRisk || legacySaved, skipCompleted: true, maxRetries: 1,
    issueGovernanceVersion: 1, issuePolicySnapshot: policy,
    ...(rolling ? { controlPolicy: { advanceMode: rolling === 'range' ? 'auto_to_execution' : 'full_book_autopilot' } } : {}),
    ...(director ? { directorNext: { runId: 'new-run', decisions: [], ...(checkpoints ? { chapterUsage: checkpoints } : {}) } } : {}) };
  const job = { id: 'new-job', novelId: 'book', startOrder: 1, endOrder: 2, status: 'queued', pendingManualRecovery: false,
    startedAt: null, completedCount: storedCompleted, totalCount: 2, retryCount: 0, totalTokens: initialTokens, payload: JSON.stringify(options) };
  const chapters = [1, 2].map(order => ({ id: `c${order}`, novelId: 'book', order, title: `第${order}章`, content: '', artifactSyncCheckpoints: [] }));
  if (firstClosed) {
    chapters[0].content = '原已闭合正文';
    chapters[0].generationState = 'approved';
    chapters[0].artifactSyncCheckpoints = [{ contentHash: buildChapterArtifactContentHash(chapters[0].content), metadataJson: JSON.stringify({ outcome: 'completed' }) }];
  }
  if (secondClosed) {
    chapters[1].content = '第二章原已闭合正文';
    chapters[1].generationState = 'approved';
    chapters[1].artifactSyncCheckpoints = [{ contentHash: buildChapterArtifactContentHash(chapters[1].content), metadataJson: JSON.stringify({ outcome: 'completed' }) }];
  }
  const score = { coherence: 70, repetition: 80, pacing: 70, voice: 80, engagement: 70, overall: 74 };
  const issues = [{ severity: 'medium', category: 'pacing', evidence: '局部节奏需调整', fixSuggestion: '后续复查' }];
  if (legacySaved) {
    Object.assign(chapters[0], { content: '已保存但尚未记录质量债的正文', generationState: 'reviewed', chapterStatus: 'needs_repair' });
    chapters[0].artifactSyncCheckpoints = missingBoundary ? [] : [{ contentHash: buildChapterArtifactContentHash(chapters[0].content), metadataJson: JSON.stringify({ outcome: 'completed' }) }];
  }
  const calls = [];
  let usageReads = 0, classifications = 0;
  replace(prisma.generationJob, 'findUnique', async () => job);
  replace(prisma.generationJob, 'findUniqueOrThrow', async input => { if (input.select?.totalTokens) usageReads++; return job; });
  replace(prisma.generationJob, 'update', async ({ data }) => {
    if (rejectBaseline && data.payload && JSON.parse(data.payload).directorNext?.chapterUsage?.length && !data.status) {
      throw new Error('checkpoint write unavailable');
    }
    Object.assign(job, data); return job;
  });
  replace(prisma.novel, 'findUnique', async () => ({ id: 'book', title: '测试小说', estimatedChapterCount: rolling === 'range' ? 10 : 2 }));
  let routePrepared = !rolling || secondClosed;
  replace(prisma.chapter, 'findMany', async () => routePrepared ? chapters : chapters.slice(0, 1));
  replace(prisma.chapter, 'findFirst', async ({ where }) => chapters.find(chapter => where.id ? chapter.id === where.id : chapter.order === where.order));
  replace(prisma.chapter, 'update', async ({ where, data }) => { const chapter = chapters.find(row => row.id === where.id); Object.assign(chapter, data); return chapter; });
  replace(prisma.qualityReport, 'create', async () => ({}));
  const { directorAutomationLedgerEventService } = require('../../../dist/services/novel/director/runtime/DirectorAutomationLedgerEventService');
  replace(directorAutomationLedgerEventService, 'recordQualityLoopAssessment', async () => {});
  replace(prisma.chapterArtifactSyncCheckpoint, 'findFirst', async () => {
    const contentHash = require('node:crypto').createHash('sha1').update(staleAcceptance ? '过期正文' : chapters[0].content).digest('hex');
    return { contentHash, metadataJson: JSON.stringify({ schemaVersion: 2, gate: 'acceptance', contentHash, result: {
      assessment: { status: 'repairable', score, summary: '局部问题', assetSyncRecommendation: { reason: '同步已完成' }, continuePolicy: acceptancePause ? 'pause' : 'repair_once' }, score, issues,
    } }) };
  });
  const { ChapterRouteWindowService } = require('../../../dist/services/novel/planning/ChapterRouteWindowService');
  replace(ChapterRouteWindowService.prototype, 'ensureRouteWindow', async () => { routePrepared = true; });
  replace(prisma.novelWorkflowTask, 'findUnique', async () => { throw new Error('new pipeline must not read a legacy workflow'); });
  replace(prisma.novelWorkflowTask, 'update', async () => { throw new Error('new pipeline must not write a legacy workflow'); });
  replace(promptRunner, 'runStructuredPrompt', async () => { classifications++; throw new Error('test must not call AI'); });
  const { plannerService } = require('../../../dist/services/planner/PlannerService');
  replace(plannerService, 'replan', async () => {
    job.totalTokens += futurePlanningTokens;
    return { affectedChapterOrders: [2], action: 'local_replan' };
  });
  replace(novelEventBus, 'emit', async () => {});
  const runtime = { runPipelineChapter: async (_novelId, id) => {
    calls.push(id);
    if (director) assert.equal(JSON.parse(job.payload).directorNext.chapterUsage.find(row => row.chapterId === id).startJobTokens, job.totalTokens);
    job.totalTokens += chapterTokens;
    const chapter = chapters.find(row => row.id === id);
    chapter.content = `已保存的${id}正文`;
    chapter.generationState = reviewedRisk ? 'reviewed' : 'approved';
    chapter.chapterStatus = reviewedRisk ? 'needs_repair' : 'completed';
    chapter.artifactSyncCheckpoints = [{ contentHash: buildChapterArtifactContentHash(chapter.content), metadataJson: JSON.stringify({ outcome: 'completed' }) }];
    return { retryCountUsed: 0, reviewExecuted: reviewedRisk, pass: !reviewedRisk, score, issues: reviewedRisk ? issues : [],
      ...(futurePlanningTokens ? { runtimePackage: { failureClassification: { code: 'draft_obligation_unmet', blockingObligations: [] }, audit: { openIssues: [], reports: [] }, replanRecommendation: {
        recommended: true, scope: 'local_window', action: 'local_replan', blockingIssueIds: [],
        affectedChapterOrders: [2], reason: '后续章节需与已保存正文对齐',
      } } } : {}) };
  } };
  const executor = new NovelPipelineExecutor(runtime, { used: async () => 0, claim: async () => { throw new Error('budget must not consume retry'); } });
  try {
    await executor.execute(job.id, 'book', options);
    const outcome = director ? await readBatchOutcome(job, { runId: 'new-run', contract: { novelId: 'book', chapterRange: { from: 1, to: 2 }, issuePolicy: { mode: qualityFirst ? 'quality_first' : 'completion_first' } } }) : null;
    return { job, chapters, calls, usageReads, classifications, outcome };
  } finally { for (const undo of restore.reverse()) undo(); }
}

test('budget pause records local quality debt before stopping so saved prose remains skippable', async () => {
  const result = await exercise({ reviewedRisk: true, futurePlanningTokens: 20000 });
  assert.deepEqual(result.calls, ['c1']);
  assert.equal(result.job.totalTokens, 100000);
  assert.equal(result.job.pendingManualRecovery, true);
  assert.equal(result.outcome.chapters[0].closed, true);
  assert.equal(JSON.parse(result.chapters[0].riskFlags).qualityLoop.terminalAction, 'defer_and_continue');
});

test('explicit recovery closes legacy saved quality debt without rerunning the saved chapter', async () => {
  const checkpoint = { chapterId: 'c1', chapterOrder: 1, startJobTokens: 0, totalTokens: 87858, endJobTokens: 87858 };
  const result = await exercise({ legacySaved: true, initialTokens: 87858, checkpoints: [checkpoint], chapterTokens: 100, storedCompleted: 1 });
  assert.deepEqual(result.calls, ['c2']);
  assert.equal(result.chapters[0].content, '已保存但尚未记录质量债的正文');
  assert.equal(result.job.status, 'succeeded');
  assert.equal(result.job.completedCount, 2);
  assert.equal(result.job.totalTokens, 87958);
  assert.deepEqual(JSON.parse(result.job.payload).directorNext.chapterUsage[0], checkpoint);
  assert.equal(result.outcome.chapters.every(chapter => chapter.closed), true);
  assert.equal(result.classifications, 0);
});

for (const unsafe of ['staleAcceptance', 'missingBoundary', 'acceptancePause']) {
  test(`closed usage recovery refuses ${unsafe} without invoking generation`, async () => {
    const result = await exercise({ legacySaved: true, [unsafe]: true, initialTokens: 87858,
      checkpoints: [{ chapterId: 'c1', chapterOrder: 1, startJobTokens: 0, totalTokens: 87858, endJobTokens: 87858 }] });
    assert.deepEqual(result.calls, []);
    assert.equal(result.job.pendingManualRecovery, true);
    assert.equal(result.chapters[0].content, '已保存但尚未记录质量债的正文');
  });
}

test('recovering closed usage preserves the quality-first manual pause', async () => {
  const result = await exercise({ legacySaved: true, qualityFirst: true, initialTokens: 87858,
    checkpoints: [{ chapterId: 'c1', chapterOrder: 1, startJobTokens: 0, totalTokens: 87858, endJobTokens: 87858 }] });
  assert.deepEqual(result.calls, []);
  assert.equal(result.job.pendingManualRecovery, true);
  assert.equal(result.job.completedCount, 1);
  assert.equal(result.job.totalTokens, 87858);
  assert.equal(JSON.parse(result.job.payload).directorNext.decisions.at(-1).issueCode, 'quality.chapter_below_threshold');
});

test('new director pauses at the saved chapter boundary on the 100000-token ceiling', async () => {
  const result = await exercise({ initialTokens: 500 });
  assert.deepEqual(result.calls, ['c1']);
  assert.equal(result.chapters[0].content, '已保存的c1正文');
  assert.equal(result.chapters[1].content, '');
  assert.equal(result.job.completedCount, 1);
  assert.equal(result.job.pendingManualRecovery, true);
  assert.equal(result.job.status, 'queued');
  assert.equal(result.job.retryCount, 0);
  const snapshot = JSON.parse(result.job.payload).directorNext;
  assert.deepEqual(snapshot.chapterUsage, [{ chapterId: 'c1', chapterOrder: 1, startJobTokens: 500, totalTokens: 100000, endJobTokens: 100500 }]);
  assert.equal(snapshot.decisions.at(-1).issueCode, 'runtime.token_budget_exceeded');
  assert.equal(snapshot.decisions.at(-1).locked, true);
  assert.equal(result.outcome.chapters[0].closed, true);
  assert.equal(result.outcome.stopSignal.kind, 'manual_recovery');
  assert.equal(result.outcome.stopSignal.source, 'runtime');
  assert.match(result.outcome.stopSignal.reason, /第1章.*100000 Tokens.*正文已保存/);
  assert.equal(result.classifications, 0);
});

test('the observed 86009-token chapter can close and proceed without a budget pause', async () => {
  const result = await exercise({ chapterTokens: 86009 });
  assert.deepEqual(result.calls, ['c1', 'c2']);
  assert.equal(result.job.status, 'succeeded');
  assert.equal(result.job.pendingManualRecovery, false);
  assert.equal(result.job.completedCount, 2);
  assert.equal(result.job.totalTokens, 172018);
  assert.equal(result.outcome.stopSignal, undefined);
});

test('future planning does not exhaust the saved chapter budget and its boundary survives serialization', async () => {
  const result = await exercise({ chapterTokens: 70000, futurePlanningTokens: 20000 });
  assert.deepEqual(result.calls, ['c1', 'c2']);
  assert.equal(result.job.status, 'succeeded');
  assert.equal(result.job.totalTokens, 180000);
  const usage = JSON.parse(result.job.payload).directorNext.chapterUsage;
  assert.deepEqual(usage.map(row => row.totalTokens), [70000, 70000]);
  assert.deepEqual(usage.map(row => row.endJobTokens), [70000, 160000]);
  assert.equal(result.outcome.stopSignal, undefined);
});

test('a truly exhausted chapter stops before spending more tokens on future planning', async () => {
  const result = await exercise({ chapterTokens: 100000, futurePlanningTokens: 20000 });
  assert.deepEqual(result.calls, ['c1']);
  assert.equal(result.job.totalTokens, 100000);
  assert.equal(result.job.completedCount, 1);
  assert.equal(result.job.pendingManualRecovery, true);
});

test('recovery keeps the original chapter baseline and refuses another generation after exhaustion', async () => {
  const result = await exercise({ initialTokens: 100500, checkpoints: [{ chapterId: 'c1', chapterOrder: 1, startJobTokens: 500, totalTokens: 20000 }] });
  assert.deepEqual(result.calls, []);
  assert.equal(result.job.pendingManualRecovery, true);
  assert.equal(JSON.parse(result.job.payload).directorNext.chapterUsage[0].startJobTokens, 500);
  assert.equal(JSON.parse(result.job.payload).directorNext.chapterUsage[0].totalTokens, 100000);
  assert.equal(result.classifications, 0);
});

test('valid per-chapter usage continues across chapters while manual pipelines retain their behavior', async () => {
  const result = await exercise({ chapterTokens: 99999 });
  assert.deepEqual(result.calls, ['c1', 'c2']);
  assert.equal(result.job.status, 'succeeded');
  assert.equal(result.job.completedCount, 2);
  assert.equal(result.outcome.stopSignal, undefined);
  assert.deepEqual(JSON.parse(result.job.payload).directorNext.chapterUsage.map(row => row.totalTokens), [99999, 99999]);
  const manual = await exercise({ director: false, chapterTokens: 85000 });
  assert.deepEqual(manual.calls, ['c1', 'c2']);
  assert.equal(manual.job.status, 'succeeded');
  assert.equal(manual.usageReads, 0);
});

test('invalid usage counters stop with a structured integrity decision without invoking AI', async () => {
  const result = await exercise({ initialTokens: -1 });
  assert.deepEqual(result.calls, []);
  assert.equal(result.job.pendingManualRecovery, true);
  assert.equal(JSON.parse(result.job.payload).directorNext.decisions.at(-1).issueCode, 'runtime.data_integrity');
  assert.equal(result.classifications, 0);
});

test('a failed baseline write never starts the chapter and reports a persistence failure', async () => {
  const result = await exercise({ rejectBaseline: true });
  assert.deepEqual(result.calls, []);
  assert.equal(result.job.status, 'failed');
  assert.equal(JSON.parse(result.job.payload).directorNext.decisions.at(-1).issueCode, 'runtime.persistence_failed');
  assert.equal(result.classifications, 0);
});

test('rolling production counts saved chapters rather than treating uncreated future chapters as completed', async () => {
  const result = await exercise({ rolling: true, chapterTokens: 100 });
  assert.deepEqual(result.calls, ['c1', 'c2']);
  assert.equal(result.job.completedCount, 2);
  assert.equal(result.job.progress, 1);
  assert.equal(result.job.status, 'succeeded');
});

test('a new director recovery cannot skip empty chapters using an inflated historical progress counter', async () => {
  const result = await exercise({ rolling: true, chapterTokens: 100, storedCompleted: 2 });
  assert.deepEqual(result.calls, ['c1', 'c2']);
  assert.equal(result.job.completedCount, 2);
  assert.equal(result.outcome.chapters.every(chapter => chapter.closed), true);
});

test('recovery between chapter closure and rolling planning prepares the next chapter without rewriting saved prose', async () => {
  const result = await exercise({ rolling: true, chapterTokens: 100, storedCompleted: 1, firstClosed: true });
  assert.deepEqual(result.calls, ['c2']);
  assert.equal(result.chapters[0].content, '原已闭合正文');
  assert.equal(result.job.completedCount, 2);
  assert.equal(result.outcome.chapters.every(chapter => chapter.closed), true);
});

test('rolling a missing earlier chapter never regenerates an already closed later chapter', async () => {
  const result = await exercise({ rolling: true, chapterTokens: 100, secondClosed: true });
  assert.deepEqual(result.calls, ['c1']);
  assert.equal(result.chapters[1].content, '第二章原已闭合正文');
  assert.equal(result.job.completedCount, 2);
});

test('a limited director range also prepares missing chapters without extending to the full book', async () => {
  const result = await exercise({ rolling: 'range', chapterTokens: 100 });
  assert.deepEqual(result.calls, ['c1', 'c2']);
  assert.equal(result.job.completedCount, 2);
  assert.equal(result.job.endOrder, 2);
  assert.equal(result.outcome.chapters.every(chapter => chapter.closed), true);
});
