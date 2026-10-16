const test = require('node:test');
const assert = require('node:assert/strict');
const {loadRuntimeSource} = require('./sourceHarness.cjs');
const {prisma} = require('../../dist/db/prisma');
const factory = require('../../dist/llm/factory');
const fallback = require('../../dist/llm/structuredFallbackSettings');
const runner = require('../../dist/prompting/core/promptRunner');
const templates = require('../../dist/prompting/templates/PromptTemplateOverrideService');
const assetModule = require('../../dist/prompting/prompts/novel/chapterArtifactDelta.prompts');
const {buildChapterArtifactLedgerContext} = require('../../dist/services/novel/runtime/artifactSync/context');

function extractionService() {
  const {ChapterArtifactDeltaService} = loadRuntimeSource('ChapterArtifactDeltaService.ts', {
    '../../../db/prisma': {prisma: {
      novel: {findUnique: async () => ({title: '药铺'})},
      chapter: {findFirst: async () => ({id: 'chapter-test', order: 2, title: '开门', taskSheet: '收好钥匙'})},
      character: {findMany: async () => []}, payoffLedgerItem: {findMany: async () => []},
      characterDialogueInfluence: {findMany: async () => []},
    }},
    '../../../prompting/core/promptRunner': runner,
    '../../../prompting/prompts/novel/chapterArtifactDelta.prompts': assetModule,
    '../../rag': {}, '../../state/StateService': {stateService: {getLatestSnapshotBeforeChapter: async () => null}},
    '../../payoff/payoffLedgerShared': {},
    '../characterResource/CharacterResourceLedgerService': {characterResourceLedgerService: {listResources: async () => []}},
    '../characterMind/CharacterMindService': {}, '../characterResource/CharacterResourceStaleScanService': {},
    '../characterResource/characterResourceShared': {compactText: value => value.trim()},
    '../state/StateCommitService': {}, '../state/stateProposalSourceQuality': {},
    './artifactSync/ChapterArtifactSyncResult': {},
    './artifactSync/ChapterArtifactContentVersion': {buildChapterArtifactContentHash: value => `hash:${value}`},
    './artifactSync/context': {buildChapterArtifactLedgerContext}, './artifactSync/facts': {},
    '../characters/locations': {}, '../characters/appearances': {},
  });
  return new ChapterArtifactDeltaService();
}

const memory = assetModule.chapterArtifactDeltaOutputSchema.parse({
  summary: '青禾说"按旧约"，收好铜钥匙。',
  // A large synthetic serialization fixture, not a real chapter or token estimate.
  concreteFacts: Array.from({length: 300}, (_, index) => ({text: `第${index}号药箱的封条完整。`, category: 'revealed'})),
  stateDeltas: {}, syncPlan: {reason: '保留全部已确认事实'}, confidence: .88,
});
const encoded = JSON.stringify(memory);
const malformed = encoded.replace('说\\"按旧约\\"', '说"按旧约"');
assert.ok(encoded.length > 12000);
assert.throws(() => JSON.parse(malformed));

async function withRouteBudget(limit, verify) {
  const provider = 'custom_artifact_budget_test';
  const previousEnv = {provider: process.env.AI_NOVEL_TEXT_PROVIDER, model: process.env.AI_NOVEL_TEXT_MODEL};
  const originals = {
    route: prisma.modelRouteConfig.findUnique,
    create: factory.createLLMFromResolvedOptions, get: factory.getLLM,
    fallback: fallback.getStructuredFallbackSettings,
    template: templates.promptTemplateOverrideService.getActiveCustomTemplate,
  };
  const calls = [];
  process.env.AI_NOVEL_TEXT_PROVIDER = provider;
  process.env.AI_NOVEL_TEXT_MODEL = 'qwen3.8-flash-next-iq3_s';
  factory.setProviderSecretCache(provider, {key: 'test-only', baseURL: 'http://127.0.0.1:1/v1', reasoningEnabled: false});
  prisma.modelRouteConfig.findUnique = async () => ({provider, model: 'qwen3.8-flash-next-iq3_s', temperature: .2,
    maxTokens: limit, requestProtocol: 'openai_compatible', structuredResponseFormat: 'prompt_json'});
  fallback.getStructuredFallbackSettings = async () => ({enabled: false, retryCount: 0});
  templates.promptTemplateOverrideService.getActiveCustomTemplate = async () => null;
  factory.createLLMFromResolvedOptions = resolved => ({stream: async function* () {
    calls.push({kind: 'extract', limit: resolved.maxTokens, model: resolved.model});
    yield {content: malformed};
  }});
  factory.getLLM = async (selectedProvider, options) => {
    const resolved = await factory.resolveLLMClientOptions(selectedProvider, options);
    return {stream: async function* () {
      calls.push({kind: 'repair', limit: resolved.maxTokens, model: resolved.model});
      // Model double simulates an output-limit cut in the final numeric field.
      // The real parser/repair/strict asset checks must either recover all facts
      // or fail; no fabricated completion is accepted by the test.
      yield {content: resolved.maxTokens >= 8000 ? encoded : encoded.slice(0, encoded.lastIndexOf('.88') + 1)};
    }};
  };
  try { await verify(extractionService(), calls); }
  finally {
    prisma.modelRouteConfig.findUnique = originals.route;
    factory.createLLMFromResolvedOptions = originals.create;
    factory.getLLM = originals.get;
    fallback.getStructuredFallbackSettings = originals.fallback;
    templates.promptTemplateOverrideService.getActiveCustomTemplate = originals.template;
    factory.setProviderSecretCache(provider, null);
    for (const [key, value] of [['AI_NOVEL_TEXT_PROVIDER', previousEnv.provider], ['AI_NOVEL_TEXT_MODEL', previousEnv.model]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test('chapter memory extraction and native JSON repair inherit the route limit within the compatibility safety cap', async () => {
  await withRouteBudget(16384, async (service, calls) => {
    const result = await service.extractChapterArtifacts({novelId: 'novel-test', chapterId: 'chapter-test', content: '青禾说"按旧约"，收好铜钥匙。'});
    assert.deepEqual(calls.map(call => [call.kind, call.limit]), [['extract', 8192], ['repair', 8192]]);
    assert.ok(calls.every(call => call.model === 'qwen3.8-flash-next-iq3_s'));
    assert.deepEqual(result.output, memory);
    assert.equal(result.output.concreteFacts.at(-1).text, '第299号药箱的封条完整。');
  });
});

test('chapter memory respects a smaller configured limit and never saves an incomplete repair as valid memory', async () => {
  // 4096 is a historical provider-default sentinel in this repository.
  await withRouteBudget(2048, async (service, calls) => {
    await assert.rejects(() => service.extractChapterArtifacts({novelId: 'novel-test', chapterId: 'chapter-test', content: '待核对正文'}), /JSON/);
    assert.ok(calls.some(call => call.kind === 'repair'));
    assert.ok(calls.every(call => call.limit === 2048), JSON.stringify(calls));
  });
});
