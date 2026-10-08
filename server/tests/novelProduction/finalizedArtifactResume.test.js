const test = require('node:test');
const assert = require('node:assert/strict');
const {loadRuntimeSource} = require('./sourceHarness.cjs');

test('V2 adapter resumes finalized assets before context assembly, generation or review', async () => {
  const events = [];
  const result = {reviewExecuted: true, pass: true, score: {overall: 90}, issues: [], runtimePackage: null, retryCountUsed: 1};
  const store = {load: async (...args) => {events.push(['load', ...args]); return {content: 'final repaired draft', result};}, save: async () => {throw Error('cannot save another finalization');}};
  const runtime = loadRuntimeSource('chapterRuntimePipeline.ts', {
    '../../styleEngine/styleGenerationSanitizer': {}, './chapterEmptyContentError': {},
    './repair/chapterRepairRuntime': {}, './repair/ChapterRepairEligibility': {}, './proseQuality': {},
    '../chapterPatchRepairService': {}, './selection/ChapterRepairCandidateSelection': {},
    './artifactSync/ChapterArtifactSyncResult': {ChapterArtifactSyncBoundaryError: class extends Error {}},
  });
  const {ChapterPipelineRuntimeAdapter} = loadRuntimeSource('ChapterPipelineRuntimeAdapter.ts', {
    './ChapterArtifactSyncService': {}, './chapterRuntimePipeline': runtime, './chapterEmptyContentError': {},
    './artifactSync': {ChapterPipelineFinalizationStore: class {}},
    '../production/observation': {chapterGenerationFeed: {}},
  });
  const adapter = new ChapterPipelineRuntimeAdapter({
    finalizationStore: store,
    streamOrchestrator: {prepareRuntimeChapter: async () => {throw Error('must not rebuild paid context');}},
    artifactSyncService: {syncChapterArtifacts: async (novel, chapter, content, options) => {
      events.push(['sync', novel, chapter, content, options.artifactSyncPolicy]);
      return {status: 'completed', contentHash: 'hash', completedArtifacts: ['artifact_delta']};
    }},
    lifecycleService: {markGenerationState: async (...args) => events.push(['state', ...args])},
  });
  const recovered = await adapter.runPipelineChapter('n', 'c', {
    artifactSyncPolicy: 'director_v2', finalizedResultScope: 'job-1', provider: 'deepseek', model: 'chosen',
  });
  assert.equal(recovered.pass, true);
  assert.equal(recovered.retryCountUsed, 1);
  assert.deepEqual(events, [
    ['load', 'n', 'c', 'job-1'],
    ['sync', 'n', 'c', 'final repaired draft', 'director_v2'],
    ['state', 'c', 'approved'],
  ]);
});

test('finalization receipt survives a fresh store, isolates jobs and invalidates changed prose', async () => {
  const rows = new Map();
  let content = 'final draft';
  const key = where => JSON.stringify(where.novelId_chapterId_contentHash_artifactType_syncMode);
  const checkpoint = {
    findUnique: async ({where}) => rows.get(key(where)) ?? null,
    upsert: async ({where, create, update}) => rows.set(key(where), rows.has(key(where)) ? {...rows.get(key(where)), ...update} : create),
  };
  const db = {chapter: {findFirst: async () => ({content})}, chapterArtifactSyncCheckpoint: checkpoint};
  db.$transaction = async fn => fn(db);
  const hashModule = loadRuntimeSource('artifactSync/ChapterArtifactContentVersion.ts', {'node:crypto': require('node:crypto')});
  class BoundaryError extends Error {constructor(result) {super(result.reason);}}
  const {ChapterPipelineFinalizationStore} = loadRuntimeSource('artifactSync/ChapterPipelineFinalizationStore.ts', {
    'zod': require('zod'), '../../../../db/prisma': {prisma: db},
    './ChapterArtifactContentVersion': hashModule,
    './ChapterArtifactSyncResult': {ChapterArtifactSyncBoundaryError: BoundaryError},
  });
  const result = {reviewExecuted: true, pass: false,
    score: {coherence: 70, pacing: 70, repetition: 80, engagement: 75, voice: 80, overall: 75},
    issues: [], runtimePackage: null, retryCountUsed: 1,
    qualityDebtAttribution: {repairAttemptsUsed: 1},
  };
  await new ChapterPipelineFinalizationStore().save('n', 'c', 'job-1', content, result);
  const restored = await new ChapterPipelineFinalizationStore().load('n', 'c', 'job-1');
  assert.deepEqual(restored, {content, result});
  assert.equal(await new ChapterPipelineFinalizationStore().load('n', 'c', 'job-2'), null);
  content = 'author edited draft';
  assert.equal(await new ChapterPipelineFinalizationStore().load('n', 'c', 'job-1'), null);
  await assert.rejects(new ChapterPipelineFinalizationStore().save('n', 'c', 'job-1', 'final draft', result), /正文版本/);
  content = 'final draft';
  [...rows.values()][0].metadataJson = '{}';
  await assert.rejects(new ChapterPipelineFinalizationStore().load('n', 'c', 'job-1'), /恢复记录/);
});
