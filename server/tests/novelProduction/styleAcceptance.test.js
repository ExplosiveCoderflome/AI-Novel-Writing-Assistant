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
    '@ai-novel/shared/types/directorIssue': require('../../../shared/dist/types/directorIssue'),
    '../../../db/prisma': { prisma: {} },
    '../director/issues/DirectorIssuePolicyService': { directorIssuePolicyService: { getNovelPolicy: async () => ({ effectivePolicy: { maxAutomaticRetries: 1, issueActions: {} } }) } },
    '../../../prompting/core/promptRunner': { runStructuredPrompt: async input => { requests.push(input); if (result instanceof Error) throw result; return { output: result }; } },
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
    layer: 'surface', canAutoRewrite: true, evidence: '终于懂得生活的真谛', fixSuggestion: '落回具体行动' }],
    styleReview: { riskScore: 65, summary: '总结腔', issueCodes: ['theme_summary'] } }));
  const result = await h.instance.assess(input(context()));
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].promptInput.styleReviewEnabled, true);
  assert.ok(h.requests[0].contextBlocks.some(block => block.group === 'style_contract' && block.required && block.allowSummary === false));
  assert.equal(result.styleReviewReport.riskScore, 65);
  assert.equal(result.styleReviewReport.violations[0].excerpt, '终于懂得生活的真谛');
  assert.equal(result.issues[0].category, 'voice');
  assert.equal(h.requests[0].options.maxTokens,4096);
});

test('repair verification has bounded output space for its complete evidence checklist',async()=>{
  const h=service(output());
  await h.instance.assess({...input(context()),repairReviewBaseline:{blockingIssues:[],missingObligations:[],repairDirectives:[]}});
  assert.equal(h.requests[0].options.maxTokens,6144);
  assert.equal(prompt.chapterAcceptanceAssessmentPrompt.semanticRetryPolicy.sharedCorrectionBudget,1);
  assert.equal(prompt.chapterAcceptanceAssessmentPrompt.fallbackRepairPolicy.maxAttempts,0);
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
    category: 'voice', severity: 'high', layer: 'surface', canAutoRewrite: true, evidence: '终于懂得生活的真谛', fixSuggestion: '改成行动' }],
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

test('book perspective takes precedence over reference style in the same acceptance call', async () => {
  const pkg = context();
  pkg.bookContract = { narrativePov: 'third_person' };
  const contract = pkg.styleContext.compiledBlocks.contract;
  contract.narrative.text = '全程采用第一人称男性限知视角。';
  const snapshot = JSON.stringify(contract);
  const h = service(output({ styleReview: { riskScore: 12, summary: '第三人称限知', issueCodes: [],
    perspectiveCheck: { observed: 'third_person', evidence: '人物经历了风雨' } } }));
  const result = await h.instance.assess(input(pkg));
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].promptInput.expectedNarrativePov, 'third_person');
  assert.match(h.requests[0].contextBlocks.find(x => x.group === 'style_contract').content, /本书设置.*优先于参考写法/);
  assert.deepEqual(result.styleReviewReport.perspectiveCheck,
    { expected: 'third_person', observed: 'third_person', evidence: '人物经历了风雨' });
  assert.equal(JSON.stringify(contract), snapshot, 'adapting a book cannot overwrite the reusable style asset');
});

