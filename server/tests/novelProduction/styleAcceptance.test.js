const test = require('node:test');
const assert = require('node:assert/strict');
const { loadRuntimeSource } = require('./sourceHarness.cjs');
const { StyleCompiler } = require('../../dist/services/styleEngine/StyleCompiler');
const prompt = require('../../dist/prompting/prompts/novel/chapterAcceptance.prompts');
const acceptance = require('../../dist/services/novel/runtime/acceptance');

function context(enabled = true) {
  const compiledBlocks = new StyleCompiler().compile({ styleProfile: {
    narrativeRules: {}, characterRules: {}, languageRules: {}, rhythmRules: {},
  }, antiAiRules: [{ id: 'psychology', name: '禁止解释心理', type: 'forbidden', severity: 'high',
    enabled: true, autoRewrite: true, promptInstruction: '用行动呈现心理，不替读者解释。', detectPatterns: ['他意识到'] }],
    appliedRuleIds: ['psychology'], globalAntiAiRuleIds: ['psychology'], usesGlobalAntiAiBaseline: true });
  return { chapter: { id: 'c', title: '章', order: 1 }, postGenerationStyleReviewEnabled: enabled,
    styleContext: { compiledBlocks } };
}
function output(overrides = {}) {
  return { status: 'accepted', score: { coherence: 90, pacing: 90, repetition: 90, engagement: 90, voice: 90, overall: 90 },
    summary: '验收完成', blockingIssues: [], repairDirectives: [], missingObligations: [], repairability: 'none',
    decisionReason: '可继续', riskTags: [], continuePolicy: 'continue',
    assetSyncRecommendation: { priority: 'normal', reason: '同步', requiresFullPayoffReconcile: false },
    styleReview: { riskScore: 0, summary: '写法规则已检查', issueCodes: [] }, ...overrides };
}
function service(result) {
  const requests = [];
  const { ChapterAcceptanceAssessmentService } = loadRuntimeSource('ChapterAcceptanceAssessmentService.ts', {
    '../../../db/prisma': { prisma: {} },
    '../../../prompting/core/promptRunner': { runStructuredPrompt: async input => { requests.push(input); return { output: result }; } },
    '../../../prompting/context/promptContextResolution': { resolvePromptContextBlocksForAsset: async ({ fallbackBlocks }) => ({ blocks: fallbackBlocks }) },
    '../../../prompting/prompts/novel/chapterLayeredContext': { buildChapterReviewContextBlocks: () => [] },
    '../../../prompting/prompts/novel/chapterLayeredContextShared': { resolveTargetWordRange: () => ({ minWordCount: null, maxWordCount: null }) },
    '../../../prompting/prompts/novel/chapterAcceptance.prompts': prompt,
    '../../state/OpenConflictService': { openConflictService: {} },
    '../novelP0Utils': { normalizeScore: score => score, ruleScore: () => output().score },
    './proseQuality/ProseQualityDetector': { detectProseQuality: () => ({ findings: [] }) },
    './acceptance': acceptance,
  });
  return { instance: new ChapterAcceptanceAssessmentService(), requests };
}
function input(pkg) {
  return { novelId: 'n', chapterId: 'c', novelTitle: '书', chapterTitle: '章', chapterOrder: 1,
    content: '人物经历了风雨，终于懂得生活的真谛。', contextPackage: pkg, persist: false };
}
test('enabled style review reuses one acceptance call and returns a report from its voice evidence', async () => {
  const h = service(output({ status: 'repairable', blockingIssues: [{ code: 'theme_summary', category: 'voice', severity: 'high',
    evidence: '终于懂得生活的真谛', fixSuggestion: '落回具体行动' }],
    styleReview: { riskScore: 65, summary: '总结腔', issueCodes: ['theme_summary'] } }));
  const result = await h.instance.assess(input(context()));
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].promptInput.styleReviewEnabled, true);
  assert.ok(h.requests[0].contextBlocks.some(block => block.group === 'style_contract' && block.required && block.allowSummary === false));
  assert.equal(result.styleReviewReport.riskScore, 65);
  assert.equal(result.styleReviewReport.violations[0].excerpt, '终于懂得生活的真谛');
  assert.equal(result.issues[0].category, 'voice');
});
test('disabled style review omits detection context and report while retaining writer style context', async () => {
  const pkg = context(false), h = service(output());
  const result = await h.instance.assess(input(pkg));
  assert.equal(h.requests[0].promptInput.styleReviewEnabled, false);
  assert.equal(h.requests[0].contextBlocks.some(block => block.group === 'style_contract'), false);
  assert.equal(result.styleReviewReport, null);
  assert.ok(pkg.styleContext.compiledBlocks.contract.antiAi.hasContent);
});
test('a rule with automatic rewrite disabled records debt without scheduling a patch', async () => {
  const pkg = context();
  pkg.styleContext.compiledBlocks.contract.meta.antiAiRulePolicies = [{ id: 'psychology', name: '禁止解释心理',
    type: 'forbidden', severity: 'high', autoRewrite: false }];
  const h = service(output({ status: 'repairable', blockingIssues: [{ code: 'psychology_explanation', styleRuleId: 'psychology',
    category: 'voice', severity: 'high', evidence: '终于懂得生活的真谛', fixSuggestion: '改成行动' }],
    repairDirectives: [{ mode: 'patch', target: 'voice', instruction: '改成行动' }],
    styleReview: { riskScore: 60, summary: '表达风险', issueCodes: ['psychology_explanation'] } }));
  const result = await h.instance.assess(input(pkg));
  assert.equal(result.assessment.status, 'continue_with_risk');
  assert.equal(result.assessment.blockingIssues.length, 0);
  assert.equal(result.assessment.repairDirectives.length, 0);
  assert.ok(result.assessment.riskTags.some(tag => tag.includes('改成行动')));
  assert.equal(result.styleReviewReport.violations[0].canAutoRewrite, false);
  assert.equal(result.styleReviewReport.violations[0].ruleId, 'psychology');
});
test('missing style review is not presented as a passed detection', () => {
  assert.throws(() => prompt.chapterAcceptanceAssessmentPrompt.postValidate(output({ styleReview: undefined }),
    { content: '正文', styleReviewEnabled: true }), /写法|style/);
});
test('style report codes must reference actual voice issues in the same assessment', () => {
  assert.throws(() => prompt.chapterAcceptanceAssessmentPrompt.postValidate(output({
    styleReview: { riskScore: 60, summary: '风险', issueCodes: ['invented'] },
  }), { content: '正文', styleReviewEnabled: true }), /写法|style/);
});

