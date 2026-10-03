const test = require('node:test');
const assert = require('node:assert/strict');
const { prisma } = require('../../../dist/db/prisma');
const { NovelPipelineExecutor } = require('../../../dist/services/novel/production/NovelPipelineExecutor');
const { DIRECTOR_ISSUE_POLICY_PRESETS } = require('@ai-novel/shared/types/directorIssue');
const { readBatchOutcome } = require('../../../dist/app/director/batchOutcome');
const { buildChapterArtifactContentHash } = require('../../../dist/services/novel/runtime/artifactSync');
const { novelEventBus } = require('../../../dist/events');
const promptRunner = require('../../../dist/prompting/core/promptRunner');

async function exercise({ initialTokens = 0, checkpoints, chapterTokens = 80_000, director = true, rejectBaseline = false } = {}) {
  const restore = [];
  const replace = (target, key, value) => {
    const previous = target[key];
    restore.push(() => { target[key] = previous; });
    target[key] = value;
  };
  const policy = DIRECTOR_ISSUE_POLICY_PRESETS.find(item => item.id === 'finish_full_book').policy;
  const options = { startOrder: 1, endOrder: 2, autoReview: false, skipCompleted: true, maxRetries: 1,
    issueGovernanceVersion: 1, issuePolicySnapshot: policy,
    ...(director ? { directorNext: { runId: 'new-run', decisions: [], ...(checkpoints ? { chapterUsage: checkpoints } : {}) } } : {}) };
  const job = { id: 'new-job', novelId: 'book', startOrder: 1, endOrder: 2, status: 'queued', pendingManualRecovery: false,
    startedAt: null, completedCount: 0, totalCount: 2, retryCount: 0, totalTokens: initialTokens, payload: JSON.stringify(options) };
  const chapters = [1, 2].map(order => ({ id: `c${order}`, novelId: 'book', order, title: `第${order}章`, content: '', artifactSyncCheckpoints: [] }));
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
  replace(prisma.novel, 'findUnique', async () => ({ id: 'book', title: '测试小说' }));
  replace(prisma.chapter, 'findMany', async () => chapters);
  replace(prisma.novelWorkflowTask, 'findUnique', async () => { throw new Error('new pipeline must not read a legacy workflow'); });
  replace(prisma.novelWorkflowTask, 'update', async () => { throw new Error('new pipeline must not write a legacy workflow'); });
  replace(promptRunner, 'runStructuredPrompt', async () => { classifications++; throw new Error('test must not call AI'); });
  replace(novelEventBus, 'emit', async () => {});
  const runtime = { runPipelineChapter: async (_novelId, id) => {
    calls.push(id);
    if (director) assert.equal(JSON.parse(job.payload).directorNext.chapterUsage.find(row => row.chapterId === id).startJobTokens, job.totalTokens);
    job.totalTokens += chapterTokens;
    const chapter = chapters.find(row => row.id === id);
    chapter.content = `已保存的${id}正文`;
    chapter.generationState = 'approved';
    chapter.artifactSyncCheckpoints = [{ contentHash: buildChapterArtifactContentHash(chapter.content), metadataJson: JSON.stringify({ outcome: 'completed' }) }];
    return { retryCountUsed: 0, reviewExecuted: false, pass: true, score: {}, issues: [] };
  } };
  const executor = new NovelPipelineExecutor(runtime, { used: async () => 0, claim: async () => { throw new Error('budget must not consume retry'); } });
  try {
    await executor.execute(job.id, 'book', options);
    const outcome = director ? await readBatchOutcome(job, { runId: 'new-run', contract: { novelId: 'book', chapterRange: { from: 1, to: 2 }, issuePolicy: { mode: 'completion_first' } } }) : null;
    return { job, chapters, calls, usageReads, classifications, outcome };
  } finally { for (const undo of restore.reverse()) undo(); }
}

test('new director pauses at the saved chapter boundary on the 80000-token ceiling', async () => {
  const result = await exercise({ initialTokens: 500 });
  assert.deepEqual(result.calls, ['c1']);
  assert.equal(result.chapters[0].content, '已保存的c1正文');
  assert.equal(result.chapters[1].content, '');
  assert.equal(result.job.completedCount, 1);
  assert.equal(result.job.pendingManualRecovery, true);
  assert.equal(result.job.status, 'queued');
  assert.equal(result.job.retryCount, 0);
  const snapshot = JSON.parse(result.job.payload).directorNext;
  assert.deepEqual(snapshot.chapterUsage, [{ chapterId: 'c1', chapterOrder: 1, startJobTokens: 500, totalTokens: 80000 }]);
  assert.equal(snapshot.decisions.at(-1).issueCode, 'runtime.token_budget_exceeded');
  assert.equal(snapshot.decisions.at(-1).locked, true);
  assert.equal(result.outcome.chapters[0].closed, true);
  assert.equal(result.outcome.stopSignal.kind, 'manual_recovery');
  assert.equal(result.outcome.stopSignal.source, 'runtime');
  assert.equal(result.classifications, 0);
});

test('recovery keeps the original chapter baseline and refuses another generation after exhaustion', async () => {
  const result = await exercise({ initialTokens: 80500, checkpoints: [{ chapterId: 'c1', chapterOrder: 1, startJobTokens: 500, totalTokens: 20000 }] });
  assert.deepEqual(result.calls, []);
  assert.equal(result.job.pendingManualRecovery, true);
  assert.equal(JSON.parse(result.job.payload).directorNext.chapterUsage[0].startJobTokens, 500);
  assert.equal(JSON.parse(result.job.payload).directorNext.chapterUsage[0].totalTokens, 80000);
  assert.equal(result.classifications, 0);
});

test('valid per-chapter usage continues across chapters while manual pipelines retain their behavior', async () => {
  const result = await exercise({ chapterTokens: 79999 });
  assert.deepEqual(result.calls, ['c1', 'c2']);
  assert.equal(result.job.status, 'succeeded');
  assert.equal(result.job.completedCount, 2);
  assert.equal(result.outcome.stopSignal, undefined);
  assert.deepEqual(JSON.parse(result.job.payload).directorNext.chapterUsage.map(row => row.totalTokens), [79999, 79999]);
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