test('perspective is supported by current narrative evidence and conflicts remain narrative observations', () => {
  const raw = output({ styleReview: { riskScore: 15, summary: '人称待核对', issueCodes: [], observations: [],
    perspectiveCheck: { observed: 'third_person', evidence: '周华站在门口。' } } });
  const check = (value, content = '周华站在门口。他说：“我去看看。”') =>
    prompt.chapterAcceptanceAssessmentPrompt.postValidate(value, { content, styleReviewEnabled: true, expectedNarrativePov: 'third_person' });
  assert.equal(check(raw).styleReview.perspectiveCheck.observed, 'third_person');
  assert.throws(() => check(output()), error => error.code === 'perspective_missing');
  assert.throws(() => check(raw, '另一段正文。'), error => error.code === 'perspective_evidence_invalid');
  const mismatch = output({ styleReview: { ...raw.styleReview,
    perspectiveCheck: { observed: 'first_person', evidence: '我站在门口。' } } });
  assert.throws(() => check(mismatch, '我站在门口。'), error => error.code === 'perspective_conflict_unreported');
  mismatch.styleReview.observations = [{ code: 'narrative_pov_mismatch', styleRuleId: null, layer: 'narrative',
    severity: 'medium', evidence: '我站在门口。', reason: '与本书人称设置不符', fixSuggestion: '由作者确认叙事视角' }];
  const final = check(mismatch, '我站在门口。');
  const report = acceptance.buildAcceptanceStyleReport(context(), final);
  assert.equal(report.violations[0].canAutoRewrite, false);
  assert.equal(final.repairDirectives.length, 0);
  const uncertain = output({ styleReview: { ...raw.styleReview,
    perspectiveCheck: { observed: 'uncertain', evidence: '周华站在门口。' } } });
  assert.throws(() => check(uncertain), error => error.code === 'perspective_conflict_unreported');
  uncertain.styleReview.observations = [{ ...mismatch.styleReview.observations[0], code: 'narrative_pov_uncertain',
    evidence: '周华站在门口。', reason: '不足以确认整章人称' }];
  assert.equal(check(uncertain).styleReview.perspectiveCheck.observed, 'uncertain');
});

test('historical unknown and intentionally mixed perspectives cannot acquire an invented fixed perspective', () => {
  assert.equal(acceptance.getAcceptanceNarrativePov({ bookContract: { narrativePov: 'not specified' } }), null);
  assert.equal(acceptance.getAcceptanceNarrativePov({ chapterWriteContext: { bookContract: { narrativePov: 'mixed' } } }), 'mixed');
  const final = prompt.chapterAcceptanceAssessmentPrompt.postValidate(output({ styleReview: {
    riskScore: 0, summary: '当前场景使用第一人称', issueCodes: [], observations: [],
    perspectiveCheck: { observed: 'first_person', evidence: '我推开门。' },
  } }), { content: '我推开门。', styleReviewEnabled: true, expectedNarrativePov: 'mixed' });
  assert.equal(final.styleReview.observations.length, 0);
});

test('failed style and repair verification keep distinct safe diagnostics without a second model call', async () => {
  const { ChapterStyleReviewValidationError, ChapterRepairVerificationError } = require('../../dist/prompting/prompts/novel/acceptance');
  for (const [error, code] of [
    [new ChapterStyleReviewValidationError('report_missing', '风格报告缺失。'), 'style_review_report_missing'],
    [new ChapterStyleReviewValidationError('evidence_invalid', '证据没有引用当前正文。'), 'style_review_evidence_invalid'],
    [new ChapterRepairVerificationError('invalid source'), 'repair_review_evidence_invalid'],
    [new Error('provider returned private-token-123'), 'acceptance_invocation_failed'],
  ]) {
    const h = service(error), result = await h.instance.assess(input(context()));
    assert.equal(h.requests.length, 1);
    assert.equal(result.styleReviewReport, null);
    assert.ok(result.assessment.riskTags.includes('acceptance_gate_unavailable'));
    assert.ok(result.assessment.riskTags.includes(code));
    assert.equal(result.assessment.continuePolicy, 'continue');
    assert.equal(result.assessment.score.overall, 0, 'unavailable review has no invented estimate');
    assert.equal(result.auditReports[0].overallScore, null);
    assert.deepEqual(JSON.parse(result.auditReports[0].legacyScoreJson).scoreAvailable, false);
    assert.ok(!JSON.stringify(result).includes('private-token-123'));
    assert.notEqual(result.assessment.blockingIssues[0].evidence, '章节接收闸门未返回可用结构化结果。');
  }
});

