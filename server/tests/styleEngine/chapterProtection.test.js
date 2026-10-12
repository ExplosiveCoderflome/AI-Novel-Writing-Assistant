const test = require('node:test');
const assert = require('node:assert/strict');
const { loadRuntimeSource } = require('../novelProduction/sourceHarness.cjs');
const shared = require('../../../shared/dist/types/styleEngine.js');
const original = '张三缓缓打开木门，等李四进屋。';
function fixture(issueId, replacement = '张三打开木门，') {
  const requests = [];
  const module = loadRuntimeSource('../chapterPatchRepairService.ts', {
    '@ai-novel/shared/types/styleEngine': shared,
    '@ai-novel/shared/types/chapterPatchRepair': require('../../../shared/dist/types/chapterPatchRepair.js'),
    '../../prompting/core/promptRunner': { runStructuredPrompt: async request => {
      requests.push(request);
      return { output: { strategy: 'patch_first', summary: '调整表达', requiresFullRewrite: false,
        patches: [{ id: 'p', targetExcerpt: '张三缓缓打开木门，', replacement, reason: '调整表达', issueIds: [issueId] }] } };
    } },
    '../../prompting/prompts/novel/chapterLayeredContext': { buildChapterPatchRepairContextBlocks: () => [] },
    '../../prompting/prompts/novel/chapterPatchRepair.prompts': { chapterPatchRepairPrompt: {} },
    '../styleEngine/rewrite': require('../../dist/services/styleEngine/rewrite'),
  });
  return { ...module, requests, instance: new module.ChapterPatchRepairService() };
}
const request = { novelTitle: '书', chapterTitle: '章', content: original, issues: [], runtimePackage: {
  context: {}, audit: { openIssues: [] }, styleReview: { report: { violations: [
    { issueCode: 'expression', layer: 'surface', canAutoRewrite: true },
    { issueCode: 'theme', layer: 'narrative', canAutoRewrite: true },
  ] } },
} };
test('chapter patch permission is bound to the real structured style issue and forwards fact comparison', async () => {
  const h = fixture('expression');
  const result = await h.instance.repair(request);
  assert.equal(result.content, '张三打开木门，等李四进屋。');
  assert.equal(result.rewriteGuard.checks.at(-1).status, 'not_checked');
  assert.equal(result.styleRewriteBaseline.changes.length, 1);
  const policy = JSON.parse(h.requests[0].promptInput.styleProtection);
  assert.deepEqual(policy.allowedIssueIds, ['expression']);
  assert.equal(policy.reportOnly[0].issueCode, 'theme');
});
test('report-only narrative and arbitrary issue IDs fail before candidate selection', async () => {
  for (const issueId of ['theme', 'invented']) {
    const h = fixture(issueId);
    await assert.rejects(h.instance.repair(request), error => error instanceof h.ChapterPatchRepairFailedError
      && error.rewriteGuard.checks.some(check => check.code === 'patch_scope' && check.status === 'blocked'));
  }
});
test('known character names cannot be changed by a pure expression patch', async () => {
  const h = fixture('expression', '王五打开木门，');
  await assert.rejects(h.instance.repair({ ...request, repairContext: { writeContext: { characterHardFacts: [{ name: '张三' }] } } }),
    error => error.rewriteGuard.checks.some(check => check.code === 'protected_terms' && check.status === 'blocked'));
});
