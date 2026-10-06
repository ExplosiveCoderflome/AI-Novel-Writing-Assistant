const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReplanStateContext } = require('../dist/services/planner/replan/context');
const { preparePromptExecution } = require('../dist/prompting/core/promptRunner');
const { replanWindowDecisionPrompt } = require('../dist/prompting/prompts/planner/replanWindowDecision.prompts');
const { createContextBlock } = require('../dist/prompting/core/contextBudget');

test('replan projection preserves complete facts and list membership, deduplicating only identical payoff records', () => {
  const pending = { id: 'same', summary: '保密约束'.repeat(1200), updatedAt: 'today' };
  const different = { ...pending, summary: '同 ID 的不同事实版本' };
  const snapshot = {
    novelId: 'book', sourceSnapshotId: 's1', createdAt: 'now', scope: 'book',
    bookContract: { title: '书', secret: '必须保留的书级秘密' },
    worldState: { name: '世界', rules: ['规则'], currentSituation: '当前处境' },
    characters: [{ name: '人物', knowledge: ['最后一项事实'] }], timeline: [{ summary: '时间线' }],
    narrative: { openConflicts: [{ summary: '冲突' }], pendingPayoffs: [pending, different], urgentPayoffs: [pending], overduePayoffs: [different], hiddenFacts: ['末尾秘密'] },
  };
  const before = JSON.stringify(snapshot);
  const { stableJson, dynamicJson } = buildReplanStateContext(snapshot);
  const stable = JSON.parse(stableJson), dynamic = JSON.parse(dynamicJson);
  assert.deepEqual(stable, { bookContract: snapshot.bookContract, worldState: { name: '世界', rules: ['规则'] } });
  assert.equal(dynamic.worldState.currentSituation, '当前处境');
  const { payoffStates, pendingPayoffs, urgentPayoffs, overduePayoffs, ...otherNarrative } = dynamic.narrative;
  assert.equal(payoffStates.length, 2);
  assert.deepEqual(pendingPayoffs.map(index => payoffStates[index]), snapshot.narrative.pendingPayoffs);
  assert.deepEqual(urgentPayoffs.map(index => payoffStates[index]), snapshot.narrative.urgentPayoffs);
  assert.deepEqual(overduePayoffs.map(index => payoffStates[index]), snapshot.narrative.overduePayoffs);
  assert.deepEqual(otherNarrative, { openConflicts: snapshot.narrative.openConflicts, hiddenFacts: ['末尾秘密'] });
  assert.deepEqual(dynamic.characters, snapshot.characters);
  assert.deepEqual(dynamic.timeline, snapshot.timeline);
  assert.equal(dynamic.createdAt, 'now');
  const restored = {
    ...dynamic, bookContract: stable.bookContract,
    worldState: { ...stable.worldState, ...dynamic.worldState },
    narrative: {
      ...otherNarrative,
      pendingPayoffs: pendingPayoffs.map(index => payoffStates[index]),
      urgentPayoffs: urgentPayoffs.map(index => payoffStates[index]),
      overduePayoffs: overduePayoffs.map(index => payoffStates[index]),
    },
  };
  assert.deepEqual(restored, snapshot);
  assert.equal(before, JSON.stringify(snapshot));
  assert.ok(stableJson.length + dynamicJson.length < before.length);
});

test('replan baseline is refreshed on each call; absent snapshots remain null', () => {
  assert.deepEqual(buildReplanStateContext(null), { stableJson: 'null', dynamicJson: 'null' });
  const first = buildReplanStateContext({ bookContract: { title: '旧书名' }, worldState: { rules: ['旧规则'] } });
  const second = buildReplanStateContext({ bookContract: { title: '新书名' }, worldState: { rules: ['新规则'] } });
  assert.ok(second.stableJson.includes('新规则'));
  assert.notEqual(first.stableJson, second.stableJson);
});

test('replan accounts for complete required state even above the optional context budget', () => {
  const input = { triggerType: 'audit', reason: '原因', targetChapterOrder: 3, requestedWindowSize: 3, availableChapterOrdersJson: '[3,4]', sourceIssueIdsJson: '[]', auditReportsJson: 'null', payoffSummaryJson: 'null', canonicalStateJson: 'null', nextAction: 'none', chapterStateGoalJson: 'null', protectedSecretsJson: 'null' };
  const blocks = [
    createContextBlock({ id: 'canonical_baseline', group: 'canonical_baseline', reuseScope: 'book', priority: 100, required: true, allowSummary: false, content: '【书级状态基线】\n书级事实' }),
    createContextBlock({ id: 'canonical_state', group: 'canonical_state', priority: 99, required: true, allowSummary: false, content: '【canonical state】\n' + '重要人物事实'.repeat(3000) + '末尾秘密' }),
  ];
  const prepared = preparePromptExecution({ asset: replanWindowDecisionPrompt, promptInput: input, contextBlocks: blocks });
  assert.ok(prepared.context.estimatedInputTokens > replanWindowDecisionPrompt.contextPolicy.maxTokensBudget);
  assert.deepEqual(prepared.context.droppedBlockIds, []);
  assert.deepEqual(prepared.context.summarizedBlockIds, []);
  const text = prepared.messages.map(message => message.content).join('\n');
  assert.ok(text.includes('末尾秘密'));
  assert.ok(text.indexOf('书级事实') < text.indexOf('用户/系统原因'));
});

test('replan service supplies lossless required context in one model invocation', async () => {
  const runner = require('../dist/prompting/core/promptRunner');
  const original = runner.runStructuredPrompt;
  let captured;
  let calls = 0;
  runner.runStructuredPrompt = async input => {
    captured = input;
    calls++;
    return { output: { recommended: false, triggerReason: '保持当前计划', windowReason: '无需重规划', whyTheseChapters: '沿用当前章节', anchorChapterOrder: 3, affectedChapterOrders: [3], blockingIssueIds: [], blockingLedgerKeys: [], repairIntent: 'patch_repair', confidence: 0.9 } };
  };
  try {
    const { ReplanWindowDecisionService } = require('../dist/services/planner/ReplanWindowDecisionService');
    await new ReplanWindowDecisionService().decide({ triggerType: 'audit', reason: '问题', targetChapterOrder: 3, availableChapterOrders: [3, 4], sourceIssueIds: [], auditReports: [], ledgerSummary: null, snapshot: null, nextAction: null, chapterStateGoal: { objective: '章节义务' }, protectedSecrets: ['保密约束'.repeat(3000) + '尾部秘密'] });
    assert.equal(calls, 1);
    assert.ok(captured.contextBlocks.every(block => block.required && !block.allowSummary));
    const prepared = preparePromptExecution(captured);
    assert.ok(prepared.context.estimatedInputTokens > 0);
    const text = prepared.messages.map(message => message.content).join('\n');
    assert.ok(text.includes('章节义务'));
    assert.ok(text.includes('尾部秘密'));
    assert.deepEqual(prepared.context.summarizedBlockIds, []);
    assert.deepEqual(prepared.context.droppedBlockIds, []);
  } finally { runner.runStructuredPrompt = original; }
});
