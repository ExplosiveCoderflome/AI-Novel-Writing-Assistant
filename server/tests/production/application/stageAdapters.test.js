const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { api, request, harness, hash } = require('./harness.cjs');
const target = path.resolve(__dirname, '../../../dist/modules/production/infrastructure/stages/index.js');
const adapters = fs.existsSync(target) ? require(target) : {};
function fixture(options = {}) {
  assert.equal(typeof adapters.createChapterStagePorts, 'function', 'createChapterStagePorts must be exported');
  const calls = [];
  const p = harness();
  const services = {
    purpose: 'automatic',
    readBaseline: async () => ({ content: options.afterPrepareContent && calls.includes('prepare') ? options.afterPrepareContent : options.content ?? '',
      updatedAt: new Date(options.metadataUpdated && calls.includes('prepare') ? 10 : 0).toISOString(), protectedUserContent: !!options.protected }),
    prepare: async () => { calls.push('prepare'); return { novelTitle: '书', chapterTitle: '章', contextPackage: options.contextPackage ?? {} }; },
    describe: async (stage, row, input) => ({ callsModel: ['draft', 'accept', 'repair', 'verify'].includes(stage),
      ...(row.snapshots.profile.outputBudgets[stage] ? { outputTokens: row.snapshots.profile.outputBudgets[stage] } : {}),
      inputFingerprint: hash(JSON.stringify(input)), promptVersion: 'v1', configVersion: 'v1', input }),
    scoped: async (run, invocation, operation) => { calls.push('scope'); return operation(); },
    write: async () => { calls.push('write'); return options.empty ? '' : 'original'; },
    assess: async input => {
      calls.push(input.repairReviewBaseline ? 'verify' : 'accept');
      assert.equal(input.persistAssessment, false);
      const candidate = input.content.trim() === 'candidate';
      return { assessment: { status: candidate || !options.repair ? 'accepted' : 'repairable', blockingIssues: candidate || !options.repair ? [] : [
        { code: 'gap', severity: 'high', category: 'plot', evidence: 'original', fixSuggestion: '补动作' },
      ], missingObligations: [], repairDirectives: options.repair ? [{ mode: 'patch', target: 'plot', instruction: '补动作' }] : [],
      repairability: 'none', riskTags: [], ...(candidate ? { repairVerification: {
        contentHash: hash(input.content), checks: [], factPreservation: { sourceContentHash: hash('original'), status: 'preserved', correctionIssueIds: [], currentEvidence: 'candidate', reason: '保留' },
      } } : {}) }, issues: [], auditReports: [] };
    },
    repair: async () => { calls.push('repair'); if (options.repairError) throw options.repairError; return { content: options.repaired ?? 'candidate' }; },
    knownRepairFailure: error => error?.message === 'known patch failure' ? 'patch_anchor_invalid' : null,
    ...(options.styleReview ? { postGenerationStyleReview: options.styleReview } : {}),
  };
  p.stages = adapters.createChapterStagePorts(services, { reconcile: p.stages.reconcile });
  return { p, calls };
}
test('stage adapters persist original and assessments without publishing before commit', async () => {
  const { p, calls } = fixture();
  const result = await api('runUnit')(request(), p);
  assert.equal(result.status, 'completed');
  assert.equal(result.progress.selected, 'original');
  assert.ok(calls.includes('prepare'));
  assert.deepEqual(calls.filter(x => x !== 'scope'), ['prepare', 'write', 'accept']);
  assert.equal(p.calls.filter(x => x === 'chapter-write').length, 1);
  const run = [...p.rows.values()][0];
  assert.ok(run.artifacts.stageData.accept.assessment);
  assert.equal(run.artifacts.prepared.baseline.content, '');
});
test('repair remains a candidate until trusted verification selects it, and baseline is passed to recheck', async () => {
  const { p, calls } = fixture({ repair: true });
  const result = await api('runUnit')(request(), p);
  assert.equal(result.status, 'completed');
  assert.equal(result.progress.selected, 'candidate');
  assert.deepEqual(calls.filter(x => x !== 'scope'), ['prepare', 'write', 'accept', 'repair', 'verify']);
  assert.equal(p.calls.filter(x => x === 'chapter-write').length, 1);
});
test('repair preserves raw candidate whitespace outside the applied patch', async () => {
  const content = '  \ncandidate\n\n';
  const { p } = fixture({ repair: true, repaired: content });
  const result = await api('runUnit')(request(), p);
  assert.equal(result.status, 'completed');
  assert.equal(result.progress.selected, 'candidate');
  assert.equal(result.progress.selectedContentHash, hash(content));
  assert.equal([...p.rows.values()][0].artifacts.candidate, content);
});
test('an unchanged padded manuscript does not create a candidate or another review', async () => {
  const content = '  \noriginal\n\n';
  const { p, calls } = fixture({ content, repair: true, repaired: content });
  const result = await api('runUnit')(request(), p);
  assert.equal(result.status, 'completed');
  assert.equal(result.progress.selectedContentHash, hash(content));
  assert.equal(calls.includes('verify'), false);
  assert.equal([...p.rows.values()][0].artifacts.candidate, undefined);
});
test('automatic preparation preserves a human-edited chapter', async () => {
  const { p, calls } = fixture({ protected: true });
  const result = await api('runUnit')(request(), p);
  assert.notEqual(result.status, 'completed');
  assert.equal(calls.includes('write'), false);
  assert.equal(p.calls.includes('chapter-write'), false);
});
test('preparation accepts its own metadata version changes but cannot adopt concurrent human prose', async () => {
  const metadata = fixture({ metadataUpdated: true });
  assert.equal((await api('runUnit')(request(), metadata.p)).status, 'completed');
  assert.equal([...metadata.p.rows.values()][0].artifacts.prepared.baseline.updatedAt, new Date(10).toISOString());
  const edited = fixture({ afterPrepareContent: 'human edit' });
  assert.notEqual((await api('runUnit')(request(), edited.p)).status, 'completed');
  assert.equal(edited.calls.includes('write'), false);
  assert.equal(edited.p.calls.includes('chapter-write'), false);
});
test('an empty writer result fails without adding a hidden second generation request', async () => {
  const { p, calls } = fixture({ empty: true });
  const result = await api('runUnit')(request(), p);
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'no_usable_content');
  assert.equal(calls.filter(x => x === 'write').length, 1);
});
test('existing unprotected prose is reviewed and retained without generating a replacement draft', async () => {
  const { p, calls } = fixture({ content: '  已有正文\n' });
  const result = await api('runUnit')(request(), p);
  assert.equal(result.status, 'completed');
  assert.equal(calls.includes('write'), false);
  assert.deepEqual(calls.filter(x => x !== 'scope'), ['prepare', 'accept']);
  assert.equal(result.progress.selectedContentHash, hash('  已有正文\n'));
  assert.equal([...p.rows.values()][0].artifacts.original, '  已有正文\n');
});
test('only known structured patch failures become debt; transport failures remain unresolved', async () => {
  const known = fixture({ repair: true, repairError: new Error('known patch failure') });
  const degraded = await api('runUnit')(request(), known.p);
  assert.equal(degraded.status, 'completed');
  assert.equal(degraded.progress.selected, 'original');
  assert.equal(degraded.progress.repairAttemptsUsed, 1);
  const unknown = fixture({ repair: true, repairError: new Error('transport failure') });
  assert.equal((await api('runUnit')(request(), unknown.p)).status, 'unknown');
  assert.equal(unknown.p.calls.includes('chapter-write'), false);
});

