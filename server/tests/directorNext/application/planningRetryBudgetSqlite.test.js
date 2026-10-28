const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

test('seven-stage planning keeps the next stage retry after upstream recovery and process restart', () => {
  const root = path.resolve(__dirname, '../../../..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'director-planning-retries-'));
  const script = path.join(dir, 'worker.cjs');
  fs.writeFileSync(script, String.raw`
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.DIRECTOR_NEXT_REPO_ROOT;
const fixture = process.env.PLANNING_RETRY_FIXTURE;
const mode = process.argv[2];
const {prisma} = require(path.join(root, 'server/dist/db/prisma'));
const {ensureRuntimeDatabaseReady} = require(path.join(root, 'server/dist/db/runtimeMigrations'));
const {createDirectorNextServices} = require(path.join(root, 'server/dist/modules/director'));
const {StepRegistry} = require(path.join(root, 'server/dist/modules/director/application'));
const {directorProductionPlan: plan} = require(path.join(root, 'server/dist/modules/director/steps/planDefinition'));
const {contract} = require(path.join(root, 'server/tests/directorNext/fixtures'));
const planningSteps = plan.steps.filter(step => !['chapter_detail_bundle', 'execution_contract_sync', 'chapter_batch'].includes(step.id));
const callsFile = path.join(fixture, 'calls.json');
const readCalls = () => fs.existsSync(callsFile) ? JSON.parse(fs.readFileSync(callsFile, 'utf8')) : {};
const registry = new StepRegistry();
for (const step of plan.steps) registry.register(step.id, async context => {
  const calls = readCalls();
  calls[step.id] = (calls[step.id] ?? 0) + 1;
  fs.writeFileSync(callsFile, JSON.stringify(calls));
  if (['world_setup', 'volume_beat_sheet'].includes(step.id) && calls[step.id] === 1) {
    throw new Error('temporary failure in ' + step.id);
  }
  return {artifact: {scope: context.contract.scope, status: 'draft', protectedUserContent: false,
    contentRef: step.id, contentHash: step.id}};
});
const services = createDirectorNextServices({plan, stepRegistry: registry,
  contractFactory: input => contract({runId: input.runId, novelId: input.novelId, planVersion: plan.version,
    stepIdsInScope: planningSteps.map(step => step.id), chapterRange: null,
    issuePolicy: {mode: 'completion_first', version: 'frozen', pipelinePolicy: {maxAutomaticRetries: 1, issueActions: {}}}}),
  prepareOpen: async () => [{type: 'novel_seed', scope: 'book', status: 'confirmed', protectedUserContent: true,
    contentRef: 'seed', contentHash: 'seed'}]});
(async () => {
  if (mode === 'initial') {
    await ensureRuntimeDatabaseReady();
    await prisma.novel.create({data: {id: 'planning-novel', title: '阶段预算测试'}});
    const opened = await services.http.commandService.execute({type: 'open_run', novelId: 'planning-novel', driver: 'auto',
      stepIdsInScope: null, idempotencyKey: 'planning-open'});
    fs.writeFileSync(path.join(fixture, 'run.json'), JSON.stringify({runId: opened.runId}));
    for (let index = 0; index < 4; index += 1) assert.equal(await services.worker.tick(), true);
    assert.deepEqual(readCalls(), {story_macro: 1, book_contract: 1, world_setup: 2});
    assert.equal((await prisma.directorNextRunControl.findUniqueOrThrow({where: {runId: opened.runId}})).status, 'running');
    // A completed tick releases its lease. Explicitly seed the live foreign owner this recovery scenario exercises.
    assert.equal((await prisma.directorNextRunControl.findUniqueOrThrow({where: {runId: opened.runId}})).leaseOwner, null);
    await prisma.directorNextRunControl.update({where: {runId: opened.runId}, data: {
      leaseOwner: 'fixture-live-foreign-worker', leaseExpiresAt: new Date(Date.now() + 120000),
    }});
  } else {
    const {runId} = JSON.parse(fs.readFileSync(path.join(fixture, 'run.json'), 'utf8'));
    assert.equal(await services.worker.tick(), false, 'a live foreign lease remains protected');
    await prisma.directorNextRunControl.update({where: {runId}, data: {leaseExpiresAt: new Date(Date.now() - 1000)}});
    for (let index = 0; index < 10; index += 1) {
      if (!await services.worker.tick()) break;
      if ((await prisma.directorNextRunControl.findUniqueOrThrow({where: {runId}})).status === 'completed') break;
    }
    const view = await services.http.projectionService.get(runId);
    assert.equal(view.mode, 'completed', 'the beat-sheet first failure must not exhaust a previous stage retry');
    assert.deepEqual(view.progress, {done: 7, total: 7, source: 'artifact_ledger'});
    assert.deepEqual(readCalls(), {story_macro: 1, book_contract: 1, world_setup: 2, character_setup: 1,
      volume_strategy: 1, volume_beat_sheet: 2, volume_chapter_list: 1});
    const failures = await prisma.directorNextEvent.findMany({where: {runId, type: 'execution_failure'}, orderBy: {seq: 'asc'}});
    assert.deepEqual(failures.map(row => JSON.parse(row.payloadJson).attempt), [1, 1]);
    assert.deepEqual(failures.map(row => JSON.parse(row.payloadJson).stepId), ['world_setup', 'volume_beat_sheet']);
    assert.equal(await prisma.directorNextArtifact.count({where: {producedByRunId: runId, type: 'world_skeleton'}}), 1);
    assert.equal(await prisma.directorNextEvent.count({where: {runId, type: 'stop_signal'}}), 0);
  }
  await prisma.$disconnect();
})().catch(async error => {console.error(error); await prisma.$disconnect(); process.exitCode = 1;});
`);
  const env = {...process.env, NODE_ENV: 'test', AI_NOVEL_RUNTIME: 'desktop', AI_NOVEL_APP_DATA_DIR: dir,
    DIRECTOR_NEXT_REPO_ROOT: root, PLANNING_RETRY_FIXTURE: dir,
    DATABASE_URL: 'file:' + path.join(dir, 'planning.db').replace(/\\/g, '/')};
  for (const mode of ['initial', 'recover']) {
    const result = spawnSync(process.execPath, [script, mode], {cwd: root, env, encoding: 'utf8', timeout: 30000});
    assert.equal(result.status, 0, result.stderr + '\n' + result.stdout);
  }
});
