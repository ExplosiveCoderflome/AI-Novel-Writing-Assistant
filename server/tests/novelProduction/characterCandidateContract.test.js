const test = require('node:test');
const assert = require('node:assert/strict');
const {chapterArtifactDeltaOutputSchema} = require('../../dist/prompting/prompts/novel/chapterArtifactDelta.prompts');

function output(candidate) {
  return chapterArtifactDeltaOutputSchema.parse({summary: '章末摘要', stateDeltas: {},
    syncPlan: {reason: '正文回填'}, characterCandidates: [candidate], confidence: 0.9});
}

test('candidate extraction retains structured identity decisions instead of losing them before auto mode', () => {
  const candidate = output({proposedName: '阿青', evidence: ['阿青推门而入。'],
    identityDecision: 'merge', matchedCharacterId: 'existing', decisionReason: '正文说明阿青是青禾的乳名'}).characterCandidates[0];
  assert.equal(candidate.identityDecision, 'merge');
  assert.equal(candidate.matchedCharacterId, 'existing');
  assert.equal(candidate.decisionReason, '正文说明阿青是青禾的乳名');
});

test('old cached candidates never acquire automatic create permission', () => {
  const candidate = output({proposedName: '阿青', evidence: []}).characterCandidates[0];
  assert.equal(candidate.identityDecision, 'defer');
});

test('newly confirmed identities receive IDs for locations and resources without fuzzy matching unconfirmed people', () => {
  const {canonicalizeCandidateReferences} = require('../../dist/services/novel/characters/candidates/references');
  const raw = output({proposedName: '阿宁'});
  raw.characterLocationDeltas = [{characterName: '阿宁', characterId: '', locationName: '药铺'}];
  raw.characterResourceDeltas = [{holderCharacterName: '阿青', ownerType: 'character', ownerName: '阿青', knownByCharacterNames: ['阿青', '蒙面人'], evidence: '阿青拿着钥匙'},
    {holderCharacterName: '蒙面人', evidence: '身份待定'}];
  const mapped = canonicalizeCandidateReferences(raw, [{name: '阿宁', targetId: 'new', status: 'created'},
    {name: '阿青', targetId: 'qing', status: 'merged'}, {name: '蒙面人', status: 'pending'}], [{id: 'new', name: '阿宁'}, {id: 'qing', name: '青禾'}]);
  assert.equal(mapped.characterLocationDeltas[0].characterId, 'new');
  assert.equal(mapped.characterResourceDeltas.length, 1);
  assert.equal(mapped.characterResourceDeltas[0].holderCharacterName, '青禾');
  assert.equal(mapped.characterResourceDeltas[0].ownerName, '青禾');
  assert.deepEqual(mapped.characterResourceDeltas[0].knownByCharacterNames, ['青禾']);
  assert.equal(mapped.characterResourceDeltas[0].evidence, '阿青拿着钥匙');
  assert.equal(raw.characterResourceDeltas.length, 2, 'raw extraction remains intact for review');
});
