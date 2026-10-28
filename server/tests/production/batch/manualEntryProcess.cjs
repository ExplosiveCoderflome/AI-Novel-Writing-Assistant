const assert = require('node:assert/strict');
const {db, prepareNativeFixture, installNativeTransport} = require('./nativeEntryProcess.cjs');
let worker;
async function main() {
  if (process.env.KERNEL_MANUAL_REPLAY) {
    const transport = installNativeTransport();
    const entry = require('../../../dist/app/director/productionKernel/manual/entry').createManualChapterEntry({db,
      commands: () => {throw Error('Read-only restart cannot issue a command');}, wake: () => {throw Error('Read-only restart cannot wake a worker');}});
    const saved = await entry.result('novel-1', 'chapter-1', process.env.KERNEL_MANUAL_REPLAY);
    console.log(JSON.stringify({calls: transport.calls.length, hash: require('../../../dist/modules/production').hashProductionContent(saved.content), reports: saved.review.auditReports.length}));
    return;
  }
  await prepareNativeFixture();
  await db.novel.update({where: {id: 'novel-1'}, data: {directorVersion: 'v2', directorEpoch: process.env.KERNEL_MANUAL_SCENARIO === 'epoch' ? 7 : 0}});
  const {hashProductionContent} = require('../../../dist/modules/production');
  const {assessmentResult} = require('../application/assessmentFixture.cjs');
  let phase = 'write', checking = 0, beforeRepair, repairRun;
  const transport = installNativeTransport(async (configuration, text, defaultOutput) => {
    if (configuration.taskType === 'writer') return '主角在城门把唯一的铜钥匙交给守卫。\n\n'
      + Array.from({length: 100}, (_, i) => `第${i + 1}行账目记着${i + 3}斗粮，主角在${i + 8}号仓的记录旁标注${i + 2}日。`).join('\n\n');
    if (configuration.taskType === 'repair') return {strategy: 'patch_first', summary: '明确钥匙交接', requiresFullRewrite: false,
      patches: [{id: 'key-patch', targetExcerpt: '主角在城门把唯一的铜钥匙交给守卫。',
        replacement: '主角在城门把唯一的铜钥匙递给守卫，守卫当面收下。', reason: '补齐交接回应', issueIds: ['missing-action']}]};
    if (configuration.taskType === 'review' && phase === 'repair' && defaultOutput.score) {
      checking++;
      if (checking === 1) return {...assessmentResult({status: 'repairable', repairability: 'patchable_obligation_gap',
        blockingIssues: [{code: 'missing-action', category: 'plot', severity: 'high', evidence: '钥匙交接未回应', fixSuggestion: '明确守卫收下'}],
        repairDirectives: [{mode: 'patch', target: 'plot', instruction: '补齐守卫回应'}]}).assessment, styleReview: defaultOutput.styleReview};
      assert.equal((await db.chapter.findUniqueOrThrow({where: {id: 'chapter-1'}})).content, beforeRepair, 'candidate must stay unpublished during verification');
      if (process.env.KERNEL_MANUAL_SCENARIO === 'concurrent') {
        await new (require('../../../dist/services/novel/chapterEditor/persistence/ManualChapterStore').ManualChapterStore)()
          .updateChapter('novel-1', 'chapter-1', {content: beforeRepair + '\n人工实时追加。', expectedContent: beforeRepair});
      }
      const unit = await db.productionUnitRun.findFirstOrThrow({where: {activeStage: 'verify'}});
      const input = JSON.parse(unit.stageArtifactsJson).activeDescriptor.input.nativePrompt.promptInput;
      const checklist = require('../../../dist/prompting/prompts/novel/acceptance/repairVerification').buildRepairReviewChecklist(input);
      const evidence = '主角在城门把唯一的铜钥匙递给守卫，守卫当面收下。';
      const remaining = input.repairReviewBaseline.blockingIssues.filter(issue => issue.code !== 'missing-action');
      return {...defaultOutput, status: remaining.length ? 'repairable' : 'accepted', blockingIssues: remaining.map(issue => ({...issue, currentEvidence: evidence})),
        repairVerification: {contentHash: checklist.contentHash,
          checks: [...checklist.issues, ...checklist.obligations].map(item => ({kind: item.kind, key: item.key,
            status: item.key === 'missing-action' ? 'resolved' : 'unresolved', currentEvidence: evidence, reason: '核对当前候选稿'})),
          factPreservation: {sourceContentHash: hashProductionContent(beforeRepair), status: 'preserved', correctionIssueIds: [], currentEvidence: evidence, reason: '人物、地点和交接一致'}}};
    }
    return defaultOutput;
  });
  // Patch tasks use their actual registered schema; no SDK or HTTP leaves this child process.
  const {createDirectorProductionOptions} = require('../../../dist/app/director/productionComposition');
  const {createDirectorNextServices} = require('../../../dist/modules/director');
  const services = createDirectorNextServices(createDirectorProductionOptions()); worker = services.worker;
  const {createManualChapterEntry} = require('../../../dist/app/director/productionKernel/manual/entry');
  const entry = createManualChapterEntry({db, commands: () => services.http.commandService, wake: () => worker.wake(), readTokenLimit: async () => 500000});
  const request = {provider: 'openai', model: 'fixture-model'};
  async function run(operation) {
    const runId = await entry.start('novel-1', 'chapter-1', operation, request);
    const result = await entry.waitForResult('novel-1', 'chapter-1', runId);
    const projection = await services.http.projectionService.get(runId);
    assert.equal(projection.mode, 'completed');
    return {runId, result};
  }
  const written = await run('write'); beforeRepair = written.result.content;
  phase = 'repair';
  if (process.env.KERNEL_MANUAL_SCENARIO === 'concurrent') {
    await assert.rejects(run('repair'), error => error.statusCode === 409);
    const current = await db.chapter.findUniqueOrThrow({where: {id: 'chapter-1'}});
    assert.equal(current.content, beforeRepair + '\n人工实时追加。');
    console.log(JSON.stringify({protected: true, jobs: await db.generationJob.count()}));
    return;
  }
  repairRun = await run('repair');
  assert.ok(checking >= 2, 'repair must verify its candidate');
  assert.notEqual(repairRun.result.content, beforeRepair);
  const {ManualChapterStore} = require('../../../dist/services/novel/chapterEditor/persistence/ManualChapterStore');
  const edited = repairRun.result.content + '\n主角记下守卫姓名，准备翌日返回。';
  await new ManualChapterStore().updateChapter('novel-1', 'chapter-1', {content: edited, expectedContent: repairRun.result.content});
  phase = 'audit'; const audited = await run('audit');
  const snapshot = audited.result;
  const count = transport.calls.length; process.env.PRODUCTION_KERNEL_V2_CHAPTERS = 'false';
  await entry.result('novel-1', 'chapter-1', audited.runId);
  console.log(JSON.stringify({runs: await db.directorNextRun.count(), jobs: await db.generationJob.count(), repaired: repairRun.result.progress.selected === 'candidate',
    runId: audited.runId, contentHash: hashProductionContent(edited), reports: snapshot.review.auditReports.length,
    editedPreserved: snapshot.content === edited, reportMatches: snapshot.review.auditReports.every(report => JSON.parse(report.legacyScoreJson).contentHash === hashProductionContent(edited)),
    replayCalls: transport.calls.length - count, calls: transport.calls.map(call => call.task)}));
}
main().catch(async error => {
  console.error(error);
  console.error(JSON.stringify({events: await db.directorNextEvent.findMany({where: {type: {in: ['execution_failure', 'stop_signal']}}, select: {type: true, payloadJson: true}}),
    units: await db.productionUnitRun.findMany({select: {ownerKey: true, activeStage: true, progressJson: true}})}));
  process.exitCode = 1;
}).finally(async () => {worker?.stop(); await db.$disconnect();});