test('exhausted style citation correction preserves independent story findings without authorizing voice repair', () => {
  const asset = prompt.chapterAcceptanceAssessmentPrompt;
  const raw = output({status:'repairable', blockingIssues:[
    {code:'prop_origin',category:'continuity',severity:'high',evidence:'信封有邮戳',fixSuggestion:'保持钟内纸条来源'},
    {code:'voice',category:'voice',severity:'medium',evidence:'不存在的原句',fixSuggestion:'润色',layer:'surface',canAutoRewrite:true},
  ], repairDirectives:[{mode:'patch',target:'continuity',instruction:'修正道具来源'},
    {mode:'patch',target:'voice',instruction:'润色'}]});
  const recovered = asset.postValidateFailureRecovery({rawOutput:raw,promptInput:{content:'他取出钟内纸条。',
    styleReviewEnabled:true,expectedNarrativePov:'third_person'}});
  assert.equal(recovered.styleReview, null);
  assert.equal(recovered.styleReviewFailure.code, 'perspective_missing');
  assert.deepEqual(recovered.blockingIssues.map(i=>i.code), ['prop_origin','style_review_unavailable']);
  assert.deepEqual(recovered.repairDirectives.map(i=>i.target), ['continuity']);
  assert.equal(recovered.score.overall, 90);
  assert.equal(asset.semanticRetryPolicy.maxAttempts, 1);
  assert.throws(()=>asset.postValidateFailureRecovery({rawOutput:raw,promptInput:{content:'候选',styleReviewEnabled:true,
    repairReviewBaseline:{blockingIssues:[],missingObligations:[]}}}), /修文|核对|验证|正文/);
});

test('schema and transport failures are distinguished without storing raw provider errors', () => {
  const { StructuredOutputError } = require('../../dist/llm/structuredOutput');
  for (const category of ['schema_mismatch', 'transport_error']) {
    const error = new StructuredOutputError({ message: 'private-api-key', category, diagnostics: {} });
    const diagnostic = acceptance.describeAcceptanceFailure(error);
    assert.equal(diagnostic.code, `acceptance_${category}`);
    assert.ok(!diagnostic.message.includes('private-api-key'));
  }
});

test('model schema requires a style report field but allows null for disabled checks', () => {
  assert.equal(prompt.chapterAcceptanceModelSchema.safeParse(output({ styleReview: undefined })).success, false);
  const disabled = prompt.chapterAcceptanceModelSchema.parse(output({ styleReview: null }));
  assert.equal(prompt.chapterAcceptanceAssessmentPrompt.postValidate(disabled, {
    content: '正文', styleReviewEnabled: false,
  }).styleReview, null);
  assert.throws(() => prompt.chapterAcceptanceAssessmentPrompt.postValidate(disabled, {
    content: '正文', styleReviewEnabled: true,
  }), /缺失报告/);
});

test('cross-chapter semantic checks require quotes from both sources and preserve structured continuity conflicts', () => {
  const args={content:'他把信封递给她。',previousChapterContent:'他展开从笔记本撕下的横格纸。',styleReviewEnabled:false};
  const check={subject:'信件载体',previousFact:'横格纸',currentFact:'信封',previousEvidence:'从笔记本撕下的横格纸',currentEvidence:'信封',
    verdict:'conflict',reason:'载体变化未交代',issueCode:'carrier_changed'};
  const raw=output({continuityChecks:[check],blockingIssues:[{code:'carrier_changed',category:'continuity',severity:'medium',
    evidence:'信封',fixSuggestion:'保持前文载体并调整本章规划'}]});
  assert.equal(prompt.chapterAcceptanceAssessmentPrompt.postValidate(raw,args).continuityChecks[0].verdict,'conflict');
  for (const bad of [output(), {...raw,continuityChecks:[{...check,previousEvidence:'不存在的前文'}]},
    {...raw,blockingIssues:[]}]) {
    assert.throws(()=>prompt.chapterAcceptanceAssessmentPrompt.postValidate(bad,args), error=>error.name==='ChapterContinuityReviewValidationError');
    assert.throws(()=>prompt.chapterAcceptanceAssessmentPrompt.postValidateFailureRecovery({rawOutput:bad,promptInput:args}),
      error=>error.name==='ChapterContinuityReviewValidationError');
  }
});

