const test = require('node:test');
const assert = require('node:assert/strict');
const { evolutionaryOperatorEngine } = require('../dist/services/novel/director/operators/EvolutionaryOperatorEngine.js');
const {
  mockCandidateA,
  mockCandidateB,
  mockAuditDiagnostics,
  mockConstraintViolations,
} = require('./fixtures/evolutionaryOperatorFixtures.js');

test('Evolutionary Operators Test Suite', async (t) => {
  await t.test('TC-EVO-01: DraftOperator 能够成功生成包含结构的初稿 Candidate', async () => {
    const result = await evolutionaryOperatorEngine.draft({
      novelId: 'novel_test_01',
      chapterId: 'chap_001',
      contextBlock: {
        novelTitle: '仙逆长生',
        chapterTitle: '第一章 破晓之剑',
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.operatorType, 'draft');
    assert.ok(result.candidate.content.length > 0);
    assert.ok(result.fitness.overallScore >= 80);
    assert.equal(result.mutationTrace.operatorType, 'draft');
  });

  await t.test('TC-EVO-02: ImproveOperator 能够根据 Audit 诊断建议完成增量润色并提高得分', async () => {
    const result = await evolutionaryOperatorEngine.improve(
      mockCandidateA,
      mockAuditDiagnostics,
      { novelId: 'novel_test_01' }
    );

    assert.equal(result.success, true);
    assert.equal(result.operatorType, 'improve');
    assert.ok(result.candidate.content.includes('润色增补'));
    assert.ok(result.appliedFixes.length >= 2);
    assert.ok(result.fitness.overallScore > 85);
  });

  await t.test('TC-EVO-03: DebugOperator 能够精准修复违例场景', async () => {
    const result = await evolutionaryOperatorEngine.debug(
      mockCandidateA,
      mockConstraintViolations,
      { novelId: 'novel_test_01' }
    );

    assert.equal(result.success, true);
    assert.equal(result.operatorType, 'debug');
    assert.ok(result.candidate.content.includes('修复标记'));
    assert.ok(result.appliedFixes.some((f) => f.includes('critical')));
    assert.equal(result.fitness.conflictResolution, 95);
  });

  await t.test('TC-EVO-04: CrossoverOperator 能够融合方案A与方案B的优势基因生成高满意度子代候选', async () => {
    const result = await evolutionaryOperatorEngine.crossover(
      mockCandidateA,
      mockCandidateB,
      {
        extractPlotBeats: true,
        extractCharacterArc: true,
        extractAtmosphereStyle: true,
        extractClimaxPayoff: true,
      },
      { novelId: 'novel_test_01' }
    );

    assert.equal(result.success, true);
    assert.equal(result.operatorType, 'crossover');
    assert.ok(result.candidate.title.includes('基因熔炼版'));
    assert.ok(result.crossoverAnalysis.synthesizedGenes.length >= 2);
    assert.ok(result.fitness.overallScore >= 90);
  });

  await t.test('TC-EVO-05: CrossoverOperator 在单父代缺失时能够优雅降例 (Fallback)', async () => {
    const result = await evolutionaryOperatorEngine.crossover(
      mockCandidateA,
      null,
      undefined,
      { novelId: 'novel_test_01' }
    );

    assert.equal(result.success, false);
    assert.equal(result.error.code, 'MISSING_DUAL_PARENTS');
    assert.equal(result.candidate.id, mockCandidateA.id);
  });

  await t.test('TC-EVO-06: OperatorEngine 能防范非法算子输入', async () => {
    await assert.rejects(
      async () => {
        await evolutionaryOperatorEngine.executeOperator({
          operatorType: 'invalid_operator_type',
          novelId: 'novel_test',
        });
      },
      (err) => {
        return err.message.includes('不支持的演化算子类型');
      }
    );
  });
});
