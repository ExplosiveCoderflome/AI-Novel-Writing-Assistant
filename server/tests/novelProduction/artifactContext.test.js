const test = require('node:test');
const assert = require('node:assert/strict');
const {loadRuntimeSource} = require('./sourceHarness.cjs');
const {buildChapterArtifactLedgerContext} = loadRuntimeSource('artifactSync/context/ChapterArtifactLedgerContext.ts', {});

const characters = [
  {id: 'b', name: '乙', role: '配角', castRole: null, currentGoal: '守门', currentState: '知晓门锁'},
  {id: 'a', name: '甲', role: '主角', castRole: 'lead', currentGoal: '潜入', currentState: '肩部受伤'},
];
const resources = [{
  resourceKey: 'door_key', name: '铜钥匙', resourceType: 'item', narrativeFunction: 'access',
  ownerType: 'faction', ownerId: 'guard', ownerName: '守卫营', holderCharacterId: 'a', holderCharacterName: '甲',
  status: 'available', readerKnows: false, holderKnows: false, knownByCharacterIds: ['b', 'a'],
  expectedUseStartChapterOrder: 4, expectedUseEndChapterOrder: 6,
  constraints: ['只能开启后门', '损坏后不可用'], riskSignals: [{code: 'misuse', severity: 'high', summary: '持有者误认用途'}],
  summary: '只凭钥匙不能越过守卫', updatedAt: 'yesterday',
}, {
  resourceKey: 'coin', name: '铜钱', resourceType: 'item', narrativeFunction: 'cost',
  ownerType: 'character', ownerCharacterId: 'a', ownerName: '甲', holderCharacterId: 'a', holderCharacterName: '甲',
  status: 'available', readerKnows: true, holderKnows: true, knownByCharacterIds: [], constraints: [], riskSignals: [], summary: '路费',
}];
const payoffs = [{ledgerKey: 'door_clue', title: '后门线索', currentStatus: 'hinted', summary: '守卫知道门锁已换', targetStartChapterOrder: 4, targetEndChapterOrder: 6, lastTouchedChapterOrder: 2}];
const build = overrides => buildChapterArtifactLedgerContext({characters, resources, payoffs, ...overrides});

test('stable catalogs ignore update order and volatile goals, holders, status and timestamps', () => {
  const before = build();
  const after = build({
    characters: [...characters].reverse().map(c => ({...c, currentGoal: '撤退', currentState: '伤势加重'})),
    resources: [...resources].reverse().map(r => ({...r, holderCharacterId: 'b', holderCharacterName: '乙', status: 'lost', updatedAt: 'today'})),
    payoffs: payoffs.map(p => ({...p, currentStatus: 'paid_off', summary: '门已打开', lastTouchedChapterOrder: 3})),
  });
  for (const key of ['characterRosterText', 'resourceCatalogText', 'payoffCatalogText']) assert.equal(before[key], after[key]);
  assert.match(after.characterStateText, /撤退/);
  assert.match(after.characterStateText, /伤势加重/);
  assert.match(after.existingResourceText, /lost/);
  assert.match(after.existingResourceText, /乙/);
  assert.match(after.existingPayoffText, /paid_off/);
  assert.match(after.existingPayoffText, /门已打开/);
});

test('dynamic resource state keeps ownership, limitations, false knowledge flags and use windows', () => {
  const {existingResourceText, existingPayoffText, resourceCatalogText} = build();
  for (const word of ['door_key', '守卫营', '只能开启后门', '损坏后不可用', 'misuse', 'high', '持有者误认用途', '4', '6']) assert.ok(existingResourceText.includes(word));
  assert.match(existingResourceText, /readerKnows=false/);
  assert.match(existingResourceText, /holderKnows=false/);
  assert.ok(!existingResourceText.includes('yesterday'));
  assert.ok(!resourceCatalogText.includes('损坏后不可用'));
  assert.match(existingPayoffText, /4-6/);
  assert.match(existingPayoffText, /守卫知道门锁已换/);
  assert.notEqual(build().resourceCatalogText, build({resources: resources.map(r => ({...r, name: '改名资产'}))}).resourceCatalogText);
});

