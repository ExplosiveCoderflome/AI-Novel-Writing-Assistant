const fs = require('node:fs');
const path = require('node:path');
const serverRoot = path.resolve(__dirname, '../..');
require(path.join(serverRoot, 'node_modules/dotenv')).config({ path: path.join(serverRoot, '.env'), quiet: true });
process.env.LLM_DEBUG_LOG = 'false';
process.env.LLM_DEBUG_FILE_LOG = 'false';
process.env.NODE_ENV = 'test';

const fromDist = name => require(path.join(serverRoot, 'dist', name));
const { prisma } = fromDist('db/prisma');
const { secretStore } = fromDist('services/settings/secretStore');
const { getLLMSelectionSettings } = fromDist('services/settings/LLMSelectionSettingsService');
const { runStructuredPrompt } = fromDist('prompting/core/promptRunner');
const { runWithInvocationUsageObserver } = fromDist('platform/llm/usage');
const { createContextBlock } = fromDist('prompting/core/contextBudget');
const { styleDetectionPrompt, styleRewritePrompt } = fromDist('prompting/prompts/style/style.prompts');
const { chapterAcceptanceAssessmentPrompt, ChapterRepairVerificationError } = fromDist('prompting/prompts/novel/chapterAcceptance.prompts');
const { StyleRewriteService } = fromDist('services/styleEngine/StyleRewriteService');
const { StyleCompiler } = fromDist('services/styleEngine/StyleCompiler');
const { listPreviewAntiAiRules, buildAntiAiRuleCatalogText } = fromDist('services/styleEngine/antiAiPreviewRules');
const { buildFullStyleContractText, buildStyleContractMetaText } = fromDist('services/styleEngine/styleContractText');
const { scanStyleSignals } = fromDist('services/styleEngine/signals');
const { guardStylePatches } = fromDist('services/styleEngine/rewrite');
const { applyAcceptanceStyleContext, applyAcceptanceStyleRepairPolicy, buildAcceptanceStyleReport } = fromDist('services/novel/runtime/acceptance');
const { createStyleSignalPolicy, isStyleIssueRewritable } = require(path.join(serverRoot, '../shared/dist/types/styleEngine.js'));
const { cases, factCases, factOriginal } = require('./fixtures.cjs');

function option(key, fallback) {
  const at = process.argv.indexOf(key);
  return at >= 0 ? process.argv[at + 1] : fallback;
}
const phase = option('--phase', 'detection');
const repeats = Number(option('--repeats', '2'));
const caseId = option('--case', '');
const signalMode = option('--signals', 'on');
if (!['detection', 'acceptance', 'rewrite', 'facts', 'all'].includes(phase) || !Number.isInteger(repeats) || repeats < 1 || repeats > 3 || !['on', 'off'].includes(signalMode)) {
  throw new Error('Use --phase detection|acceptance|rewrite|facts|all, --repeats 1..3, --signals on|off, and optional --case fixture-id.');
}
const resultPath = path.resolve(option('--out', path.join(serverRoot, '../.logs/style-review-eval', `${new Date().toISOString().replace(/[:.]/g, '-')}-${phase}.json`)));
const report = { startedAt: new Date().toISOString(), phase, signalMode, sampleSource: 'original-synthetic-fiction',
  scope: 'registered prompts, real API, protection contracts; no user chapter writes', results: [] };
const secrets = [];
const redact = value => secrets.reduce((text, secret) => text.split(secret).join('[redacted]'), String(value));
const save = () => {
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, JSON.stringify(report, null, 2) + '\n');
};
async function measured(id, execute, expected = 'allow') {
  const row = { id, expected, invocations: [], startedAt: new Date().toISOString() };
  const start = Date.now();
  try {
    row.result = await runWithInvocationUsageObserver(record => {
      row.invocations.push({ provider: record.provider, model: record.model, promptId: record.promptId,
        promptVersion: record.promptVersion, status: record.status, usage: record.usage,
        durationMs: record.finishedAt - record.startedAt });
    }, () => execute(row));
    row.status = 'completed';
  } catch (error) {
    row.status = error instanceof ChapterRepairVerificationError ? 'blocked' : 'failed';
    row.error = { name: error.name, message: redact(error.message) };
  }
  row.latencyMs = Date.now() - start;
  row.evaluationPassed = expected === 'block' ? row.status === 'blocked' : row.status === 'completed';
  report.results.push(row);
  save();
  console.log(JSON.stringify({ id, expected, status: row.status, evaluationPassed: row.evaluationPassed, latencyMs: row.latencyMs,
    invocations: row.invocations.length, ...(row.error ? { error: row.error } : {}),
    ...(row.result?.summary ? { summary: row.result.summary } : {}) }));
  return row;
}

