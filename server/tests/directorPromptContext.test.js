const test = require('node:test');
const assert = require('node:assert/strict');
const { preparePromptExecution } = require('../dist/prompting/core/promptRunner');
const { chapterPatchRepairPrompt } = require('../dist/prompting/prompts/novel/chapterPatchRepair.prompts');
const { chapterArtifactDeltaPrompt } = require('../dist/prompting/prompts/novel/chapterArtifactDelta.prompts');
const { chapterAcceptanceAssessmentPrompt } = require('../dist/prompting/prompts/novel/chapterAcceptance.prompts');
const { plannerChapterPlanPrompt } = require('../dist/prompting/prompts/planner/plannerPlan.prompts');
const { replanWindowDecisionPrompt } = require('../dist/prompting/prompts/planner/replanWindowDecision.prompts');
const { ChapterPatchRepairService } = require('../dist/services/novel/chapterPatchRepairService');
const { ReplanWindowDecisionService } = require('../dist/services/planner/ReplanWindowDecisionService');
const promptRunner = require('../dist/prompting/core/promptRunner');
const { buildBookContractContext } = require('../dist/prompting/prompts/novel/chapterLayeredContext');
const { buildChapterPatchRepairContextBlocks } = require('../dist/prompting/prompts/novel/chapterLayeredContext');
const { buildReplanAuditContext } = require('../dist/services/planner/replan/context');

function writeContext() {
  return { bookContract: buildBookContractContext({ title: '测试小说' }),
    macroConstraints: null, volumeWindow: null, lengthBudget: null, participants: [],
    chapterMission: { chapterId: 'c1', chapterOrder: 1, title: '第一章', objective: '确认暗号', expectation: '取得入口',
      hookTarget: '门后有人', mustAdvance: ['确认暗号'], mustPreserve: ['世界禁令'], riskNotes: [] },
    nextAction: 'write_chapter', chapterStateGoal: null, protectedSecrets: [], payoffDirectives: [],
    characterHardFacts: [], characterBehaviorGuides: [], activeRelationStages: [], pendingCandidateGuards: [],
    openConflictSummaries: [], ledgerPendingItems: [], ledgerUrgentItems: [], ledgerOverdueItems: [],
    ledgerSummary: null, timelineContext: null, characterResourceContext: null, recentChapterSummaries: [],
    previousChapterTail: null, styleContract: null, styleConstraints: [], continuationConstraints: [], ragFacts: [],
    completedMilestones: [], recentScenePatterns: [],
    localStateSummary: '角色站在门前', openingAntiRepeatHint: '承接上文' };
}

function context(blocks = []) {
  return { blocks, selectedBlockIds: blocks.map(b => b.id), droppedBlockIds: [], summarizedBlockIds: [], estimatedInputTokens: 0 };
}
function structuredExample(messages) {
  return String(messages.at(-1).content).split('示例：\n')[1];
}

test('chapter prompt examples keep the same JSON fields with compact serialization', () => {
  const cases = [
    [chapterArtifactDeltaPrompt, {}], [chapterAcceptanceAssessmentPrompt, {}],
    [chapterPatchRepairPrompt, {}], [plannerChapterPlanPrompt, { scopeLabel: '本章' }],
    [replanWindowDecisionPrompt, {}],
  ];
  for (const [asset, promptInput] of cases) {
    const messages = preparePromptExecution({ asset, promptInput }).messages;
    const json = structuredExample(messages);
    assert.equal(json, JSON.stringify(JSON.parse(json)), asset.id);
    if (asset.structuredOutputHint?.example) {
      assert.deepEqual(JSON.parse(json), asset.structuredOutputHint.example);
    }
  }
});

test('repair keeps each current issue once, including issues absent from the supplied issue payload', async () => {
  const previous = promptRunner.runStructuredPrompt;
  const issue = { severity: 'medium', category: 'coherence', evidence: '唯一的承接证据', fixSuggestion: '补足因果' };
  const missing = { severity: 'high', category: 'coherence', evidence: '另一条独有世界规则冲突', fixSuggestion: '保留世界禁令' };
  let rendered;
  promptRunner.runStructuredPrompt = async input => {
    rendered = input.asset.render(input.promptInput, context(input.contextBlocks)).map(m => String(m.content)).join('\n');
    return { output: { summary: '修复', patches: [{ id: 'p', targetExcerpt: '角色站在门口等待。', replacement: '角色确认暗号后进入。', reason: '补足因果', issueIds: [] }] } };
  };
  try {
    const result = await new ChapterPatchRepairService().repair({
      novelTitle: '测试小说', chapterTitle: '第一章', content: '角色站在门口等待。', issues: [issue],
      issuesJson: JSON.stringify({ issues: [issue], missingObligations: [{ kind: 'must_hit_now', summary: '必须确认暗号' }] }),
      repairContext: { writeContext: writeContext(), issues: [issue, missing], structureObligations: ['保持禁令'], worldRules: ['不能穿过封印'],
        historicalIssues: [], allowedEditBoundaries: ['只补因果'] },
    });
    assert.equal(result.content, '角色确认暗号后进入。');
    assert.equal(rendered.split('角色站在门口等待。').length - 1, 1);
    assert.equal(rendered.split('唯一的承接证据').length - 1, 1);
    assert.equal(rendered.split('另一条独有世界规则冲突').length - 1, 1);
    assert.match(rendered, /必须确认暗号/);
    assert.match(rendered, /不能穿过封印/);
  } finally { promptRunner.runStructuredPrompt = previous; }
});