const domainApi = require('../../../dist/modules/production/domain');
function recordingReview(verdict) {
  const calls = [];
  return { calls, port: { review: async input => { calls.push(input); return verdict; } } };
}
const styleOn = { postGenerationStyleReviewEnabled: true,
  chapterWriteContext: { continuationConstraints: ['不要复刻原作第一章的开门描写'] } };

test('the post-generation review is not called when the book switch is off', async () => {
  const review = recordingReview({ status: 'pass' });
  const { p } = fixture({ styleReview: review.port });
  const result = await api('runUnit')(request(), p);
  assert.equal(result.status, 'completed');
  assert.deepEqual(review.calls, []);
});

test('a book switch alone cannot call an uninstalled review port', async () => {
  const { p } = fixture({ contextPackage: styleOn });
  const result = await api('runUnit')(request(), p);
  assert.equal(result.status, 'completed');
  assert.equal(result.progress.committedContentHash, hash('original'));
});

test('a failing review blocks commit, keeps no claim, and records a recoverable pause', async () => {
  const review = recordingReview({ status: 'fail', code: 'continuation_imitation', reason: '复刻原作开头' });
  const { p } = fixture({ styleReview: review.port, contextPackage: styleOn });
  const result = await api('runUnit')(request(), p);
  assert.equal(result.status, 'paused');
  assert.equal(result.reason, 'style_review_rejected');
  assert.equal(result.progress.styleReviewPause.code, 'continuation_imitation');
  assert.equal(result.progress.styleReviewPause.acknowledged, false);
  assert.equal(result.progress.committedContentHash, undefined);
  assert.equal(p.calls.includes('chapter-write'), false);
  const run = [...p.rows.values()][0];
  assert.equal(run.activeStage, null);
  assert.equal(run.activeRequestKey, null);
  assert.equal(review.calls.length, 1);
  assert.deepEqual(review.calls[0].continuationConstraints, ['不要复刻原作第一章的开门描写']);
  assert.equal(review.calls[0].enabled, true);
});

test('an explicit acknowledgement lets the same manuscript commit without a silent retry', async () => {
  const review = recordingReview({ status: 'fail', code: 'continuation_imitation', reason: '复刻原作开头' });
  const { p } = fixture({ styleReview: review.port, contextPackage: styleOn });
  assert.equal((await api('runUnit')(request(), p)).status, 'paused');
  const run = [...p.rows.values()][0];
  const progress = domainApi.applyUnitAction(run.progress, { kind: 'acknowledge_style_review_pause',
    contentHash: run.progress.selectedContentHash });
  assert.ok(await p.store.compareAndSwap(run, { progress, artifacts: run.artifacts,
    activeStage: run.activeStage, activeRequestKey: run.activeRequestKey }));
  const resumed = await api('runUnit')(request(), p);
  assert.equal(resumed.status, 'completed');
  assert.equal(resumed.progress.committedContentHash, hash('original'));
  assert.equal(review.calls.length, 1);
  assert.equal(p.calls.filter(x => x === 'chapter-write').length, 1);
});
