const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { chapterAcceptanceAssessmentPrompt: asset } = require('../dist/prompting/prompts/novel/chapterAcceptance.prompts');
const content = '陆青萝说：“那是验尸册的抄本，副本已转移。”沈夜握不住刀，刀纹丝不动。';
const baseline = {
  blockingIssues: [{ severity: 'medium', category: 'voice', code: 'old_dash', evidence: '面子上——', fixSuggestion: '用自然句读' }],
  missingObligations: [{ kind: 'goal_change', summary: '陆青萝主动保护副本', evidence: '原稿只有旁观' }],
  repairDirectives: [{ mode: 'patch', target: 'character', instruction: '用仵作行动保护副本' }],
};
const input = { novelTitle: '本书', chapterOrder: 18, chapterTitle: '义庄扣人', content, repairReviewBaseline: baseline };
function output() {
  return { status: 'accepted', score: { coherence: 82, pacing: 82, repetition: 82, engagement: 82, voice: 82, overall: 82 },
    summary: '候选已修复', blockingIssues: [], missingObligations: [], repairDirectives: [], riskTags: [], repairability: 'none', continuePolicy: 'continue',
    assetSyncRecommendation: { priority: 'normal', reason: '同步', requiresFullPayoffReconcile: false },
    repairVerification: { contentHash: createHash('sha256').update(content).digest('hex'), checks: [
      { kind: 'issue', key: 'old_dash', status: 'resolved', currentEvidence: '陆青萝说：“那是验尸册的抄本，副本已转移。”', reason: '句读自然' },
      { kind: 'obligation', key: 'goal_change:陆青萝主动保护副本', status: 'resolved', currentEvidence: '副本已转移', reason: '主动保护成立' },
    ] },
  };
}
const validate = (result, request = input) => {
  assert.equal(typeof asset.postValidate, 'function', 'reacceptance must validate candidate evidence');
  return asset.postValidate(asset.outputSchema.parse(result), request, {});
};

test('fresh candidate evidence verifies each original issue and obligation', () => {
  assert.equal(validate(output()).status, 'accepted');
});
test('missing or stale candidate identity cannot masquerade as successful reacceptance', () => {
  const absent = output(); delete absent.repairVerification;
  assert.throws(() => validate(absent), /复验/);
  const stale = output(); stale.repairVerification.contentHash = 'old';
  assert.throws(() => validate(stale), /复验/);
});
test('deleted historical quote is rejected even when the candidate hash is correct', () => {
  const stale = output(); stale.repairVerification.checks[0].currentEvidence = '面子上——';
  assert.throws(() => validate(stale), /复验/);
});
test('resolved check cannot also remain a blocking issue', () => {
  const inconsistent = output(); inconsistent.blockingIssues = [{ ...baseline.blockingIssues[0], currentEvidence: '刀纹丝不动' }];
  assert.throws(() => validate(inconsistent), /复验/);
});
test('real unresolved issues remain visible with fresh candidate quotes', () => {
  const result = output(); result.status = 'repairable'; result.continuePolicy = 'repair_once';
  result.repairVerification.checks[0].status = 'unresolved';
  result.blockingIssues = [{ ...baseline.blockingIssues[0], evidence: '需要核对表达', currentEvidence: '刀纹丝不动' }];
  assert.equal(validate(result).blockingIssues.length, 1);
});
test('new issues need evidence from the candidate and omitted baseline checks are rejected', () => {
  const bad = output(); bad.blockingIssues = [{ ...baseline.blockingIssues[0], code: 'new', currentEvidence: '不在候选正文' }];
  assert.throws(() => validate(bad), /复验/);
  const omitted = output(); omitted.repairVerification.checks.pop();
  assert.throws(() => validate(omitted), /复验/);
});
test('historical evidence is not rendered into the recheck baseline', () => {
  const messages = asset.render(input, { blocks: [] });
  const baselineText = String(messages.at(-1).content);
  assert.ok(!baselineText.includes('面子上——'));
  assert.ok(baselineText.includes('old_dash'));
});

test('first assessment does not require repair verification', () => {
  const result = output(); delete result.repairVerification;
  assert.equal(validate(result, { ...input, repairReviewBaseline: undefined }).status, 'accepted');
});

test('verification failure degrades to an uncached warning without further model calls', async () => {
  const { ChapterAcceptanceAssessmentService } = require('../dist/services/novel/runtime/ChapterAcceptanceAssessmentService');
  const { ChapterRepairVerificationError } = require('../dist/prompting/prompts/novel/chapterAcceptance.prompts');
  const service = new ChapterAcceptanceAssessmentService(); let calls = 0;
  service.invokeAssessment = async () => { calls++; throw new ChapterRepairVerificationError('修文复验证据来源不正确'); };
  const result = await service.assess({ ...input, novelId: 'n', chapterId: 'c', persist: false });
  assert.equal(calls, 1);
  assert.ok(result.assessment.riskTags.includes('repair_review_evidence_invalid'));
  assert.ok(result.assessment.riskTags.includes('acceptance_gate_unavailable'));
});