async function main() {
  const providers = await secretStore.listProviders({ onlyActive: true });
  secrets.push(...providers.map(item => item.key).filter(Boolean));
  const selection = await getLLMSelectionSettings();
  if (!selection) throw new Error('Save a current model selection in project settings first.');
  const options = { provider: selection.provider, model: selection.model, temperature: 0.2,
    maxTokens: 6000, timeoutMs: 90000, entrypoint: 'style_review_synthetic_evaluation' };
  report.model = { provider: selection.provider, model: selection.model };
  report.promptVersions = { detection: styleDetectionPrompt.version, acceptance: chapterAcceptanceAssessmentPrompt.version, rewrite: styleRewritePrompt.version };
  report.options = { temperature: 0.2, maxTokens: 6000, timeoutMs: 90000, repeats };
  const ruleRows = await prisma.antiAiRule.findMany({ where: { enabled: true, globalBaselineEnabled: true }, select: { id: true } });
  const ruleIds = ruleRows.map(item => item.id);
  if (!ruleIds.length) throw new Error('No enabled global style rules to evaluate.');
  const rules = await listPreviewAntiAiRules(ruleIds);
  // Ephemeral fixture contract; never creates or updates a style binding.
  const compiledBlocks = new StyleCompiler().compile({ styleProfile: {
    narrativeRules: { summary: '第三人称，保持事件因果与人物动机，有功能的对白重复可以保留。' },
    characterRules: { summary: '保留人物口吻，心理与关系变化须有场景依据。' },
    languageRules: { summary: '叙述克制，准确呈现动作和细节，保留必要信息与题材修辞。' },
    rhythmRules: { summary: '允许长短句变化，以场景推进为主，不为整齐而改段落。' },
  }, antiAiRules: rules, appliedRuleIds: ruleIds, globalAntiAiRuleIds: ruleIds, usesGlobalAntiAiBaseline: true });
  report.ruleSnapshot = rules.map(({ id, name, type, severity, autoRewrite, promptInstruction, description }) =>
    ({ id, name, type, severity, autoRewrite, promptInstruction, description }));
  report.signalPolicy = createStyleSignalPolicy();
  const selected = cases.filter(item => !caseId || item.id === caseId);
  if (caseId && !selected.length && !factCases.some(item => item.id === caseId)) throw new Error('Unknown fixture id.');
  save();

  if (phase === 'detection' || phase === 'all') {
    for (const sample of selected) for (let round = 1; round <= repeats; round++) {
      await measured(`detect:${sample.id}:${round}`, async row => {
        const scan = scanStyleSignals(sample.text, report.signalPolicy);
        const asset = { ...styleDetectionPrompt, postValidate(output, input, renderContext) {
          row.rawDiagnosis = output;
          return styleDetectionPrompt.postValidate(output, input, renderContext);
        } };
        const { output, meta } = await runStructuredPrompt({ asset, options,
          promptInput: { content: sample.text, allowedRuleIds: ruleIds,
            styleContractText: buildFullStyleContractText(compiledBlocks.contract),
            styleContractMetaText: buildStyleContractMetaText(compiledBlocks.contract),
            antiRuleCatalogText: buildAntiAiRuleCatalogText(rules), ...(signalMode === 'on' ? { styleSignals: scan } : {}) } });
        const eligible = output.violations.filter(issue => isStyleIssueRewritable(issue,
          rules.find(rule => rule.id === issue.ruleId || rule.name === issue.ruleName)?.autoRewrite !== false));
        return { kind: sample.kind, expectedLayer: sample.expectedLayer, sourceCharacters: Array.from(sample.text).length,
          source: sample.text, signalScan: scan, report: output, eligibleIssueCount: eligible.length,
          meta, summary: `risk=${output.riskScore}, issues=${output.violations.length}, eligible=${eligible.length}` };
      });
    }
  }
  if (phase === 'acceptance' || phase === 'all') {
    const context = { styleContext: { compiledBlocks }, postGenerationStyleReviewEnabled: true };
    const contextBlocks = applyAcceptanceStyleContext(context, [
      createContextBlock({ id: 'chapter_mission', group: 'chapter_mission', required: true, priority: 100,
        content: '验收这段已完成场景，不要求新增场景或填充篇幅；核对场景内人物选择与信息推进。' }),
      createContextBlock({ id: 'reader_experience', group: 'reader_experience', required: true, priority: 100,
        content: '保留人物口吻与有效留白，不为制造额外刺激扩大修文。' }),
      createContextBlock({ id: 'obligation_contract', group: 'obligation_contract', required: true, priority: 98,
        content: '不得改变现有角色、时间、数量、物件归属、事件因果与结果。这里只检查已有正文，没有必须新增的动作或回报。' }),
    ]);
    for (const sample of selected) for (let round = 1; round <= repeats; round++) {
      await measured(`acceptance:${sample.id}:${round}`, async row => {
        const asset = { ...chapterAcceptanceAssessmentPrompt, postValidate(output, input, renderContext) {
          row.rawAssessment = output;
          return chapterAcceptanceAssessmentPrompt.postValidate(output, input, renderContext);
        } };
        const { output, meta } = await runStructuredPrompt({ asset, options, contextBlocks,
          promptInput: { novelTitle: '合成表达验收测试', chapterOrder: 1, chapterTitle: sample.id,
            content: sample.text, styleReviewEnabled: true, styleRuleIds: ruleIds,
            ...(signalMode === 'on' ? { styleSignals: scanStyleSignals(sample.text, report.signalPolicy) } : {}) } });
        const assessment = applyAcceptanceStyleRepairPolicy(context, output);
        const styleReport = buildAcceptanceStyleReport(context, assessment);
        return { kind: sample.kind, expectedLayer: sample.expectedLayer, assessment, styleReport, meta,
          source: sample.text, summary: `status=${assessment.status}, risk=${styleReport?.riskScore}, eligible=${styleReport?.violations.filter(x => x.canAutoRewrite).length}` };
      });
    }
  }
  if (phase === 'rewrite' || phase === 'all') {
    for (const sample of selected.filter(item => ['problem-surface', 'normal-realism'].includes(item.id))) {
      await measured(`manual-rewrite:${sample.id}`, async () => {
        const result = await new StyleRewriteService().rewrite({ content: sample.text, previewAntiAiRuleIds: ruleIds,
          issues: [], provider: selection.provider, model: selection.model, temperature: 0.35 });
        return { source: sample.text, ...result, retainedOriginal: result.content === sample.text,
          summary: result.content === sample.text ? 'retained original' : 'candidate preview created; semantic facts remain unchecked' };
      });
    }
  }
  if (phase === 'facts' || phase === 'all') {
    for (const sample of factCases.filter(item => !caseId || item.id === caseId)) {
      await measured(`fact-verification:${sample.id}`, async row => {
        const guarded = guardStylePatches({ original: factOriginal, protectedTerms: ['林舟', '顾遥'],
          allowedIssueIds: ['style:1'], styleIssueIds: ['style:1'], plan: { strategy: 'patch_first',
            summary: '核对受控表达补丁', requiresFullRewrite: false, patches: [{ id: 'p1', issueIds: ['style:1'],
              targetExcerpt: sample.target, replacement: sample.replacement, reason: '合成事实边界评测' }] } });
        row.controlledCandidate = { expected: sample.expect, original: factOriginal, content: guarded.content, guard: guarded.guard };
        if (guarded.content === factOriginal) throw new Error('Controlled candidate must pass deterministic anchors before semantic evaluation.');
        const context = { styleContext: { compiledBlocks }, postGenerationStyleReviewEnabled: true };
        const contextBlocks = applyAcceptanceStyleContext(context, [
          createContextBlock({ id: 'chapter_mission', group: 'chapter_mission', required: true, priority: 100,
            content: '这是已完成场景的短片段验收，不要求增加篇幅或新场景。保留账册交接状态、铜钱数量、欠租与钥匙归属。' }),
          createContextBlock({ id: 'reader_experience', group: 'reader_experience', required: true, priority: 100,
            content: '以明确动作保留克制的人物关系，不要求增加钩子或额外冲突。' }),
          createContextBlock({ id: 'obligation_contract', group: 'obligation_contract', required: true, priority: 98,
            content: '权威已知事实：林舟未向顾遥交出账册；21:30，3枚铜钱在抽屉；欠租1200元；顾遥关门，钥匙由顾遥持有。不可交换账册行为主体和对象。' }),
        ]);
        const asset = { ...chapterAcceptanceAssessmentPrompt, postValidate(output, input, renderContext) {
          row.rawAssessment = output;
          return chapterAcceptanceAssessmentPrompt.postValidate(output, input, renderContext);
        } };
        const { output, meta } = await runStructuredPrompt({ asset, options, contextBlocks,
          promptInput: { novelTitle: '合成事实边界测试', chapterOrder: 1, chapterTitle: '柜台前', content: guarded.content,
            styleReviewEnabled: true, styleRuleIds: ruleIds, styleRewriteBaseline: guarded.baseline,
            repairReviewBaseline: { blockingIssues: [], missingObligations: [], repairDirectives: [] } } });
        return { expected: sample.expect, outcome: 'allowed', assessment: output, meta,
          summary: `factPreservation=${output.repairVerification?.factPreservation?.status}` };
      }, sample.expect);
    }
  }
  report.finishedAt = new Date().toISOString();
  report.evaluationPassed = report.results.length > 0 && report.results.every(row => row.evaluationPassed);
  if (!report.evaluationPassed) process.exitCode = 1;
  report.invocationCount = report.results.reduce((sum, row) => sum + row.invocations.length, 0);
  report.tokenUsage = report.results.flatMap(row => row.invocations).reduce((sum, call) => ({
    promptTokens: sum.promptTokens + (call.usage?.promptTokens ?? 0),
    completionTokens: sum.completionTokens + (call.usage?.completionTokens ?? 0),
    totalTokens: sum.totalTokens + (call.usage?.totalTokens ?? 0),
    missingUsage: sum.missingUsage + Number(!call.usage),
  }), { promptTokens: 0, completionTokens: 0, totalTokens: 0, missingUsage: 0 });
  save();
  console.log(JSON.stringify({ resultPath, invocationCount: report.invocationCount, usage: report.tokenUsage }));
}
main().catch(error => { console.error(redact(error.message)); process.exitCode = 1; }).finally(() => prisma.$disconnect());
