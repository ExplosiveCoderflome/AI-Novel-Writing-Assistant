const test = require('node:test');
const assert = require('node:assert/strict');
const { guardStylePatches } = require('../../dist/services/styleEngine/rewrite');
const { isStyleIssueRewritable } = require('../../../shared/dist/types/styleEngine.js');
const { runtimeStyleReviewSchema } = require('../../../shared/dist/types/chapterRuntime/qualitySchemas.js');

function guard(original, target, replacement, options = {}) {
  return guardStylePatches({ original, allowedIssueIds: ['expression'], styleIssueIds: ['expression'],
    plan: { strategy: 'patch_first', summary: '局部修订', requiresFullRewrite: false,
      patches: [{ id: 'p', targetExcerpt: target, replacement, reason: '去除重复', issueIds: ['expression'] }] }, ...options });
}
const blocked = result => result.guard.checks.filter(check => check.status === 'blocked').map(check => check.code);
test('automatic permission intersects instance, layer and rule permission; legacy cannot authorize', () => {
  assert.equal(isStyleIssueRewritable({ layer: 'surface', canAutoRewrite: true }), true);
  for (const item of [{ layer: 'narrative', canAutoRewrite: true }, { layer: 'surface', canAutoRewrite: false },
    { canAutoRewrite: true }, { layer: 'surface', canAutoRewrite: true, issueCategory: 'story_structure' }]) {
    assert.equal(isStyleIssueRewritable(item), false);
  }
  assert.equal(isStyleIssueRewritable({ layer: 'surface', canAutoRewrite: true }, false), false);
});
test('local expression edit preserves source and candidate identities and marks semantic comparison pending', () => {
  const original = '他缓缓打开了门，站在门外。';
  const result = guard(original, '他缓缓打开了门，', '他打开了门，');
  assert.equal(result.content, '他打开了门，站在门外。');
  assert.deepEqual(blocked(result), []);
  assert.notEqual(result.guard.sourceContentHash, result.guard.candidateContentHash);
  assert.equal(result.guard.checks.at(-1).status, 'not_checked');
  assert.deepEqual(result.baseline.allowedCorrectionIssueIds, []);
});
test('unknown and report-only issue ids cannot grant an edit permission', () => {
  const original = '他缓缓打开了门，站在门外。';
  const result = guard(original, '他缓缓打开了门，', '他打开了门，', { allowedIssueIds: ['different'] });
  assert.equal(result.content, original);
  assert.ok(blocked(result).includes('patch_scope'));
});
test('pure style cannot change numbers or protected names', () => {
  for (const [original, replacement, protectedTerms] of [
    ['张三交给李四100元。', '张三交给李四200元。', []],
    ['张三交给李四钱袋。', '张三交给王五钱袋。', ['李四']],
  ]) {
    const result = guard(original, original, replacement, { protectedTerms });
    assert.equal(result.content, original);
    assert.ok(blocked(result).includes('protected_terms'));
  }
});
test('authorized factual correction is separate from literal style protection and requires semantic reacceptance', () => {
  const original = '张三交给李四100元。';
  const result = guard(original, original, '张三交给李四200元。', {
    allowedIssueIds: ['expression', 'amount'],
    plan: { summary: '纠正金额', patches: [{ id: 'p', targetExcerpt: original, replacement: '张三交给李四200元。',
      reason: '已登记金额', issueIds: ['amount'] }] },
  });
  assert.deepEqual(blocked(result), []);
  assert.deepEqual(result.baseline.allowedCorrectionIssueIds, ['amount']);
  assert.equal(result.guard.checks.at(-1).status, 'not_checked');
});
test('whole chapter touching over 45%, excessive addition over 15% and deletion are rejected, while moderate show-dont-tell expansion passes', () => {
  const original = '他感到一阵委屈和无力。' + '雨滴敲着窗沿。'.repeat(100);
  const moderateShow = guard(
    original,
    '他感到一阵委屈和无力。',
    '他把空烟盒捏扁塞回裤兜，站在屋檐下没挪步，任凭雨水顺着领口往里灌。',
  );
  assert.deepEqual(blocked(moderateShow), []);
  const whole = guard(original, original, original.replace('雨滴敲着窗沿', '雨点敲着窗沿'));
  assert.ok(blocked(whole).includes('edit_budget'));
  const added = guard(original, '他感到一阵委屈和无力。', '他推开门望向院子，' + '他走向街道。'.repeat(50));
  assert.ok(blocked(added).includes('edit_budget'));
  const deleted = guard(original, original, '他感到一阵委屈和无力。');
  assert.ok(blocked(deleted).includes('edit_budget'));
});
test('ambiguous and overlapping targets retain the complete original', () => {
  const original = '他打开了门，走进院子。他打开了门，走进院子。';
  const result = guard(original, '他打开了门，', '他推开了门，');
  assert.equal(result.content, original);
  assert.ok(blocked(result).includes('patch_scope'));
});
for (const { name, length, touched, added, rejected } of [
  { name: 'whole chapter permits touching exactly 45%', length: 1000, touched: 450, added: 0, rejected: false },
  { name: 'whole chapter rejects touching above 45%', length: 1000, touched: 451, added: 0, rejected: true },
  { name: 'whole chapter permits adding exactly 15%', length: 1000, touched: 100, added: 150, rejected: false },
  { name: 'whole chapter rejects adding above 15%', length: 1000, touched: 100, added: 151, rejected: true },
  { name: '499 character selection retains its full-touch and 20% addition allowance', length: 499, touched: 499, added: 99, rejected: false },
  { name: '499 character selection rejects addition above 20%', length: 499, touched: 100, added: 100, rejected: true },
  { name: '500 character chapter permits touching exactly 45%', length: 500, touched: 225, added: 0, rejected: false },
  { name: '500 character chapter uses the whole-chapter touch limit', length: 500, touched: 226, added: 0, rejected: true },
]) test(name, () => {
  const original = '首' + '甲'.repeat(length - 2) + '尾';
  const target = original.slice(0, touched);
  const replacement = '改' + '乙'.repeat(touched + added - 1);
  const result = guard(original, target, replacement);
  assert.equal(blocked(result).includes('edit_budget'), rejected);
  assert.equal(result.content, rejected ? original : replacement + original.slice(touched));
});

test('rewrite protection survives runtime schema round trip with the legacy report', () => {
  const result = guard('他缓缓打开了门，站在门外。', '他缓缓打开了门，', '他打开了门，');
  const persisted = { report: null, originalContent: null, autoRewritten: false, rewriteGuard: result.guard };
  assert.deepEqual(runtimeStyleReviewSchema.parse(JSON.parse(JSON.stringify(persisted))), persisted);
});