test('opaque repair payloads and distinct fixes retain the supplementary issue context', () => {
  const issue = { severity: 'high', category: 'continuity', evidence: '门仍然封闭', fixSuggestion: '先验证暗号' };
  const repairContext = { writeContext: writeContext(), issues: [issue], structureObligations: [], worldRules: [],
    historicalIssues: [], allowedEditBoundaries: [] };
  for (const payload of ['自定义修文要求：保留全部约定', JSON.stringify([{ ...issue, fixSuggestion: '先找持钥者' }])]) {
    const blocks = buildChapterPatchRepairContextBlocks(repairContext, payload);
    assert.match(blocks.find(b => b.group === 'repair_issues').content, /先验证暗号/);
  }
});

test('replan retains malformed historical assessments and does not merge distinct evaluations', () => {
  const audit = buildReplanAuditContext([
    { id: 'a', chapterId: 'c1', auditType: 'plot', issues: [], legacyScoreJson: '{残留历史评估' },
    { id: 'b', chapterId: 'c1', auditType: 'plot', issues: [], legacyScoreJson: '{"riskTags":["rule"]}' },
    { id: 'c', chapterId: 'c1', auditType: 'plot', issues: [], legacyScoreJson: '{"riskTags":["reveal"]}' },
  ]);
  assert.equal(audit.reports[0].unparsedAssessment, '{残留历史评估');
  assert.equal(audit.reports[0].assessmentIndex, null);
  assert.deepEqual(audit.assessments, [{ riskTags: ['rule'] }, { riskTags: ['reveal'] }]);
  assert.deepEqual(audit.reports.map(r => r.assessmentIndex), [null, 0, 1]);
});

test('replan context shares identical assessments while keeping every report and issue', async () => {
  const previous = promptRunner.runStructuredPrompt;
  let request;
  promptRunner.runStructuredPrompt = async input => {
    request = input;
    return { output: { targetChapterOrder: 1, affectedChapterOrders: [2], triggerReason: '对齐状态',
      windowReason: '保护后续入口', repairIntent: 'state_realign', reason: '仅调整第二章', whyTheseChapters: '第二章承接第一章' } };
  };
  const assessment = { repairDirectives: [{ mode: 'patch', target: 'plot', instruction: '保留唯一的行动代价' }], riskTags: ['boundary'] };
  const reports = [1, 2].map(i => ({ id: `report-${i}`, novelId: 'book', chapterId: 'c1', auditType: i === 1 ? 'continuity' : 'plot',
    summary: '本章状态须承接', overallScore: 85, legacyScoreJson: JSON.stringify(assessment),
    issues: [{ id: `issue-${i}`, code: `code-${i}`, evidence: `独有证据${i}`, severity: 'high', description: '必须承接', fixSuggestion: '保留代价', status: 'open' }],
    createdAt: '2026-10-04', updatedAt: '2026-10-04' }));
  try {
    await new ReplanWindowDecisionService().decide({ triggerType: 'local', reason: '状态不一致', targetChapterOrder: 1,
      availableChapterOrders: [1, 2, 3], sourceIssueIds: ['issue-1'], auditReports: reports,
      ledgerSummary: null, snapshot: { bookContract: { hardConstraints: ['首尾保留'.repeat(3000)] }, narrative: { hiddenKnowledge: ['末尾秘密必须保留'] } },
      nextAction: 'replan', chapterStateGoal: { summary: '先兑现约定' }, protectedSecrets: ['不能提前揭底'] });
    const audit = JSON.parse(request.promptInput.auditReportsJson);
    assert.deepEqual(audit.assessments, [assessment]);
    assert.deepEqual(audit.reports.map(r => r.assessmentIndex), [0, 0]);
    assert.deepEqual(audit.reports.map(r => r.id), ['report-1', 'report-2']);
    assert.deepEqual(audit.reports.map(r => r.issues[0].evidence), ['独有证据1', '独有证据2']);
    const snapshot = JSON.parse(request.promptInput.canonicalStateJson);
    assert.equal(snapshot.bookContract.hardConstraints[0].length, 12000);
    assert.deepEqual(snapshot.narrative.hiddenKnowledge, ['末尾秘密必须保留']);
    assert.equal(request.promptInput.auditReportsJson.includes('保留唯一的行动代价'), true);
    assert.ok(request.promptInput.auditReportsJson.length < JSON.stringify(reports).length);
  } finally { promptRunner.runStructuredPrompt = previous; }
});