test('AI refusal and narrative diagnosis retain structured observations without spending automatic repair work', async () => {
  for (const [layer, canAutoRewrite] of [['surface', false], ['narrative', true]]) {
    const h = service(output({ status: 'repairable', repairability: 'surface_fixable', continuePolicy: 'repair_once',
      blockingIssues: [{ code: 'writing', category: 'voice', severity: 'high', layer, canAutoRewrite,
        evidence: '终于懂得生活的真谛', fixSuggestion: '检查主题表达' }],
      repairDirectives: [{ mode: 'patch', target: 'voice', instruction: '检查主题表达' }],
      styleReview: { riskScore: 65, summary: '写法提醒', issueCodes: ['writing'], observations: [] } }));
    const result = await h.instance.assess(input(context()));
    assert.equal(result.assessment.continuePolicy, 'continue');
    assert.equal(result.assessment.blockingIssues.length, 0);
    assert.equal(result.assessment.styleReview.observations[0].layer, layer);
    assert.equal(result.styleReviewReport.violations[0].canAutoRewrite, false);
  }
});

test('mixed surface and narrative review retains both diagnoses but authorizes only expression patch', () => {
  const assessment = output({ blockingIssues: ['surface', 'narrative'].map(layer => ({ code: layer, category: 'voice',
    layer, canAutoRewrite: true, severity: 'medium', evidence: '终于懂得生活的真谛', fixSuggestion: '调整表达' })),
    repairDirectives: [{ mode: 'patch', target: 'voice', instruction: '调整表达' }],
    styleReview: { riskScore: 60, summary: '混合风险', issueCodes: ['surface', 'narrative'], observations: [] } });
  const report = acceptance.buildAcceptanceStyleReport(context(), assessment);
  const filtered = acceptance.applyAcceptanceStyleRepairPolicy(context(), assessment);
  assert.deepEqual(report.violations.map(item => item.canAutoRewrite), [true, false]);
  assert.deepEqual(filtered.blockingIssues.map(item => item.code), ['surface']);
  assert.equal(filtered.styleReview.observations[0].code, 'narrative');
});

test('observations must quote the current text and cannot invent an enabled rule', () => {
  const base = output({ styleReview: { riskScore: 20, summary: '提醒', issueCodes: [], observations: [{
    code: 'report', layer: 'narrative', styleRuleId: null, severity: 'low', evidence: '虚构原句',
    reason: '主题过满', fixSuggestion: '让 AI 提供主题表达建议' }] } });
  assert.throws(() => prompt.chapterAcceptanceAssessmentPrompt.postValidate(base,
    { content: '人物走出院子。', styleReviewEnabled: true }), /原文|证据|正文/);
});
test('style report codes must reference actual voice issues in the same assessment', () => {
  const { validateAcceptanceStyleReview } = require('../../dist/prompting/prompts/novel/acceptance');
  assert.throws(() => validateAcceptanceStyleReview(output({
    styleReview: { riskScore: 60, summary: '风险', issueCodes: ['invented'] },
  }), { content: '正文', styleReviewEnabled: true }), /写法|style/);
});

test('model supplies style issues once and runtime generates references without inventing permissions', () => {
  const raw = prompt.chapterAcceptanceModelSchema.parse(output({ blockingIssues: [{
    code: 'voice-1', category: 'voice', severity: 'medium', layer: 'narrative', canAutoRewrite: false,
    styleRuleId: 'psychology', evidence: '人物终于懂得生活的真谛。', fixSuggestion: '先评估人物变化的依据',
  }], styleReview: { riskScore: 60, summary: '叙事提醒', issueCodes: ['wrong-copy'], observations: [] } }));
  assert.equal(raw.styleReview.issueCodes, undefined);
  const final = prompt.chapterAcceptanceAssessmentPrompt.postValidate(raw, {
    content: '人物终于懂得生活的真谛。', styleReviewEnabled: true, styleRuleIds: ['psychology'],
  });
  assert.deepEqual(final.styleReview.issueCodes, ['voice-1']);
  const governed = acceptance.applyAcceptanceStyleRepairPolicy(context(), final);
  assert.deepEqual(governed.styleReview.issueCodes, []);
  assert.equal(governed.styleReview.observations[0].layer, 'narrative');
});

