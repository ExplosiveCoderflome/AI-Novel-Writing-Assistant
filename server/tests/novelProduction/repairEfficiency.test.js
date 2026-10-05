const test = require('node:test');
const assert = require('node:assert/strict');
const { createPipelineHarness } = require('./sourceHarness.cjs');

test('AI continue-with-risk retains saved prose and quality debt without spending a patch attempt', async () => {
  const h = createPipelineHarness({ scores: [78], acceptanceMeta: { acceptanceStatus: 'continue_with_risk', continuePolicy: 'continue' } });
  const result = await h.run({ autoRepair: true, maxRetries: 1 });
  assert.equal(h.budget, 0);
  assert.equal(h.events.filter(event => event === 'repair').length, 0);
  assert.deepEqual(h.committedContents, ['original draft']);
  assert.equal(result.pass, false);
  assert.equal(result.qualityDebtAttribution.repairAttemptsUsed, 0);
});

test('rewrite-only AI directives do not spend a light-patch attempt', async () => {
  const h = createPipelineHarness({ scores: [78], acceptanceMeta: { repairDirectives: [{ mode: 'rewrite', target: 'plot', instruction: '需要整体重新安排' }] } });
  await h.run({ autoRepair: true, repairMode: 'light_repair', maxRetries: 1 });
  assert.equal(h.budget, 0);
  assert.deepEqual(h.committedContents, ['original draft']);
});

test('an unchanged patch spends its issued attempt but avoids another acceptance call', async () => {
  const h = createPipelineHarness({ scores: [78], repairContent: 'original draft' });
  await h.run({ autoRepair: true, maxRetries: 1 });
  assert.equal(h.budget, 1);
  assert.equal(h.events.filter(event => event === 'repair').length, 1);
  assert.equal(h.events.filter(event => event === 'acceptance').length, 1);
  assert.deepEqual(h.committedContents, ['original draft']);
});

test('a genuine changed patch still receives fresh acceptance and candidate selection', async () => {
  const h = createPipelineHarness({ scores: [78, 92] });
  await h.run({ autoRepair: true, maxRetries: 1 });
  assert.equal(h.budget, 1);
  assert.equal(h.events.filter(event => event === 'acceptance').length, 2);
  assert.deepEqual(h.committedContents, ['repair candidate']);
});

test('repair reacceptance carries only the first assessment issue baseline', async () => {
  const assessment = {
    blockingIssues: [{ code: 'goal_change', evidence: '缺少行动', fixSuggestion: '加入行动' }],
    missingObligations: [{ kind: 'goal_change', summary: '陆青萝转移档案', evidence: '原文只有旁观' }],
    repairDirectives: [{ mode: 'patch', target: 'character', instruction: '用当前场景行动兑现' }],
    summary: 'Do not duplicate this summary', score: { overall: 78 },
  };
  const h = createPipelineHarness({ scores: [78, 92], acceptanceAssessment: assessment });
  await h.run({ autoRepair: true, maxRetries: 1 });
  assert.equal(h.reviewBaselines.length, 2);
  assert.equal(h.reviewBaselines[0], undefined);
  assert.deepEqual(h.reviewBaselines[1], {
    blockingIssues: assessment.blockingIssues,
    missingObligations: assessment.missingObligations,
    repairDirectives: assessment.repairDirectives,
  });
});

test('new severe prose defects reject a patch before paying for another AI acceptance', async () => {
  for (const repairContent of ['他收好钥匙——推开木门。', '他收好钥匙。作为AI，我无法继续创作。']) {
    const h = createPipelineHarness({ content: '他收好钥匙，推开木门。', scores: [78, 92], repairContent });
    const result = await h.run({ autoRepair: true, maxRetries: 1 });
    assert.equal(h.budget, 1);
    assert.equal(h.events.filter(event => event === 'acceptance').length, 1);
    assert.deepEqual(h.committedContents, ['他收好钥匙，推开木门。']);
    assert.deepEqual(h.syncedContents, ['他收好钥匙，推开木门。']);
    assert.deepEqual(result.recoverableRepairFailure.failureTypes, ['prose_quality_regression']);
    assert.equal(result.pass, false);
  }
});

test('an existing prose defect still permits AI evaluation of an otherwise improved candidate', async () => {
  const h = createPipelineHarness({ content: '他停了停——推开木门。', scores: [78, 92], repairContent: '他停了停——拿出钥匙，推开木门。' });
  await h.run({ autoRepair: true, maxRetries: 1 });
  assert.equal(h.events.filter(event => event === 'acceptance').length, 2);
  assert.deepEqual(h.committedContents, ['他停了停——拿出钥匙，推开木门。']);
});

test('integrity findings override AI continue for repair eligibility while keeping final quality debt', async () => {
  for (const finding of [{ auditHasBlockingIssues: true }, { timelineStatus: 'failed' }]) {
    const h = createPipelineHarness({ scores: [78], acceptanceMeta: { acceptanceStatus: 'accepted', continuePolicy: 'continue' }, ...finding });
    const result = await h.run({ autoRepair: true, maxRetries: 1 });
    assert.equal(h.budget, 1);
    assert.equal(h.events.filter(event => event === 'acceptance').length, 2);
    assert.equal(result.pass, false);
  }
});

test('explicit AI manual pause does not become an automatic repair or a passing chapter', async () => {
  const h = createPipelineHarness({ scores: [92], acceptanceMeta: { acceptanceStatus: 'needs_manual_review', continuePolicy: 'pause' } });
  const result = await h.run({ autoRepair: true, maxRetries: 1 });
  assert.equal(h.budget, 0);
  assert.equal(result.runtimePackage.meta.continuePolicy, 'pause');
  assert.equal(result.pass, false);
  assert.deepEqual(h.committedContents, ['original draft']);
});
