const test = require('node:test');
const assert = require('node:assert/strict');
const { preparePromptExecution } = require('../dist/prompting/core/promptRunner');
const { createContextBlock } = require('../dist/prompting/core/contextBudget');
const { plannerChapterPlanPrompt } = require('../dist/prompting/prompts/planner/plannerPlan.prompts');
const { chapterPatchRepairPrompt } = require('../dist/prompting/prompts/novel/chapterPatchRepair.prompts');
const { replanWindowDecisionPrompt } = require('../dist/prompting/prompts/planner/replanWindowDecision.prompts');
const { getPromptCacheBoundary } = require('../dist/platform/llm/cache');

function render(asset, input, dynamic) {
  return preparePromptExecution({ asset, promptInput: input, contextBlocks: [
    createContextBlock({ id: 'task', group: 'chapter_target', priority: 100, required: true, content: dynamic }),
    createContextBlock({ id: 'book', group: 'book', priority: 90, required: true, reuseScope: 'book', content: '书级资料：事实和文风约束' }),
  ] }).messages.map(message => message.content).join('\n');
}

test('planning and patch prompts place stable schema and book context before changing chapter inputs', () => {
  for (const asset of [plannerChapterPlanPrompt, chapterPatchRepairPrompt]) {
    const first = render(asset, { scopeLabel: '第1章', novelTitle: '本书', chapterTitle: '章一', chapterContent: '正文甲', issuesJson: '["问题甲"]', modeHint: '重点甲' }, '任务甲');
    const second = render(asset, { scopeLabel: '第2章', novelTitle: '本书', chapterTitle: '章二', chapterContent: '正文乙', issuesJson: '["问题乙"]', modeHint: '重点乙' }, '任务乙');
    const end = first.indexOf('书级资料：事实和文风约束') + '书级资料：事实和文风约束'.length;
    assert.ok(end > 0);
    assert.equal(first.slice(0, end), second.slice(0, end));
    assert.ok(first.indexOf('结构化输出骨架') < end);
    assert.ok(second.includes('任务乙'));
    if (asset === chapterPatchRepairPrompt) {
      for (const value of ['正文乙', '问题乙', '重点乙', '章二']) assert.ok(second.includes(value));
    } else assert.ok(second.includes('第2章'));
  }
});

test('planning assets declare the inserted static schema boundary and patch focus retains System role', () => {
  for (const asset of [plannerChapterPlanPrompt, chapterPatchRepairPrompt, replanWindowDecisionPrompt]) {
    const prepared = preparePromptExecution({ asset, promptInput: { scopeLabel: '第1章', novelTitle: '书', chapterTitle: '章', chapterContent: '正文', issuesJson: '[]', modeHint: '重要修复重点' } });
    assert.deepEqual(getPromptCacheBoundary(prepared.messages), { messageIndex: 1, contentBlockIndex: 0 });
    if (asset === chapterPatchRepairPrompt) {
      const focusIndex = prepared.messages.findIndex(message => String(message.content).includes('重要修复重点'));
      assert.ok(focusIndex > 1);
      assert.equal(prepared.messages[focusIndex]._getType(), 'system');
    }
  }
});
