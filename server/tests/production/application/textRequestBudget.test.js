const test = require('node:test');
const assert = require('node:assert/strict');
const { loadRuntimeSource } = require('../../novelProduction/sourceHarness.cjs');
const budget = require('../../../dist/platform/llm/retries');

function fixture() {
  const events = [];
  const noop = () => {};
  const exports = loadRuntimeSource('../../../prompting/core/promptRunner.ts', {
    './cache': { registerPromptCacheBoundary: noop },
    '../../platform/llm/retries': budget,
    '@langchain/core/messages': { HumanMessage: class { constructor(content) { this.content = content; } } },
    '../../llm/factory': { getResolvedLLMClientOptionsFromInstance: () => ({provider:'openai',model:'fixture',maxTokens:6000}), getLLM: async () => { events.push('factory'); return { stream: async () => {
      events.push('stream'); return { async *[Symbol.asyncIterator]() { yield { content: '正文' }; } };
    } }; } },
    '../../llm/structuredInvoke': { formatLivePrompt: () => '' },
    '../../llm/structuredOutput': {},
    '../../llm/usageTracking': { extractLlmTokenUsage: () => null, mergeStreamTokenUsage: () => null },
    '../../runtime/memoryTelemetry': { logMemoryUsage: noop },
    '../../services/novel/novelP0Utils': { toText: value => value || '' },
    '../../platform/llm/live/llmLiveSession': { beginLlmLiveSession: () => ({ phase: noop, observe: call => call(), delta: noop, reasoning: noop, usage: noop, complete: noop, fail: noop }) },
    '../../llm/reasoning': { ReasoningStreamCollector: class { push() { return ''; } flush() { return ''; } } },
    '../registry': { hasRegisteredPromptAsset: () => true },
    '../slots/slotResolution': { CUSTOM_SLOT_CONTEXT_GROUP: 'custom' },
    '../slots/PromptSlotOverrideService': {},
    '../templates/templateRuntime': { resolveAdvancedPromptMessages: async input => input.officialMessages },
    './contextSelection': { selectContextBlocks: () => ({ selectedBlocks: [], droppedBlocks: [], selectedBlockIds: [], droppedBlockIds: [], summarizedBlockIds: [], estimatedTokens: 1, compressionLogs: [] }) },
    './promptQualityTelemetry': { recordPromptQualityEvent: noop },
    './structuredOutputHint': { appendStructuredOutputHintMessages: input => input.messages },
  });
  return { events, ...exports, asset: { id: 'test.text', version: 'v1', mode: 'text', taskType: 'writer', render: () => [{ content: '写作' }] } };
}
for (const method of ['runTextPrompt', 'streamTextPrompt']) {
  test(`${method} reserves before its physical text request`, async () => {
    const f = fixture();
    const result = await budget.withModelRequestBudget({ remaining: () => 1, beforeRequest: async () => { f.events.push('reserve'); } },
      () => f[method]({ asset: f.asset, promptInput: {} }));
    if (method === 'streamTextPrompt') { for await (const chunk of result.stream) {} await result.complete; }
    assert.deepEqual(f.events, ['factory', 'reserve', 'stream']);
  });
  test(`${method} cannot send a request when reservation fails`, async () => {
    const f = fixture();
    await assert.rejects(budget.withModelRequestBudget({ remaining: () => 0, beforeRequest: async () => { throw new Error('no budget'); } },
      () => f[method]({ asset: f.asset, promptInput: {} })), /no budget/);
    assert.equal(f.events.includes('stream'), false);
  });
}
test('text requests without a budget context retain their existing behavior', async () => {
  const f = fixture();
  assert.equal((await f.runTextPrompt({ asset: f.asset, promptInput: {} })).output, '正文');
  assert.deepEqual(f.events, ['factory', 'stream']);
});