test('semantic style detection still evaluates prose without any literal forbidden token', async () => {
  const pkg = context();
  const rule = { id: 'psychology', name: '禁止解释心理', type: 'forbidden', severity: 'high', enabled: true,
    autoRewrite: true, detectPatterns: ['他意识到'], promptInstruction: '不要解释心理' };
  const { StyleDetectionService } = loadRuntimeSource('../../styleEngine/StyleDetectionService.ts', {
    '../../prompting/core/promptRunner': { runStructuredPrompt: async () => ({ output: {
      riskScore: 60, summary: '语义上仍有总结腔', violations: [{ ruleId: 'psychology', ruleName: rule.name,
        ruleType: 'forbidden', severity: 'high', excerpt: '终于懂得生活的真谛', reason: '总结心理',
        suggestion: '改成行动', canAutoRewrite: true }], canAutoRewrite: true } }) },
    '../../prompting/prompts/style/style.prompts': { styleDetectionPrompt: {} },
    './styleContractText': require('../../dist/services/styleEngine/styleContractText'),
    './StyleRuntimeResolver': { StyleRuntimeResolver: class { async resolve() { return { context: pkg.styleContext, antiAiRules: [rule] }; } } },
    './antiAiPreviewRules': { listPreviewAntiAiRules: async () => [], mergeAntiAiRules: rules => rules,
      buildAntiAiRuleCatalogText: () => '规则目录', buildAntiAiRuleDirectiveText: () => '' },
  });
  const report = await new StyleDetectionService().check({ content: '终于懂得生活的真谛' });
  assert.equal(report.riskScore, 60);
  assert.equal(report.violations[0].ruleId, 'psychology');
});

test('finalization stores the unified acceptance style report without a second rewriting pass', async () => {
  const report = { riskScore: 0, summary: '检查通过', violations: [], canAutoRewrite: false, appliedRuleIds: ['psychology'] };
  const { ChapterContentFinalizationService } = loadRuntimeSource('ChapterContentFinalizationService.ts', {
    'node:crypto': require('node:crypto'), '../../../events': {},
    '../../state/OpenConflictService': { openConflictService: { listOpenConflicts: async () => [] } },
    '../director/runtime/DirectorAutomationLedgerEventService': {}, '../fact/factLedgerFilter': {}, '../fact/NovelFactService': {},
    './ChapterArtifactSyncService': {}, './ChapterQualityGateService': {},
    './chapterRuntimePackageBuilders': { buildRuntimePackage: input => ({ audit: { hasBlockingIssues: false }, styleReview: input.styleReview }) },
    './proseQuality/ProseQualityDetector': { detectProseQuality: () => ({ findings: [] }), buildProseQualityAuditReport: () => null },
  });
  const finalizer = new ChapterContentFinalizationService({ qualityGateService: { runAcceptanceGate: async () => ({
    assessment: output(), score: output().score, issues: [], auditReports: [], styleReviewReport: report,
  }) } });
  const result = await finalizer.finalizeChapterContent({ novelId: 'n', chapterId: 'c', content: '保存正文',
    contextPackage: context(), request: {}, runId: null, startMs: null, deferTerminalCommit: true });
  assert.deepEqual(result.styleReview.report, report);
  assert.equal(result.finalContent, '保存正文');
  assert.equal(result.styleReview.autoRewritten, false);
});
