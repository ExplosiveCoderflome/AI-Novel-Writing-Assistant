const test = require('node:test');
const assert = require('node:assert/strict');
const { genericMetaEvaluator } = require('../../dist/services/novel/director/handoff/GenericMetaEvaluator.js');
const { dynamicValueFormulaCompiler } = require('../../dist/services/novel/director/handoff/DynamicValueFormulaCompiler.js');
const { stageHandoffGateService } = require('../../dist/services/novel/director/handoff/StageHandoffGateService.js');

test('Module 1: Two-Layer Generic Stage Handoff Gate Architecture', async (t) => {
  const novelId = `test-handoff-${Date.now()}`;

  await t.test('Layer 1: GenericMetaEvaluator executes pure-code deterministic evaluation without hardcoded domain logic', () => {
    const mockSpec = {
      specId: 'spec-test-1',
      stageId: 'stageA->stageB',
      passThreshold: 0.85,
      repairThreshold: 0.60,
      dimensions: [
        {
          dimension: 'structural',
          weight: 1.0,
          rules: [
            {
              id: 'rule-title',
              fieldPath: 'title',
              operator: 'NON_EMPTY',
              penaltyWeight: 0.3,
              errorMessage: 'Title must be non-empty',
              isHardConstraint: false,
            },
          ],
        },
      ],
    };

    const validPayload = { title: 'Valid Book Title' };
    const resultValid = genericMetaEvaluator.evaluate(validPayload, mockSpec);
    assert.equal(resultValid.totalValueScore, 1.0);
    assert.equal(resultValid.isTrustworthy, true);
    assert.equal(resultValid.recommendedAction, 'PASS');

    const invalidPayload = { title: '' };
    const resultInvalid = genericMetaEvaluator.evaluate(invalidPayload, mockSpec);
    assert.equal(resultInvalid.totalValueScore, 0.7);
    assert.equal(resultInvalid.isTrustworthy, false);
    assert.equal(resultInvalid.recommendedAction, 'AUTO_REPAIR');
  });

  await t.test('Layer 2: DynamicValueFormulaCompiler dynamically compiles ValueFormulaSpec for arbitrary payload', () => {
    const payload = {
      storyTitle: '红楼星梦',
      volumes: [{ id: 'vol-1', title: '第一卷' }],
      characters: [{ name: '崔氏' }],
    };

    const spec = dynamicValueFormulaCompiler.compileFormulaSpec('story_macro->structured_outline', payload);
    assert.equal(spec.stageId, 'story_macro->structured_outline');
    assert.equal(spec.dimensions.length, 4);
    assert.ok(spec.dimensions[0].rules.some((r) => r.fieldPath === 'storyTitle'));
    assert.ok(spec.dimensions[1].rules.some((r) => r.fieldPath === 'volumes.length'));
  });

  await t.test('StageHandoffGateService verifies valid payload and issues signed VerifiedHandoffCertificate', () => {
    const validStoryPayload = {
      storyTitle: '白日做梦引擎叙事',
      summary: '白日做梦引擎端到端生产大纲',
      volumes: [
        { id: 'v1', name: '破晓卷', chapterCount: 10 },
        { id: 'v2', name: '崛起卷', chapterCount: 15 },
      ],
      characters: [
        { id: 'c1', name: '白玉堂', roleType: 'PROTAGONIST' },
      ],
    };

    const gateResponse = stageHandoffGateService.verifyStageHandoff(
      novelId,
      'candidates',
      'story_macro',
      validStoryPayload,
      { worldAxioms: ['修仙体系严密'] }
    );

    assert.equal(gateResponse.verified, true);
    assert.equal(gateResponse.result.recommendedAction, 'PASS');
    assert.ok(gateResponse.certificate);
    assert.equal(gateResponse.certificate.novelId, novelId);
    assert.ok(gateResponse.certificate.signature.length > 0);
  });

  await t.test('StageHandoffGateService blocks corrupt payload with missing/placeholder fields', () => {
    const corruptPayload = {
      storyTitle: 'TBD', // Placeholder string fails NON_EMPTY
      volumes: [],     // Empty array fails GREATER_THAN 0
    };

    const gateResponse = stageHandoffGateService.verifyStageHandoff(
      novelId,
      'story_macro',
      'structured_outline',
      corruptPayload
    );

    assert.equal(gateResponse.verified, false);
    assert.ok(gateResponse.rejectionReason.includes('Action: AUTO_REPAIR') || gateResponse.rejectionReason.includes('Action: REJECT_AND_REPLAN'));
    assert.equal(gateResponse.certificate, undefined);
  });
});
