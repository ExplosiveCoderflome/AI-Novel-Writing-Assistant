const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const target = path.resolve(__dirname, '../../../dist/modules/production/infrastructure/services/modelAdapters.js');
const moduleApi = fs.existsSync(target) ? require(target) : {};
const { request, harness, hash } = require('./harness.cjs');

async function fixture() {
  assert.equal(typeof moduleApi.createChapterModelAdapters, 'function', 'createChapterModelAdapters must be exported');
  const run = await harness().store.loadOrCreate(request());
  const calls = [];
  const prepared = { novelTitle: '书', chapterTitle: '章', contextPackage: { chapter: { targetWordCount: 2000 } } };
  const call = { callsModel: true, outputTokens: 4096, inputFingerprint: 'full-rendered', promptVersion: 'v1', configVersion: 'v1', input: {} };
  const assessment = { assessment: { blockingIssues: [], missingObligations: [] }, issues: [], auditReports: [] };
  const runtime = { context: { chapterRepairContext: { writeContext: {} } }, audit: { openIssues: [{ id: 'issue-1' }] } };
  const deps = {
    writer: { invoke: async input => { calls.push(['writer', input]); return '正文'; } },
    assessment: { assess: async input => { calls.push(['assess', input]); return assessment; } },
    withReviewBudget: async (row, description, operation) => { calls.push(['review-scope', row.id, description]); return operation(); },
    patches: { repair: async input => { calls.push(['patch', input]); return { content: '候选', plan: { patches: [{ id: 'patch-1', targetExcerpt: '原始片段', replacement: '候选片段', issueIds: ['not-authorized'] }] }, appliedPatchIds: ['patch-1'] }; } },
    repairRuntime: async () => runtime,
    isKnownPatchFailure: error => error?.name === 'ChapterPatchRepairFailedError',
  };
  return { adapter: moduleApi.createChapterModelAdapters(deps), deps, run, calls, prepared, call, assessment };
}
test('model adapter uses injected registered writer and a mandatory frozen review budget', async () => {
  const f = await fixture();
  assert.equal(await f.adapter.write(f.run, f.prepared, f.call), '正文');
  await f.adapter.assess({ run: f.run, prepared: f.prepared, content: '正文', call: f.call, persistAssessment: false });
  assert.deepEqual(f.calls.map(item => item[0]), ['writer', 'review-scope', 'assess']);
  const input = f.calls[2][1];
  assert.equal(input.persist, false);
  assert.equal(input.provider, f.run.snapshots.model.provider);
  assert.equal(input.model, f.run.snapshots.model.model);
  assert.equal(input.targetWordCount, 2000);
  assert.equal(input.content, '正文');
});
test('repair adapter passes the selected assessment runtime and supplies a fact baseline for every candidate', async () => {
  const f = await fixture();
  const result = await f.adapter.repair({ run: f.run, prepared: f.prepared, content: '原始片段', assessment: f.assessment, call: f.call });
  const input = f.calls.find(item => item[0] === 'patch')[1];
  assert.equal(input.repairMode, 'light_repair');
  assert.deepEqual(input.runtimePackage.audit.openIssues, [{ id: 'issue-1' }]);
  assert.equal(result.styleRewriteBaseline.sourceContentHash, hash('原始片段'));
  assert.deepEqual(result.styleRewriteBaseline.changes, [{ original: '原始片段', replacement: '候选片段' }]);
  assert.deepEqual(result.styleRewriteBaseline.allowedCorrectionIssueIds, []);
});
test('review budget failures propagate before the legacy assessment can turn them into warnings', async () => {
  const f = await fixture();
  f.deps.withReviewBudget = async () => { throw new Error('durable budget denied'); };
  await assert.rejects(f.adapter.assess({ run: f.run, prepared: f.prepared, content: '正文', call: f.call, persistAssessment: false }), /durable budget denied/);
  assert.equal(f.calls.some(item => item[0] === 'assess'), false);
});
test('wrapped transport failures cannot be misclassified as known patch failures', async () => {
  const f = await fixture();
  const transport = Object.assign(new Error('request lost'), { name: 'ChapterPatchRepairFailedError' });
  assert.equal(f.adapter.knownRepairFailure(transport), null);
  const patch = Object.assign(new Error('invalid anchor'), { name: 'ChapterPatchRepairFailedError', plan: { patches: [] } });
  assert.equal(f.adapter.knownRepairFailure(patch), 'patch_plan_not_applicable');
});