test('context construction does not mutate rows or include historical evidence and timestamps', () => {
  const source = resources.map(r => ({...r, evidence: [{summary: '重复历史正文'}], sourceRefs: [{refLabel: '历史来源'}]}));
  const before = structuredClone(source);
  const context = JSON.stringify(build({resources: source}));
  assert.deepEqual(source, before);
  assert.ok(!context.includes('重复历史正文'));
  assert.ok(!context.includes('历史来源'));
});

function extractionFixture() {
  const calls = [];
  let resourceError;
  let currentResources = resources;
  const {ChapterArtifactDeltaService} = loadRuntimeSource('ChapterArtifactDeltaService.ts', {
    '../../../db/prisma': {prisma: {
      novel: {findUnique: async () => ({title: '本书'})},
      chapter: {findFirst: async () => ({id: 'c', order: 3, title: '本章', taskSheet: '入库房'})},
      character: {findMany: async () => characters}, payoffLedgerItem: {findMany: async () => payoffs},
      characterDialogueInfluence: {findMany: async () => []},
    }},
    '../../../prompting/core/promptRunner': {runStructuredPrompt: async request => {calls.push(request); return {output: {}};}},
    '../../../prompting/prompts/novel/chapterArtifactDelta.prompts': {
      chapterArtifactDeltaPrompt: {}, chapterArtifactDeltaOutputSchema: {parse: value => value},
    },
    '../../rag': {}, '../../state/StateService': {stateService: {getLatestSnapshotBeforeChapter: async () => null}},
    '../../payoff/payoffLedgerShared': {},
    '../characterResource/CharacterResourceLedgerService': {characterResourceLedgerService: {listResources: async () => {
      if (resourceError) throw resourceError;
      return currentResources;
    }}},
    '../characterMind/CharacterMindService': {}, '../characterResource/CharacterResourceStaleScanService': {},
    '../characterResource/characterResourceShared': {compactText: value => value.trim()},
    '../fact/NovelFactService': {}, '../novelP0Utils': {}, '../state/StateCommitService': {},
    '../state/stateProposalSourceQuality': {}, './artifactSync/ChapterArtifactSyncResult': {},
    './artifactSync/ChapterArtifactContentVersion': {buildChapterArtifactContentHash: value => `hash:${value}`},
    './artifactSync/context': {buildChapterArtifactLedgerContext},
    './artifactSync/facts': {},
  });
  return {service: new ChapterArtifactDeltaService(), calls,
    failResourceRead: () => {resourceError = Error('catalog unavailable');},
    changeHolder: () => {currentResources = resources.map(r => ({...r, holderCharacterName: '乙', holderCharacterId: 'b'}));},
  };
}

test('real extraction assembles one fresh unified request and retains stable catalog across holder changes', async () => {
  const f = extractionFixture();
  await f.service.extractChapterArtifacts({novelId: 'n', chapterId: 'c', content: '正文甲', artifactSyncPolicy: 'director_v2'});
  f.changeHolder();
  await f.service.extractChapterArtifacts({novelId: 'n', chapterId: 'c', content: '正文乙', artifactSyncPolicy: 'director_v2'});
  assert.equal(f.calls.length, 2);
  const [a, b] = f.calls.map(c => c.promptInput);
  assert.equal(a.resourceCatalogText, b.resourceCatalogText);
  assert.notEqual(a.existingResourceText, b.existingResourceText);
  assert.match(b.existingResourceText, /holder=b:乙/);
  assert.match(b.characterStateText, /肩部受伤/);
  assert.equal(b.chapterContent, '正文乙');
  assert.equal(f.calls[1].options.stage, 'chapter_artifact_delta');
});

test('V2 cannot spend a model call on a falsely empty resource catalog; V1 read tolerance is retained', async () => {
  const f = extractionFixture();
  f.failResourceRead();
  await assert.rejects(f.service.extractChapterArtifacts({novelId: 'n', chapterId: 'c', content: '正文', artifactSyncPolicy: 'director_v2'}), /catalog unavailable/);
  assert.equal(f.calls.length, 0);
  await f.service.extractChapterArtifacts({novelId: 'n', chapterId: 'c', content: '正文'});
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].promptInput.resourceCatalogText, '');
});
