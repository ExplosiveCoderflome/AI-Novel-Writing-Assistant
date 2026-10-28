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
    prepare: async () => { calls.push('prepare'); return { novelTitle: '书', chapterTitle: '章', contextPackage: {} }; },
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
