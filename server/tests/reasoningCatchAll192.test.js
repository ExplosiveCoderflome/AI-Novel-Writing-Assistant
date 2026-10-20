// Regression test for #192: the OpenAI-compatible catch-all branch must translate
// the disabled-thinking toggle instead of swallowing it.
// Place at: server/tests/reasoningCatchAll192.test.js
// Run via the repo pipeline (pnpm run build && pnpm run test:node) so ../dist exists.
// Fails pre-fix (modelKwargs === undefined on catch-all), passes post-fix.
const test = require('node:test'), assert = require('node:assert/strict');
const { resolveProviderReasoningBehavior } = require('../dist/llm/reasoning');

const llamacpp = { provider: 'custom', baseURL: 'http://192.168.1.10:8080/v1', model: 'qwen3:32b' };

test('#192 catch-all forwards disabled thinking as enable_thinking:false', () => {
  const off = resolveProviderReasoningBehavior({ ...llamacpp, reasoningEnabled: false });
  assert.deepEqual(off.modelKwargs, { enable_thinking: false });
  const on = resolveProviderReasoningBehavior({ ...llamacpp, reasoningEnabled: true });
  assert.equal(on.modelKwargs, undefined);
});

test('#192 regression: ollama/GLM/DeepSeek/MiniMax translations unchanged', () => {
  const ollamaOff = resolveProviderReasoningBehavior({ provider: 'ollama', baseURL: 'http://x:11434/v1', model: 'qwen3', reasoningEnabled: false });
  assert.deepEqual(ollamaOff.modelKwargs, { reasoning_effort: 'none' });
  const glmOff = resolveProviderReasoningBehavior({ provider: 'glm', baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.6', reasoningEnabled: false });
  assert.deepEqual(glmOff.modelKwargs, { thinking: { type: 'disabled' } });
  const dsOff = resolveProviderReasoningBehavior({ provider: 'deepseek', baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-reasoner', reasoningEnabled: false });
  assert.deepEqual(dsOff.modelKwargs, { thinking: { type: 'disabled' } });
  const mmOff = resolveProviderReasoningBehavior({ provider: 'minimax', baseURL: 'https://api.minimax.io/v1', model: 'minimax-m2', reasoningEnabled: false });
  assert.deepEqual(mmOff.modelKwargs, { reasoning_split: true });
});
