const test = require('node:test');
const assert = require('node:assert/strict');
const {chapterArtifactDeltaOutputSchema} = require('../../dist/prompting/prompts/novel/chapterArtifactDelta.prompts');

test('unified extraction preserves actual and non-present location evidence for guarded backfill', () => {
  const input = {
    summary:'甲仍在牢房，乙到客栈。',stateDeltas:{},syncPlan:{reason:'按最终正文回填'},confidence:0.95,
    characterLocationDeltas:[{
      characterId:'a',characterName:'甲',fromLocation:'牢房',locationName:'客栈',
      movementType:'move',timeContext:'plan',continuityStatus:'consistent',
      evidence:'甲打算明日去客栈。',explanation:'尚未出发。',
    }],
  };
  assert.deepEqual(chapterArtifactDeltaOutputSchema.parse(input).characterLocationDeltas, input.characterLocationDeltas);
});

test('older extraction checkpoints remain reusable without fabricated location changes', () => {
  const parsed = chapterArtifactDeltaOutputSchema.parse({summary:'旧正文',stateDeltas:{},syncPlan:{reason:'无位置记录'},confidence:0.9});
  assert.deepEqual(parsed.characterLocationDeltas, []);
});
