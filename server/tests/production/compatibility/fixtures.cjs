const { hash } = require('../application/harness.cjs');
const original = 'generated draft';
const candidate = 'repair candidate';
function assessment(extra = {}) {
  return { status: 'accepted', blockingIssues: [], missingObligations: [], repairDirectives: [], repairability: 'none', riskTags: [], ...extra };
}
const high = { code: 'plot_gap', severity: 'high', category: 'plot', evidence: '缺少行动', fixSuggestion: '补行动' };
const blocking = extra => assessment({ status: 'repairable', blockingIssues: [high], repairDirectives: [{ mode: 'patch', target: 'plot', instruction: '补行动' }], ...extra });
function verified(status = 'preserved', extra = {}) {
  return assessment({ repairVerification: { contentHash: hash(candidate), checks: [], factPreservation: {
    sourceContentHash: hash(original), status, correctionIssueIds: [], currentEvidence: candidate, reason: '同夹具核对' } }, ...extra });
}
const fixtures = [
  { id: 'accepted', title: '结构化审校通过', scores: [90], original: assessment(), candidate: verified() },
  { id: 'score_only', title: '仅旧总分未达阈值，无结构化问题', scores: [60, 90], original: assessment(), candidate: verified() },
  { id: 'facts_preserved', title: '修复消除问题且事实保留', scores: [60, 90], original: blocking(), candidate: verified() },
  { id: 'facts_unknown', title: '候选消除问题但未核对事实', scores: [60, 90], original: blocking(), candidate: assessment() },
  { id: 'facts_changed', title: '候选消除问题但改变事实', scores: [60, 90], original: blocking(), candidate: verified('changed') },
  { id: 'new_severe', title: '候选新增严重问题', scores: [60, 90], original: blocking(), candidate: verified('preserved', { blockingIssues: [{ ...high, code: 'new_continuity' }] }) },
  { id: 'new_obligation', title: '同类义务更换为另一项', scores: [60, 90], original: blocking({ repairability: 'patchable_obligation_gap', missingObligations: [{ kind: 'action', summary: '交出钥匙' }] }),
    candidate: verified('preserved', { missingObligations: [{ kind: 'action', summary: '答应返回' }], repairability: 'patchable_obligation_gap' }) },
  { id: 'partial_review', title: '表达检查不可用', scores: [60], original: assessment({ riskTags: ['style_review_unavailable'],
    blockingIssues: [{ code: 'style_review_unavailable', severity: 'medium', category: 'voice', evidence: '检查不可用', fixSuggestion: '稍后复查' }] }), candidate: verified() },
  { id: 'zero_allowance', title: '修复额度为零', scores: [60], original: blocking(), candidate: verified(), maxAttempts: 0 },
  { id: 'quality_pause', title: '质量优先保存后人工暂停', scores: [60], original: assessment({ status: 'needs_manual_review', blockingIssues: [high] }), candidate: verified(), manual: true, maxAttempts: 0 },
];
module.exports = { fixtures, original, candidate };
