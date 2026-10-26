const { createPipelineHarness } = require('../../novelProduction/sourceHarness.cjs');
const { harness, request, hash, copy } = require('../application/harness.cjs');
const kernel = require('../../../dist/modules/production');
const { original, candidate } = require('./fixtures.cjs');

async function compare(fixture) {
  const scores = fixture.scores;
  const old = createPipelineHarness({ content: '', scores, repairContent: candidate, evaluate: (evaluation, { index }) => {
    const assessment = copy(index ? fixture.candidate : fixture.original);
    const runtime = evaluation.runtimePackage;
    runtime.meta = { ...runtime.meta, acceptanceStatus: assessment.status, riskTags: assessment.riskTags, repairDirectives: assessment.repairDirectives };
    runtime.audit.openIssues = assessment.blockingIssues.map(issue => ({ ...issue, id: issue.code, description: issue.fixSuggestion, status: 'open' }));
    runtime.audit.hasBlockingIssues = assessment.blockingIssues.some(issue => ['high', 'critical'].includes(issue.severity));
    runtime.obligationCoverage = { missing: assessment.missingObligations };
    evaluation.acceptanceResult = { assessment };
    return evaluation;
  } });
  const oldResult = await old.run({ artifactSyncPolicy: 'director_v2', maxRetries: fixture.maxAttempts ?? 1, repairAttemptsAllowed: fixture.maxAttempts ?? 1 });
  const fresh = harness();
  const req = request({ policy: { blockingAction: fixture.manual ? 'pause_for_manual' : 'continue_with_warning' } });
  req.profile.repair.maxAttempts = fixture.maxAttempts ?? 1;
  const stages = [];
  const services = { purpose: 'automatic', readBaseline: async () => ({ content: '', updatedAt: new Date(0).toISOString(), protectedUserContent: false }),
    prepare: async () => ({ novelTitle: 'fixture', chapterTitle: fixture.id, contextPackage: {} }),
    describe: async (stage, _run, input) => ({ callsModel: ['draft', 'accept', 'repair', 'verify'].includes(stage),
      ...(req.profile.outputBudgets[stage] ? { outputTokens: req.profile.outputBudgets[stage] } : {}), inputFingerprint: hash(JSON.stringify(input)), input, promptVersion: 'v1', configVersion: 'v1' }),
    scoped: async (_run, _call, operation) => operation(), write: async () => { stages.push('draft'); return original; },
    assess: async input => { const verify = input.content === candidate; stages.push(verify ? 'verify' : 'accept');
      return { assessment: copy(verify ? fixture.candidate : fixture.original), issues: [], auditReports: [] }; },
    repair: async () => { stages.push('repair'); return { content: candidate }; }, knownRepairFailure: () => null };
  fresh.stages = kernel.createChapterStagePorts(services, { reconcile: { describe: async () => ({ callsModel: false, inputFingerprint: 'fixture', promptVersion: 'v1', configVersion: 'v1' }),
    execute: async () => { stages.push('reconcile'); return { result: { stage: 'reconcile', status: 'completed' } }; } } });
  const newResult = await kernel.runUnit(req, fresh);
  const result = { id: fixture.id, title: fixture.title,
    old: { selected: oldResult.repairSelection?.selected ?? 'original', repairs: oldResult.retryCountUsed, reviews: old.events.filter(event => event === 'acceptance').length,
      synced: old.syncedContents.length > 0, earlyWrites: old.events.filter(event => event === 'save').length, commits: old.committedContents.length, pass: oldResult.pass },
    kernel: { selected: newResult.progress.selected ?? null, repairs: newResult.progress.repairAttemptsUsed, reviews: stages.filter(stage => stage === 'accept' || stage === 'verify').length,
      synced: stages.includes('reconcile'), earlyWrites: 0, commits: fresh.calls.filter(event => event === 'chapter-write').length, status: newResult.status, reason: newResult.progress.selectionReasonCode ?? null } };
  result.differences = ['selected', 'repairs', 'reviews', 'synced', 'earlyWrites', 'commits'].filter(field => result.old[field] !== result.kernel[field]);
  return result;
}
module.exports = { compare };
