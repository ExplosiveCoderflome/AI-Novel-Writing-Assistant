const test = require('node:test');
const assert = require('node:assert/strict');
const { z, toJSONSchema } = require('zod');
const factory = require('../dist/llm/factory');
const { HumanMessage } = require('@langchain/core/messages');
const { appendStructuredOutputHintMessages } = require('../dist/prompting/core/structuredOutputHint');
const { parseStructuredLlmRawContentDetailed, invokeStructuredLlmDetailed } = require('../dist/llm/structuredInvoke');
const { resolveStructuredOutputProfile } = require('../dist/llm/structuredOutput');
const { isRepairRefusal } = require('../dist/llm/structured');
const { STORY_MACRO_RESPONSE_SCHEMA } = require('../dist/services/novel/storyMacro/storyMacroPlanSchema');
const { storyMacroDecompositionPrompt } = require('../dist/prompting/prompts/novel/storyMacro.prompts');
const profile = resolveStructuredOutputProfile({ provider: 'ollama', model: 'fixture' });

function validMacro() {
  return {
    expansion: { expanded_premise: '合成家庭修理旧钟。', protagonist_core: '合成主角面对家人分歧。',
      conflict_engine: '修钟方法的分歧影响合作。', conflict_layers: { external: '工具短缺', internal: '害怕失败', relational: '家人意见不同' },
      mystery_box: '旧钟为何停下', emotional_line: '从误会到理解', setpiece_seeds: ['发现缺件', '共同修钟'], tone_reference: '克制叙事' },
    decomposition: { selling_point: '旧钟与家人', core_conflict: '保留旧物还是更换', main_hook: '能否共同修好',
      progression_loop: '发现问题、讨论、行动', growth_path: '学会倾听', major_payoffs: ['找到旧工具', '共同完成修理'], ending_flavor: '余韵' },
    constraints: ['只使用合成背景', '保持人物事实一致'], issues: [],
  };
}

function mockRepair(t, result) {
  const calls = [], logs = [];
  t.mock.method(console, 'info', (...args) => logs.push(args.join(' ')));
  t.mock.method(factory, 'getLLM', async () => ({ stream: async function* (messages) {
    calls.push(messages);
    yield { content: JSON.stringify(result), response_metadata: { finish_reason: 'stop' } };
  } }));
  return { calls, logs };
}

const parse = (rawContent, patch = {}) => parseStructuredLlmRawContentDetailed({
  rawContent, schema: STORY_MACRO_RESPONSE_SCHEMA, label: 'novel.story_macro.decomposition@v3',
  maxRepairAttempts: 3, strategy: 'prompt_json', profile, ...patch,
});

test('macro prompt delivers the canonical required fields and all bounds to prompt-json models', () => {
  const input = { storyInput: '合成家人修钟', projectContext: '' }, context = { blocks: [] };
  const base = storyMacroDecompositionPrompt.render(input, context);
  const messages = appendStructuredOutputHintMessages({ asset: storyMacroDecompositionPrompt, promptInput: input, context, messages: base });
  const contract = JSON.parse(messages.at(-1).content.split('：\n').at(-1));
  assert.deepEqual(contract, toJSONSchema(STORY_MACRO_RESPONSE_SCHEMA));
  assert.deepEqual(contract.required, ['expansion', 'decomposition', 'constraints', 'issues']);
  assert.equal(contract.properties.expansion.properties.expanded_premise.maxLength, 900);
  assert.equal(contract.properties.expansion.properties.setpiece_seeds.minItems, 2);
  assert.equal(contract.properties.expansion.properties.setpiece_seeds.maxItems, 3);
  assert.equal(contract.properties.constraints.minItems, 2);
  assert.equal(storyMacroDecompositionPrompt.version, 'v3');
  assert.ok(STORY_MACRO_RESPONSE_SCHEMA.safeParse(validMacro()).success);
  const advanced = appendStructuredOutputHintMessages({ asset: storyMacroDecompositionPrompt, promptInput: input, context,
    messages: [new HumanMessage('用户高级模板，JSON 结构：{"custom":"example"}')], preserveMessageLayout: true });
  assert.deepEqual(JSON.parse(advanced.at(-1).content.split('：\n').at(-1)), contract);
});

