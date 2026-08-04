const test = require('node:test');
const assert = require('node:assert/strict');
const { evidenceTraceLogger } = require('../../dist/services/novel/director/operators/EvidenceTraceLogger.js');

test('Module 4: OpenRSI Evolutionary Operator Evidence Logs & Mutation Trace Architecture', async (t) => {
  const novelId = `test-novel-mut-${Date.now()}`;
  const chapterId = `chap-12`;

  t.afterEach(() => {
    evidenceTraceLogger.clearLedger(novelId);
  });

  await t.test('Mutation Recording: Correctly logs mutation node and calculates score delta', () => {
    const node = evidenceTraceLogger.recordMutation(
      novelId,
      chapterId,
      'CROSSOVER',
      ['parent-hash-a', 'parent-hash-b'],
      'child-hash-c',
      0.75,
      0.92,
      'Fused action pacing from Parent A and character monologue from Parent B'
    );

    assert.equal(node.novelId, novelId);
    assert.equal(node.chapterId, chapterId);
    assert.equal(node.operatorType, 'CROSSOVER');
    assert.equal(node.scoreImprovement.beforeScore, 0.75);
    assert.equal(node.scoreImprovement.afterScore, 0.92);
    assert.equal(node.scoreImprovement.delta, 0.17);
    assert.equal(node.isPositiveMutation, true);
  });

  await t.test('Anti-Degradation Rollback Guard: Flags negative mutations for automatic rollback', () => {
    const positiveNode = evidenceTraceLogger.recordMutation(
      novelId,
      chapterId,
      'IMPROVE',
      ['parent-hash-v1'],
      'child-hash-v2',
      0.80,
      0.88,
      'Polished dialogue'
    );
    const posCheck = evidenceTraceLogger.shouldRollbackMutation(positiveNode);
    assert.equal(posCheck.rollback, false);

    // Negative mutation (score drops from 0.88 to 0.70)
    const negativeNode = evidenceTraceLogger.recordMutation(
      novelId,
      chapterId,
      'IMPROVE',
      ['child-hash-v2'],
      'child-hash-v3-bad',
      0.88,
      0.70,
      'Over-polished prose introduced artificial fluff'
    );
    const negCheck = evidenceTraceLogger.shouldRollbackMutation(negativeNode);
    assert.equal(negCheck.rollback, true);
    assert.ok(negCheck.reason.includes('Negative score delta'));
    assert.ok(negCheck.reason.includes('child-hash-v2'));
  });

  await t.test('Mutation Lineage Tree: Reconstructs chapter evolution history with net score gain', () => {
    evidenceTraceLogger.recordMutation(novelId, chapterId, 'DRAFT', [], 'h1', 0.0, 0.70, 'Initial draft');
    evidenceTraceLogger.recordMutation(novelId, chapterId, 'IMPROVE', ['h1'], 'h2', 0.70, 0.82, 'Pacing boost');
    evidenceTraceLogger.recordMutation(novelId, chapterId, 'DEBUG', ['h2'], 'h3', 0.82, 0.90, 'Fixed continuity breach');

    const tree = evidenceTraceLogger.getChapterMutationLineage(novelId, chapterId);
    assert.equal(tree.totalMutations, 3);
    assert.equal(tree.positiveMutationsCount, 3);
    assert.equal(tree.netScoreGain, 0.90);
    assert.equal(tree.nodes[2].operatorType, 'DEBUG');
  });

  await t.test('Elite RAG Vector Filtering: Filters only high-gain mutation nodes (delta >= 0.15)', () => {
    evidenceTraceLogger.recordMutation(novelId, 'c1', 'IMPROVE', ['h1'], 'h2', 0.70, 0.72, 'Minor tweak (+0.02)');
    evidenceTraceLogger.recordMutation(novelId, 'c2', 'CROSSOVER', ['h3', 'h4'], 'h5', 0.70, 0.90, 'Major breakthrough (+0.20)');

    const elite = evidenceTraceLogger.getEliteMutationNodes(novelId, 0.15);
    assert.equal(elite.length, 1);
    assert.equal(elite[0].chapterId, 'c2');
    assert.equal(elite[0].scoreImprovement.delta, 0.20);
  });
});
