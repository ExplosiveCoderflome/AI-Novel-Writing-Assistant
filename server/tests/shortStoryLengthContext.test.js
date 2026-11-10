const test = require('node:test');
const assert = require('node:assert/strict');
const { shortStoryFullAuditPrompt, shortStoryPatchRepairPrompt } = require('../dist/prompting/prompts/shortStory/shortStory.prompts');
const { shortStorySegmentWritePrompt } = require('../dist/prompting/prompts/shortStory/shortStory.prompts');
const { runStructuredPrompt, setPromptRunnerStructuredInvokerForTests } = require('../dist/prompting/core/promptRunner');
const input = {
  originalIdea: '短篇故事', understanding: '确认事实', direction: {},
  plan: { targetWordCount: 3000, segments: [{ order: 1, targetWordCount: 1400 }, { order: 2, targetWordCount: 1600 }] },
  content: '甲'.repeat(350) + '\n\n' + '乙'.repeat(350),
};

test('full-story review receives measured prose length instead of asking the model to estimate it', () => {
  const messages = shortStoryFullAuditPrompt.render(input, {});
  const payload = JSON.parse(messages[1].content);
  assert.deepEqual(payload.wordCountAssessment, { actualWordCount: 700, targetWordCount: 3000 });
  assert.equal(payload.content, input.content);
});

test('only an oversized or undersized segment needs the single prose budget correction', async () => {
  for (const [firstLength, expectedCalls] of [[1600, 2], [200, 2], [700, 1]]) {
    let calls = 0;
    setPromptRunnerStructuredInvokerForTests(async () => ({ data: {
      content: '正文'.repeat((++calls === 1 ? firstLength : 700) / 2),
      continuitySummary: '角色已获得证据并前往现场继续核对。',
    }, repairUsed: false, repairAttempts: 0 }));
    try {
      const result = await runStructuredPrompt({ asset: { ...shortStorySegmentWritePrompt, slots: undefined },
        promptInput: { ...input, segment: { order: 1, targetWordCount: 700 } } });
      assert.equal(result.output.content.length, 700);
      assert.equal(calls, expectedCalls);
      assert.equal(result.meta.invocation.semanticRetryAttempts, expectedCalls - 1);
    } finally { setPromptRunnerStructuredInvokerForTests(); }
  }
});

test('exhausted length correction preserves usable prose but full review cannot accept its measured excess', async () => {
  let calls = 0;
  setPromptRunnerStructuredInvokerForTests(async () => {
    calls++;
    return { data: { content: '正文'.repeat(800), continuitySummary: '角色已获得证据并前往现场继续核对。' }, repairUsed: false, repairAttempts: 0 };
  });
  try {
    const result = await runStructuredPrompt({ asset: { ...shortStorySegmentWritePrompt, slots: undefined },
      promptInput: { ...input, segment: { order: 1, targetWordCount: 700 } } });
    assert.equal(calls, 2);
    assert.equal(result.output.content.length, 1600);
    const reviewed = shortStoryFullAuditPrompt.postValidate({ decision: 'accepted', summary: '故事完整可交付', issues: [] },
      { ...input, plan: { ...input.plan, targetWordCount: 700 }, content: result.output.content }, {});
    assert.equal(reviewed.decision, 'patchable');
    assert.match(reviewed.issues[0].description, /1600/);
    assert.match(reviewed.issues[0].description, /700/);
  } finally { setPromptRunnerStructuredInvokerForTests(); }
});

test('repair receives actual and planned segment lengths while retaining human-edit protection', () => {
  const segments = [{ order: 1, content: '甲'.repeat(350), humanEdited: true },
    { order: 2, content: '乙'.repeat(350), humanEdited: false }];
  const messages = shortStoryPatchRepairPrompt.render({ ...input, segments, audit: { decision: 'patchable', issues: [] } }, {});
  const payload = JSON.parse(messages[1].content);
  assert.deepEqual(payload.wordCountAssessment, { actualWordCount: 700, targetWordCount: 3000,
    segments: [{ order: 1, actualWordCount: 350, targetWordCount: 1400 }, { order: 2, actualWordCount: 350, targetWordCount: 1600 }] });
  assert.deepEqual(payload.segments, segments);
});

test('one repair correction receives every out-of-range segment instead of discovering them one at a time', () => {
  assert.throws(() => shortStoryPatchRepairPrompt.postValidate({ patches: [
    { segmentOrder: 1, content: '甲'.repeat(3000) }, { segmentOrder: 2, content: '乙'.repeat(3000) },
  ], residualQualityDebt: [] }, { ...input, segments: [{ order: 1, humanEdited: false }, { order: 2, humanEdited: false }] }, {}),
  error => /第1段/.test(error.message) && /第2段/.test(error.message));
});

test('confirmed revision scope failure reaches the bounded semantic correction with its concrete reason', async () => {
  const requests = [];
  setPromptRunnerStructuredInvokerForTests(async request => {
    requests.push(request);
    return {data: {patches: requests.length === 1 ? [] : [{segmentOrder: 2, content: '乙'.repeat(1600)}], residualQualityDebt: []}, repairUsed: false, repairAttempts: 0};
  });
  try {
    const result = await runStructuredPrompt({asset: shortStoryPatchRepairPrompt, promptInput: {
      ...input, requiredSegmentOrders: [2], segments: [{order: 1, content: '甲'.repeat(1400), humanEdited: true}, {order: 2, content: '乙'.repeat(1600), humanEdited: false}],
      audit: {decision: 'patchable', summary: '调整第二段', issues: []},
    }});
    assert.equal(result.output.patches[0].segmentOrder, 2);
    assert.equal(requests.length, 2);
    assert.match(requests[1].messages.at(-1).content, /完整覆盖已确认片段 2/);
    assert.throws(() => shortStoryPatchRepairPrompt.postValidateFailureRecovery({rawOutput: {patches: [], residualQualityDebt: []}, promptInput: {requiredSegmentOrders: [2]}}), /完整覆盖/);
  } finally { setPromptRunnerStructuredInvokerForTests(); }
});