test('semantic style detection still evaluates prose without any literal forbidden token', async () => {
  const pkg = context();
  const rule = { id: 'psychology', name: '禁止解释心理', type: 'forbidden', severity: 'high', enabled: true,
    autoRewrite: true, detectPatterns: ['他意识到'], promptInstruction: '不要解释心理' };
  const { StyleDetectionService } = loadRuntimeSource('../../styleEngine/StyleDetectionService.ts', {
    '../../prompting/core/promptRunner': { runStructuredPrompt: async () => ({ output: {
      riskScore: 60, summary: '语义上仍有总结腔', violations: [{ ruleId: 'psychology', ruleName: rule.name,
        ruleType: 'forbidden', severity: 'high', excerpt: '终于懂得生活的真谛', reason: '总结心理',
        layer: 'surface', suggestion: '改成行动', canAutoRewrite: true }], canAutoRewrite: true } }) },
    '../../prompting/prompts/style/style.prompts': { styleDetectionPrompt: {} },
    '@ai-novel/shared/types/styleEngine': require('../../../shared/dist/types/styleEngine.js'),
    './styleContractText': require('../../dist/services/styleEngine/styleContractText'),
    './StyleRuntimeResolver': { StyleRuntimeResolver: class { async resolve() { return { context: pkg.styleContext, antiAiRules: [rule] }; } } },
    './antiAiPreviewRules': { listPreviewAntiAiRules: async () => [], mergeAntiAiRules: rules => rules,
      buildAntiAiRuleCatalogText: () => '规则目录', buildAntiAiRuleDirectiveText: () => '' },
    './signals': require('../../dist/services/styleEngine/signals'),
  });
  const report = await new StyleDetectionService().check({ content: '终于懂得生活的真谛' });
  assert.equal(report.riskScore, 60);
  assert.equal(report.violations[0].ruleId, 'psychology');
});

test('snapshotted mechanical evidence joins the existing acceptance without modifying AI risk score', async () => {
  const pkg = context();
  pkg.styleSignalPolicy = require('../../../shared/dist/types/styleEngine.js').createStyleSignalPolicy();
  const h = service(output());
  const result = await h.instance.assess({ ...input(pkg), content: '不可否认。不可否认。' });
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].promptInput.styleSignals.findings.length, 1);
  assert.equal(result.styleReviewReport.riskScore, 0);
  assert.equal(result.styleReviewReport.violations.length, 0);
  assert.equal(result.styleSignalScan.findings.length, 1);
  const empty = await h.instance.assess({ ...input(pkg), content: '他推开门。' });
  assert.equal(h.requests.length, 2, 'zero signals still require semantic assessment');
  assert.equal(empty.styleSignalScan.findings.length, 0);
  const legacy = await h.instance.assess(input(context()));
  assert.equal(legacy.styleSignalScan, undefined, 'historical missing snapshot does not activate scanning');
});

test('AI failure retains candidate statistics but never fabricates a passed style diagnosis', async () => {
  const pkg = context();
  pkg.styleSignalPolicy = require('../../../shared/dist/types/styleEngine.js').createStyleSignalPolicy();
  const h = service(new Error('model unavailable'));
  const result = await h.instance.assess({ ...input(pkg), content: '不可否认。不可否认。' });
  assert.equal(h.requests.length, 1);
  assert.equal(result.styleReviewReport, null);
  assert.equal(result.styleSignalScan.findings.length, 1);
  assert.ok(result.assessment.riskTags.includes('acceptance_gate_unavailable'));
});

test('finalization stores the unified acceptance style report without a second rewriting pass', async () => {
  const report = { riskScore: 0, summary: '检查通过', violations: [], canAutoRewrite: false, appliedRuleIds: ['psychology'] };
  const { ChapterContentFinalizationService } = loadRuntimeSource('ChapterContentFinalizationService.ts', {
    'node:crypto': require('node:crypto'), '../../../events/publisher': {},
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
