const test = require('node:test');
const assert = require('node:assert/strict');
const { preparePromptExecution } = require('../dist/prompting/core/promptRunner');
const { chapterPatchRepairPrompt } = require('../dist/prompting/prompts/novel/chapterPatchRepair.prompts');
const { buildBookContractContext, buildChapterPatchRepairContextBlocks, buildChapterRepairContext, buildChapterReviewContext, buildChapterReviewContextBlocks } = require('../dist/prompting/prompts/novel/chapterLayeredContext');
function shouldAttemptAutomaticRepair(...args) {
  return require('../dist/services/novel/runtime/repair/ChapterRepairEligibility').shouldAttemptAutomaticRepair(...args);
}

function writeContext() {
  const section = { text: '文风不能丢', hasContent: true, lines: [], summary: '' };
  return {
    bookContract: buildBookContractContext({ title: '本书', hardConstraints: ['必须保留的书级规则'] }),
    macroConstraints: null, volumeWindow: null, lengthBudget: null, participants: [],
    chapterMission: { chapterId: 'c', chapterOrder: 1, title: '本章', objective: '目标'.repeat(2500), expectation: '结果', hookTarget: '钩子', mustAdvance: [], mustPreserve: [], riskNotes: [] },
    nextAction: 'write_chapter', chapterStateGoal: null, protectedSecrets: ['末尾保密约束'], payoffDirectives: [],
    characterHardFacts: [], characterBehaviorGuides: [], activeRelationStages: [], pendingCandidateGuards: [],
    openConflictSummaries: [], ledgerPendingItems: [], ledgerUrgentItems: [], ledgerOverdueItems: [],
    ledgerSummary: null, timelineContext: null, characterResourceContext: null, recentChapterSummaries: [],
    previousChapterTail: null, styleContract: Object.fromEntries(['narrative', 'character', 'language', 'rhythm', 'antiAi', 'selfCheck'].map(key => [key, section])),
    styleConstraints: [], continuationConstraints: [], ragFacts: [], completedMilestones: [], recentScenePatterns: [],
    localStateSummary: '主角在门前', openingAntiRepeatHint: '',
  };
}

test('structured AI continuation and non-patch decisions avoid unsuitable automatic patches', () => {
  assert.equal(shouldAttemptAutomaticRepair({ meta: { acceptanceStatus: 'continue_with_risk', continuePolicy: 'continue' }, audit: { hasBlockingIssues: false } }, 'light_repair'), false);
  assert.equal(shouldAttemptAutomaticRepair({ meta: { repairDirectives: [{ mode: 'rewrite' }] } }, 'light_repair'), false);
  assert.equal(shouldAttemptAutomaticRepair({ meta: { repairDirectives: [{ mode: 'manual' }] } }, 'light_repair'), false);
  assert.equal(shouldAttemptAutomaticRepair({ meta: { repairDirectives: [{ mode: 'rewrite' }] } }, 'heavy_repair'), true);
  assert.equal(shouldAttemptAutomaticRepair({ meta: { repairDirectives: [{ mode: 'patch' }, { mode: 'manual' }] } }, 'light_repair'), true);
  assert.equal(shouldAttemptAutomaticRepair({ meta: {} }, 'light_repair'), true);
});

test('deterministic integrity findings are not ignored by an AI continuation recommendation', () => {
  const meta = { acceptanceStatus: 'accepted', continuePolicy: 'continue' };
  assert.equal(shouldAttemptAutomaticRepair({ meta, audit: { hasBlockingIssues: true } }, 'light_repair'), true);
  assert.equal(shouldAttemptAutomaticRepair({ meta, timelineCheck: { status: 'failed' } }, 'light_repair'), true);
});

test('patch safety and reusable book context survive an exhausted optional budget', () => {
  const context = writeContext();
  context.bookContract.activeMilestonePayoffs = ['当前阶段兑现'];
  const blocks = buildChapterPatchRepairContextBlocks({ writeContext: context, issues: [], worldRules: ['世界规则不能丢'], allowedEditBoundaries: ['只改必要句段'], structureObligations: [], historicalIssues: [] }, '[]');
  const prepared = preparePromptExecution({ asset: chapterPatchRepairPrompt, promptInput: { novelTitle: '书', chapterTitle: '章', chapterContent: '正文', issuesJson: '[]' }, contextBlocks: blocks });
  assert.ok(prepared.context.selectedBlockIds.includes('patch_book_contract'));
  assert.ok(prepared.context.selectedBlockIds.includes('style_contract'));
  assert.ok(prepared.context.selectedBlockIds.includes('world_rules'));
  assert.ok(prepared.context.selectedBlockIds.includes('state_goal'));
  const text = prepared.messages.map(message => message.content).join('\n');
  for (const fact of ['必须保留的书级规则', '世界规则不能丢', '末尾保密约束', '当前阶段兑现', '文风不能丢']) assert.ok(text.includes(fact), fact);
  assert.ok(text.indexOf('必须保留的书级规则') < text.indexOf('章节：章'));
  assert.equal(prepared.context.summarizedBlockIds.includes('world_rules'), false);
  assert.equal(blocks.find(block => block.id === 'patch_book_contract').content.includes('当前阶段兑现'), false);
  const dynamicMilestones = blocks.find(block => block.content.includes('当前阶段兑现'));
  assert.notEqual(dynamicMilestones.reuseScope, 'book');
});

test('ledger reminders stay review context without becoming repair obligations or synthetic historical defects', () => {
  const context = writeContext();
  context.chapterMission.mustAdvance = ['本章明确的推进动作'];
  const reminder = { ledgerKey: 'future', title: '未来承诺', summary: '后续窗口', currentStatus: 'pending_payoff', evidence: [], riskSignals: [] };
  context.ledgerPendingItems = [reminder];
  context.ledgerUrgentItems = [reminder];
  context.ledgerOverdueItems = [reminder];
  const contextPackage = { canonicalState: null, openAuditIssues: [
    { reportId: 'payoff-ledger:n:c', description: '伪造的窗口问题', severity: 'medium', auditType: 'plot', code: 'payoff_missing_progress' },
    { reportId: 'actual-audit', description: '真实正文证据', severity: 'medium', auditType: 'plot', code: 'payoff_missing_progress' },
  ] };
  const repair = buildChapterRepairContext({ writeContext: context, contextPackage, issues: [] });
  const review = buildChapterReviewContext(context, contextPackage);
  for (const contract of [repair, review]) {
    assert.ok(contract.structureObligations.includes('本章明确的推进动作'));
    assert.equal(contract.structureObligations.some(value => value.includes('未来承诺')), false);
  }
  assert.equal(repair.allowedEditBoundaries.some(value => value.includes('未来承诺')), false);
  assert.deepEqual(repair.historicalIssues, ['medium/plot: 真实正文证据']);
  const ledgerBlock = buildChapterReviewContextBlocks(review).find(block => block.id === 'payoff_ledger');
  assert.ok(ledgerBlock.content.includes('未来承诺'));
  assert.equal(ledgerBlock.required, true);
  assert.equal(ledgerBlock.allowSummary, false);
});