test('explicit repair refusal preserves the initial macro constraint and stops after one request', async t => {
  const initial = validMacro(); initial.expansion.setpiece_seeds.push('有效条目三', '有效条目四');
  const original = JSON.stringify(initial);
  const { calls, logs } = mockRepair(t, { repair_error: 'PRIVATE-FIXTURE-DO-NOT-LOG' });
  await assert.rejects(() => parse(original), error => {
    assert.equal(error.category, 'schema_mismatch'); assert.equal(error.retryable, false);
    assert.equal(error.diagnostics.repairFailure.kind, 'refused');
    assert.equal(error.diagnostics.repairFailure.attempt, 1);
    assert.equal(error.diagnostics.repairFailure.response.finishReason, 'stop');
    assert.match(error.message, /expansion.setpiece_seeds/); assert.match(error.message, /repair_error/);
    assert.doesNotMatch(error.message, /received undefined|PRIVATE-FIXTURE/);
    return true;
  });
  assert.equal(calls.length, 1); assert.equal(JSON.stringify(initial), original);
  assert.ok(logs.some(line => /schema_validation_failed/.test(line) && /setpiece_seeds/.test(line)));
  assert.ok(logs.some(line => /event=repair_refused/.test(line)));
  assert.ok(!logs.join('\n').includes('PRIVATE-FIXTURE'));
});

test('refusal after incomplete JSON keeps the syntax category and does not invent schema omissions', async t => {
  const { calls } = mockRepair(t, { repair_error: '无法恢复缺失内容' });
  await assert.rejects(() => parse('{"expansion":'), error => error.category === 'incomplete_json'
    && error.retryable === false && error.diagnostics.repairFailure.kind === 'refused'
    && !error.message.includes('received undefined'));
  assert.equal(calls.length, 1);
});

test('a valid business schema may intentionally contain repair_error', async t => {
  const { calls } = mockRepair(t, { repair_error: 'valid business field' });
  const result = await parse('{', { schema: z.object({ repair_error: z.string() }) });
  assert.deepEqual(result.data, { repair_error: 'valid business field' }); assert.equal(calls.length, 1);
  assert.equal(isRepairRefusal({ repair_error: '' }), false);
  assert.equal(isRepairRefusal({ repair_error: 'x', result: {} }), false);
  assert.equal(isRepairRefusal([{ repair_error: 'x' }]), false);
});

test('valid repair still passes the complete unchanged macro schema', async t => {
  const expected = validMacro(); const { calls } = mockRepair(t, expected);
  const result = await parse('{"expansion":{}}');
  assert.deepEqual(result.data, expected); assert.equal(result.repairUsed, true); assert.equal(calls.length, 1);
  assert.ok(calls[0].some(message => message.content.includes('"maxLength": 900')));
});

test('repair refusal does not reach a configured fallback model or renew the repair allowance', async t => {
  const settings = require('../dist/llm/structuredFallbackSettings');
  let generated = 0, repaired = 0;
  t.mock.method(console, 'info', () => {});
  t.mock.method(settings, 'getStructuredFallbackSettings', async () => ({ enabled: true, provider: 'deepseek', model: 'fallback-fixture', retryCount: 2 }));
  t.mock.method(factory, 'resolveLLMClientOptions', async (provider, options) => ({ provider: provider || 'ollama',
    model: options.model || 'primary-fixture', apiKey: 'offline-fixture', baseURL: 'http://127.0.0.1:1/v1',
    temperature: 0.1, requestProtocol: 'openai_compatible', structuredProfile: profile }));
  t.mock.method(factory, 'createLLMFromResolvedOptions', () => ({ stream: async function* () {
    generated++; yield { content: '{"expansion":{}}', response_metadata: { finish_reason: 'stop' } };
  } }));
  t.mock.method(factory, 'getLLM', async () => ({ stream: async function* () {
    repaired++; yield { content: '{"repair_error":"fixture"}', response_metadata: { finish_reason: 'stop' } };
  } }));
  await assert.rejects(() => invokeStructuredLlmDetailed({ provider: 'ollama', model: 'primary-fixture',
    schema: STORY_MACRO_RESPONSE_SCHEMA, label: 'offline-refusal-fallback', systemPrompt: 'Synthetic fixture',
    userPrompt: 'No external request', maxRepairAttempts: 3 }), error => error.retryable === false);
  assert.equal(generated, 1); assert.equal(repaired, 1);
});
