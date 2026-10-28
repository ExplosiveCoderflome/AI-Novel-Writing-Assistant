const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path');
const {spawnSync} = require('node:child_process');
const {setup} = require('./persistence/sqliteFixture.cjs');
async function execute(t, scenario = '') {
  const f = await setup(t), databases = await f.db.$queryRawUnsafe('PRAGMA database_list');
  const file = databases.find(row => row.name === 'main').file;
  const child = spawnSync(process.execPath, [path.join(__dirname, 'batch/manualEntryProcess.cjs')], {
    encoding: 'utf8', timeout: 55000, maxBuffer: 2000000,
    env: {...process.env, DATABASE_URL: `file:${file}`, NODE_ENV: 'test', RAG_ENABLED: 'false', PRODUCTION_KERNEL_V2_CHAPTERS: 'true',
      KERNEL_MANUAL_SCENARIO: scenario,
      PRODUCTION_KERNEL_MODEL_WINDOWS: JSON.stringify([{provider: 'openai', model: 'fixture-model', contextWindow: 1000000}])},
  });
  assert.equal(child.status, 0, child.stdout + '\n' + child.stderr);
  const result = JSON.parse(child.stdout.trim().split(/\r?\n/).at(-1));
  if (!scenario) {
    const replay = spawnSync(process.execPath, [path.join(__dirname, 'batch/manualEntryProcess.cjs')], {encoding: 'utf8', timeout: 20000, maxBuffer: 200000,
      env: {...process.env, DATABASE_URL: `file:${file}`, NODE_ENV: 'test', RAG_ENABLED: 'false', PRODUCTION_KERNEL_V2_CHAPTERS: 'false', KERNEL_MANUAL_REPLAY: result.runId}});
    assert.equal(replay.status, 0, replay.stdout + '\n' + replay.stderr);
    const saved = JSON.parse(replay.stdout.trim().split(/\r?\n/).at(-1));
    assert.equal(saved.calls, 0); assert.equal(saved.hash, result.contentHash); assert.equal(saved.reports, result.reports);
  }
  return result;
}
test('manual kernel uses durable commands and a real worker for write, repair and edited manuscript reaudit', async t => {
  const result = await execute(t);
  assert.equal(result.runs, 3); assert.equal(result.jobs, 0);
  assert.equal(result.repaired, true); assert.equal(result.editedPreserved, true); assert.equal(result.reportMatches, true);
  assert.equal(result.replayCalls, 0); assert.ok(result.calls.includes('repair'));
});
test('manual commands capture the current book epoch after a director version change', async t => {
  const result = await execute(t, 'epoch');
  assert.equal(result.runs, 3); assert.equal(result.editedPreserved, true);
});
test('an editor save while a manual repair candidate is reviewed prevents the candidate overwrite', async t => {
  const result = await execute(t, 'concurrent');
  assert.equal(result.protected, true); assert.equal(result.jobs, 0);
});
