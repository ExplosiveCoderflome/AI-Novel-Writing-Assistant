const test = require('node:test');
const assert = require('node:assert/strict');
const {chapterArtifactDeltaOutputSchema, chapterArtifactDeltaPrompt} = require('../../dist/prompting/prompts/novel/chapterArtifactDelta.prompts');
const base = {summary: '章末', stateDeltas: {}, syncPlan: {reason: '正文回填'}, confidence: .9};

test('chapter extraction retains actual appearances separately from mentions and memories', () => {
  const rows = [
    {characterId: 'a', characterName: '青禾', kind: 'present', summary: '打开药铺', evidence: '青禾打开药铺。'},
    {characterId: 'b', characterName: '师父', kind: 'flashback', summary: '童年授课', evidence: '她想起幼时师父的授课。'},
    {characterId: '', characterName: '阿宁', kind: 'mention', summary: '听说回城', evidence: '听说阿宁回城了。'},
  ];
  const parsed = chapterArtifactDeltaOutputSchema.parse({...base, characterAppearances: rows});
  assert.deepEqual(parsed.characterAppearances, rows);
});

test('old extraction without appearance coverage stays unknown rather than reporting an empty cast', () => {
  assert.equal(chapterArtifactDeltaOutputSchema.parse(base).characterAppearances, undefined);
});

test('appearance tracking preserves the reusable prefix across chapters and changing character states', async () => {
  const stable = {novelTitle:'药铺', characterRosterText:'qing: 青禾', resourceCatalogText:'药箱', payoffCatalogText:'旧药方',
    characterCandidateResolutionEnabled:true, locationTrackingEnabled:true};
  const first = await chapterArtifactDeltaPrompt.render({...stable,chapterOrder:1,chapterTitle:'开门',chapterContent:'青禾打开药铺。',characterStateText:'在药铺',characterLocationText:'药铺'});
  const next = await chapterArtifactDeltaPrompt.render({...stable,chapterOrder:2,chapterTitle:'出城',chapterContent:'青禾出城采药。',characterStateText:'在城外',characterLocationText:'城外'});
  assert.deepEqual(first.slice(0,2).map(m=>m.content),next.slice(0,2).map(m=>m.content));
  assert.notEqual(first[2].content,next[2].content);
  assert.equal(chapterArtifactDeltaPrompt.structuredOutputHint.placement,'stable_prefix');
  assert.deepEqual(chapterArtifactDeltaPrompt.structuredOutputHint.example.characterAppearances,[]);
});
