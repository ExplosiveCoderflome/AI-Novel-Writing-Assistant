const test = require('node:test');
const assert = require('node:assert/strict');
const runner = require('../dist/prompting/core/promptRunner');
const factory = require('../dist/llm/factory');
const { prisma } = require('../dist/db/prisma');
const { generateCharacterNamingCandidates } = require('../dist/services/character/naming/CharacterNamingService');
const { TitleGenerationService } = require('../dist/services/title/TitleGenerationService');
const { titleGenerationRawOutputSchema } = require('../dist/prompting/prompts/helper/titleGeneration.promptSchemas');
const { buildNamingPreviewInput } = require('../dist/prompting/workbench/namingPreviewInput');
const literary = { schemaVersion: 1, orientation: 'modern_literary' };

test('naming service validates first, invokes one bounded asset and never writes characters', async () => {
  const previous = runner.runStructuredPrompt;
  const create = prisma.baseCharacter.create;
  const update = prisma.baseCharacter.update;
  let calls = 0;
  runner.runStructuredPrompt = async input => {
    calls++;
    assert.equal(input.asset.id, 'character.naming.candidates');
    assert.equal(input.promptInput.candidateCount, 4);
    assert.equal(input.options.model, 'offline-model');
    return { output: { candidates: ['synthetic'], keepCurrentName: { recommended: false, reason: 'synthetic' } } };
  };
  prisma.baseCharacter.create = prisma.baseCharacter.update = () => { throw new Error('unexpected character write'); };
  try {
    await assert.rejects(() => generateCharacterNamingCandidates({ character: { role: '合成人物' }, candidateCount: 99 }, {}));
    assert.equal(calls, 0);
    const result = await generateCharacterNamingCandidates({ character: { role: '合成人物' } }, { model: 'offline-model' });
    assert.deepEqual(result.candidates, ['synthetic']);
    assert.equal(calls, 1);
  } finally { runner.runStructuredPrompt = previous; prisma.baseCharacter.create = create; prisma.baseCharacter.update = update; }
});

test('literary title service accepts short titles and one literary style without commercial retry', async () => {
  const previous = runner.runStructuredPrompt;
  const resolve = factory.resolveLLMClientOptions;
  const find = prisma.novel.findUnique;
  let calls = 0;
  const titles = ['潮', '潮线', '渡口', '伞铺'].map(title => ({ title, clickRate: 70, style: 'literary', angle: '家族与迁居', reason: '与合成作品的物象相连' }));
  assert.ok(titleGenerationRawOutputSchema.safeParse({ titles }).success);
  factory.resolveLLMClientOptions = async () => ({ structuredProfile: null });
  prisma.novel.findUnique = async () => ({ id: 'synthetic', title: '旧题名', description: '合成家庭迁居故事', genre: null, creativeProfileJson: JSON.stringify(literary) });
  runner.runStructuredPrompt = async input => {
    calls++;
    assert.equal(input.promptInput.creativeGuidance.keepWebSerialDefaults, false);
    return { output: { titles } };
  };
  try {
    const result = await new TitleGenerationService().generateNovelTitles('synthetic', { count: 4 });
    assert.deepEqual(result.titles.map(row => row.title), titles.map(row => row.title));
    assert.equal(calls, 1);
    runner.runStructuredPrompt = async () => { calls++; throw new Error('synthetic failure'); };
    await assert.rejects(() => new TitleGenerationService().generateTitleIdeas({ mode: 'brief', brief: '合成故事', count: 4, creativeProfile: literary }), /synthetic failure/);
    assert.equal(calls, 2, 'literary service adds no application retry');
  } finally { runner.runStructuredPrompt = previous; factory.resolveLLMClientOptions = resolve; prisma.novel.findUnique = find; }
});

test('naming workbench sample is synthetic and bounded', () => {
  const sample = buildNamingPreviewInput();
  assert.equal(sample.candidateCount, 4);
  assert.ok(sample.character.role);
});

test('registered naming asset is visible and preview works without a novel or model call', async () => {
  const { PromptWorkbenchService } = require('../dist/prompting/PromptWorkbenchService');
  const service = new PromptWorkbenchService({ novel: { findUnique: () => { throw new Error('unexpected novel read'); } }, chapter: { findFirst: () => { throw new Error('unexpected chapter read'); } } });
  const item = service.listCatalog({ keyword: 'character.naming.candidates' }).find(row => row.id === 'character.naming.candidates');
  assert.ok(item);
  assert.deepEqual(item.management.editModes, ['readonly']);
  const preview = await service.preview({ promptKey: item.key, executionContext: { entrypoint: 'manual_test' } });
  assert.match(preview.messages.map(message => message.content).join('\n'), /合成港口故事/);
});

test('actual style resolver relaxes global narration defaults while explicit style bindings win', async () => {
  const { AntiAiPolicyResolver } = require('../dist/services/styleEngine/AntiAiPolicyResolver');
  const resolver = new AntiAiPolicyResolver();
  const previous = prisma.novel.findUnique;
  const rule = { id: 'synthetic-rule', key: 'forbid-explicit-psychology', enabled: true, autoRewrite: true, type: 'forbidden', severity: 'high' };
  resolver.listGlobalBaselineRules = async () => [rule];
  prisma.novel.findUnique = async () => ({ creativeProfileJson: JSON.stringify(literary) });
  try {
    const global = await resolver.resolveFromBindings({ novelId: 'synthetic', matchedBindings: [] });
    assert.equal(global.effectiveRules[0].rule.autoRewrite, false);
    const explicit = await resolver.resolveFromBindings({ novelId: 'synthetic', matchedBindings: [{ targetType: 'novel', targetId: 'synthetic', weight: 1, priority: 1, styleProfileId: 'synthetic-style', styleProfile: { id: 'synthetic-style', name: '明确选择的写法', antiAiRules: [rule] } }] });
    assert.equal(explicit.effectiveRules[0].source, 'style_profile');
    assert.equal(explicit.effectiveRules[0].rule.autoRewrite, true);
    prisma.novel.findUnique = async () => ({ creativeProfileJson: null });
    const legacy = await resolver.resolveFromBindings({ novelId: 'synthetic', matchedBindings: [] });
    assert.equal(legacy.effectiveRules[0].rule.autoRewrite, true);
  } finally { prisma.novel.findUnique = previous; }
});
