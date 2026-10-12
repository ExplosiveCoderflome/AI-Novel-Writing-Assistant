const test = require('node:test');
const assert = require('node:assert/strict');
const {loadRuntimeSource} = require('./sourceHarness.cjs');
const hash = loadRuntimeSource('artifactSync/ChapterArtifactContentVersion.ts', {'node:crypto': require('node:crypto')});
const boundary = loadRuntimeSource('artifactSync/ChapterArtifactSyncBoundary.ts', {'./ChapterArtifactContentVersion': hash});
const policy = loadRuntimeSource('../production/completion/ChapterProductionCompletionPolicy.ts', {'../../runtime/artifactSync': boundary});

test('V2 refuses historic degraded boundaries with no applied delta while V1 keeps its contract', () => {
  const chapter = {content: 'draft', generationState: 'approved', chapterStatus: 'completed', riskFlags: null,
    artifactSyncCheckpoints: [{contentHash: hash.buildChapterArtifactContentHash('draft'), metadataJson: JSON.stringify({outcome: 'degraded', completedArtifacts: []})}]};
  assert.equal(policy.isCurrentChapterProductionCompleted(chapter), true);
  assert.equal(policy.isCurrentChapterProductionCompleted(chapter, {requireAppliedDelta: true}), false);
  chapter.artifactSyncCheckpoints[0].metadataJson = JSON.stringify({outcome: 'degraded', completedArtifacts: ['artifact_delta']});
  assert.equal(policy.isCurrentChapterProductionCompleted(chapter, {requireAppliedDelta: true}), true);
});
