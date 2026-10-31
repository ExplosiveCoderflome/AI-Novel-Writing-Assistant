const test = require('node:test'), assert = require('node:assert/strict');
const { parseSelectedAssessment } = require('../../../dist/modules/production/infrastructure/lifecycle/selectedAssessment');
const { projectSelectedQualityLoop } = require('../../../dist/modules/production/infrastructure/lifecycle/selectedQualityDebt');

// Regression (2026-10-31 real-model run, chapter 3): the acceptance model
// returned a repairVerification block whose binding hashes were empty
// strings. The pipeline saved the assessment and acted on it (repair ->
// verify -> select retained the original), but the lifecycle readers
// re-validated it with the strict schema at publish time and failed the
// whole chapter deterministically with "Selected assessment is invalid".
const assessment = {
  status: 'repairable',
  score: { coherence: 82, pacing: 80, repetition: 90, engagement: 78, voice: 85, overall: 82 },
  summary: '取册衔接未写明，需要修订。',
  blockingIssues: [{ severity: 'medium', category: 'continuity', code: 'C1', evidence: '老周应了声，提着钥匙转身往外走。', fixSuggestion: '补明持钥匙重开档房。' }],
  repairDirectives: [], missingObligations: [], repairability: 'patchable_obligation_gap',
  decisionReason: '可通过补写衔接修复。', riskTags: [],
  assetSyncRecommendation: { priority: 'normal', reason: '常规同步。', requiresFullPayoffReconcile: false },
  continuePolicy: 'repair_once',
  repairVerification: {
    contentHash: '',
    checks: [{ kind: 'issue', key: 'C1', status: 'unresolved', currentEvidence: '老周应了声，提着钥匙转身往外走。', reason: '仍未写明。' }],
    factPreservation: { sourceContentHash: '', status: 'uncertain', correctionIssueIds: [], currentEvidence: '老周应了声。', reason: '无法绑定原文。' },
  },
};

test('an unbound repair verification does not invalidate the selected assessment', () => {
  const parsed = parseSelectedAssessment(structuredClone(assessment));
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.repairVerification, undefined);
  assert.equal(parsed.data.score.overall, 82);

  // A bound verification block is preserved untouched.
  const bound = structuredClone(assessment);
  bound.repairVerification.contentHash = 'a'.repeat(64);
  bound.repairVerification.factPreservation.sourceContentHash = 'b'.repeat(64);
  const parsedBound = parseSelectedAssessment(bound);
  assert.equal(parsedBound.success, true);
  assert.equal(parsedBound.data.repairVerification.contentHash, 'a'.repeat(64));

  // Other schema violations still fail.
  const broken = structuredClone(assessment);
  delete broken.summary;
  assert.equal(parseSelectedAssessment(broken).success, false);
});

test('quality-debt projection survives the incident assessment shape', () => {
  const run = { id: 'unit-1',
    progress: { selected: 'original', debts: [], repairAttemptsUsed: 1, selectedContentHash: 'c'.repeat(64) },
    artifacts: { stageData: { accept: { assessment: structuredClone(assessment) } } },
    snapshots: { profile: { stages: ['accept'], repair: { maxAttempts: 1 } } } };
  const view = projectSelectedQualityLoop(run, new Date(0).toISOString());
  assert.equal(view.overallStatus, 'risk');
  assert.equal(view.source, 'pipeline_review');
});
