const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { hash } = require('./harness.cjs');
const target = path.resolve(__dirname, '../../../dist/modules/production/infrastructure/stages/acceptanceProjection.js');
const moduleApi = fs.existsSync(target) ? require(target) : {};
function project(overrides = {}) {
  assert.equal(typeof moduleApi.projectAcceptance, 'function', 'projectAcceptance must be exported');
  return moduleApi.projectAcceptance({ content: 'candidate', stage: 'accept', assessment: {
    status: 'repairable', blockingIssues: [], missingObligations: [], repairDirectives: [{ mode: 'patch', target: 'plot', instruction: '补齐动作' }],
    repairability: 'none', riskTags: [], ...overrides.assessment,
  }, ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'assessment')) });
}
test('projection preserves obligation identity and never invents permission for report-only voice findings', () => {
  const result = project({ assessment: { blockingIssues: [
    { code: 'plot', category: 'plot', severity: 'high' },
    { code: 'narrative', category: 'voice', severity: 'high', layer: 'narrative', canAutoRewrite: false },
    { code: 'surface', category: 'voice', severity: 'medium', layer: 'surface', canAutoRewrite: true },
  ], missingObligations: [{ kind: 'must_hit_now', summary: '交出钥匙' }], repairability: 'patchable_obligation_gap' } });
  assert.deepEqual(result.issues.map(x => [x.code, x.patchable]), [['plot', true], ['narrative', false], ['surface', true]]);
  assert.equal(result.missingObligations[0].summary, '交出钥匙');
  assert.equal(result.contentHash, hash('candidate'));
});
test('partial style failure retains verified story repair permission but cannot authorize adopting a candidate', () => {
  const original = project({ assessment: { riskTags: ['style_review_unavailable'] } });
  const candidate = project({ stage: 'verify', assessment: { riskTags: ['style_review_unavailable'] } });
  assert.equal(original.gateAvailable, true);
  assert.equal(original.issues.find(x => x.code === 'style_review_unavailable').patchable, false);
  assert.equal(candidate.gateAvailable, false);
  assert.equal(project({ assessment: { riskTags: ['acceptance_gate_unavailable'] } }).gateAvailable, false);
});
test('candidate factual verification is bound to original and candidate hashes and authorized corrections', () => {
  const facts = { sourceContentHash: hash('original'), status: 'preserved', correctionIssueIds: [], currentEvidence: 'candidate', reason: '保留事实' };
  const verification = { contentHash: hash('candidate'), checks: [], factPreservation: facts };
  assert.equal(project({ stage: 'verify', originalContentHash: hash('original'), assessment: { repairVerification: verification } }).factPreservation, 'preserved');
  assert.equal(project({ stage: 'verify', originalContentHash: 'wrong', assessment: { repairVerification: verification } }).factPreservation, 'unknown');
  assert.equal(project({ stage: 'verify', originalContentHash: hash('original'), assessment: { repairVerification: { ...verification, factPreservation: { ...facts, status: 'changed' } } } }).factPreservation, 'violated');
  const correction = { ...verification, factPreservation: { ...facts, status: 'authorized_correction', correctionIssueIds: ['fix-1'] } };
  assert.equal(project({ stage: 'verify', originalContentHash: hash('original'), allowedCorrectionIssueIds: ['fix-1'], assessment: { repairVerification: correction } }).factPreservation, 'authorized_correction');
  assert.equal(project({ stage: 'verify', originalContentHash: hash('original'), assessment: { repairVerification: correction } }).factPreservation, 'unknown');
});
