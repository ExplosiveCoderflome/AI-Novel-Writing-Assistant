const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('real SQLite receipts and launch snapshots survive process restart without resetting the allowance', () => {
  const root = path.resolve(__dirname, '../..');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'review-retry-persistence-'));
  const script = path.join(directory, 'verify.cjs');
  fs.writeFileSync(script, String.raw`
const assert = require('node:assert/strict');
const path = require('node:path');
const root = process.env.REVIEW_RETRY_REPO;
const { prisma } = require(path.join(root, 'dist/db/prisma'));
const { ensureRuntimeDatabaseReady } = require(path.join(root, 'dist/db/runtimeMigrations'));
const { createPersistedChapterReviewRetryBudget, ReviewRetryPersistenceError } = require(path.join(root, 'dist/services/novel/runtime/acceptance'));
const { claimModelRequest } = require(path.join(root, 'dist/platform/llm/retries'));
const policy = { maxRetries: 2, onExhausted: 'pause_for_manual' };
const identity = { novelId: 'offline-review', chapterId: 'c', executionId: 'job' };
(async () => {
 if (process.argv[2] === 'first') {
  await ensureRuntimeDatabaseReady();
  await prisma.novel.create({data:{id:identity.novelId,title:'隔离测试',directorVersion:'v2'}});
  await prisma.chapter.create({data:{id:'c',novelId:identity.novelId,order:1,title:'第一章'}});
  const { directorIssuePolicyService } = require(path.join(root, 'dist/services/novel/director/issues/DirectorIssuePolicyService'));
  await directorIssuePolicyService.saveNovelOverride(identity.novelId, {chapterReviewRetryPolicy:policy});
  assert.deepEqual((await directorIssuePolicyService.getNovelPolicy(identity.novelId)).override.chapterReviewRetryPolicy,policy);
  require(path.join(root, 'dist/prompting/core/promptRunner')).runStructuredPrompt = async () => {throw Error('snapshot must not call AI');};
  const { createDirectorProductionOptions } = require(path.join(root, 'dist/app/director/productionComposition'));
  const options = createDirectorProductionOptions();
  const contract = options.contractFactory({runId:'offline-run',novelId:identity.novelId,driver:'auto',stepIdsInScope:null,
   launchInput:{storyInput:'隔离故事',estimatedChapterCount:12,worldMode:'skip',targetMode:'opening',provider:'openai',model:'offline-no-ai',executionRange:{from:1,to:2}}});
  await options.prepareOpen(contract);
  assert.equal(contract.issuePolicy.mode,'completion_first');
  assert.deepEqual(contract.issuePolicy.pipelinePolicy.chapterReviewRetryPolicy,policy);
  const { PrismaRunRepository } = require(path.join(root, 'dist/modules/director/infrastructure'));
  await new PrismaRunRepository(prisma).open(contract);
  await directorIssuePolicyService.saveNovelOverride(identity.novelId, {chapterReviewRetryPolicy:{maxRetries:7,onExhausted:'continue_with_warning'}});
  const budget = createPersistedChapterReviewRetryBudget({...identity,policy});
  await budget.runCheck('initial',async()=>{await claimModelRequest();await claimModelRequest();});
  await budget.recordResult('initial',false);
  assert.equal(budget.summary().used,1);
 } else {
  const { PrismaRunRepository } = require(path.join(root, 'dist/modules/director/infrastructure'));
  const contract = await new PrismaRunRepository(prisma).getContract('offline-run');
  assert.deepEqual(contract.issuePolicy.pipelinePolicy.chapterReviewRetryPolicy,policy);
  const budget = createPersistedChapterReviewRetryBudget({...identity,policy:{maxRetries:20,onExhausted:'continue_with_warning'}});
  assert.equal((await budget.loadSummary()).used,1,'a cached assessment must not show a reset counter after restart');
  assert.equal(budget.summary().maxRetries,2);
  await budget.runCheck('initial',claimModelRequest);
  await assert.rejects(budget.runCheck('initial',claimModelRequest));
  assert.deepEqual(budget.summary(),{...policy,used:2,exhausted:true});
  await budget.runCheck('candidate',claimModelRequest);
  await assert.rejects(budget.runCheck('candidate',claimModelRequest));
  const row = await prisma.chapterArtifactSyncCheckpoint.findFirstOrThrow({where:{artifactType:'chapter_review_retry_budget:v1'}});
  await prisma.chapterArtifactSyncCheckpoint.update({where:{id:row.id},data:{metadataJson:'broken fixture'}});
  const corrupted = createPersistedChapterReviewRetryBudget({...identity,policy});
  await assert.rejects(corrupted.runCheck('initial',claimModelRequest),ReviewRetryPersistenceError);
 }
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>prisma.$disconnect());
`);
  for (const phase of ['first', 'resumed']) {
    const result = spawnSync(process.execPath, [script, phase], { encoding: 'utf8', timeout: 45000,
      env: { ...process.env, NODE_ENV: 'production', REVIEW_RETRY_REPO: root, AI_NOVEL_RUNTIME: 'desktop',
        AI_NOVEL_APP_DATA_DIR: directory, DATABASE_URL: `file:${path.join(directory, 'isolated.db').replaceAll('\\', '/')}` } });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
});
