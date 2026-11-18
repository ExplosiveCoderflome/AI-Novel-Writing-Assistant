const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {once} = require('node:events');
const express = require('express');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'director-outline-chapter-gate-'));
Object.assign(process.env, {
  NODE_ENV: 'test', AI_NOVEL_RUNTIME: 'desktop', AI_NOVEL_APP_DATA_DIR: dir,
  DATABASE_URL: 'file:' + path.join(dir, 'gate.db'),
});

const {createEmptyOutlineDocument} = require('@ai-novel/shared/types/outline');
const {prisma} = require('../../../../dist/db/prisma');
const {ensureRuntimeDatabaseReady} = require('../../../../dist/db/runtimeMigrations');
const {OutlineOpenBookService} = require('../../../../dist/modules/planning/outline/openBook');
const {prepareOutlineHandoff} = require('../../../../dist/app/director/outlineOpening');
const {createDirectorProductionOptions} = require('../../../../dist/app/director/productionComposition');
const {readExecutionWindow} = require('../../../../dist/app/director/productionInputs');
const {readDirectorWorkspace} = require('../../../../dist/app/director/workspace');
const {createDirectorNextServices, FactIntegrityError} = require('../../../../dist/modules/director');
const {PrismaArtifactLedger} = require('../../../../dist/modules/director/infrastructure');
const {createDirectorNextRouter} = require('../../../../dist/modules/director/http');
const {errorHandler} = require('../../../../dist/middleware/errorHandler');
const {DIRECTOR_PLANNED_VOLUME_STATUSES} = require('../../../../dist/app/director/planning');

const outline = new OutlineOpenBookService(prisma, async () => {});
const options = createDirectorProductionOptions();
const services = createDirectorNextServices(options);
const runs = services.http.runRepository;
const ledger = new PrismaArtifactLedger();
let http, base;

test.before(async () => {
  await ensureRuntimeDatabaseReady();
  const app = express();
  app.use(express.json());
  app.use('/api/director-next', createDirectorNextRouter({...services.http, readWorkspace: readDirectorWorkspace}));
  app.use(errorHandler);
  http = app.listen(0, '127.0.0.1');
  await once(http, 'listening');
  base = `http://127.0.0.1:${http.address().port}/api/director-next`;
});

test.after(async () => {
  if (http) await new Promise(resolve => http.close(resolve));
  await prisma.$disconnect();
});

async function atSavedGate(name, chapterCount) {
  const document = createEmptyOutlineDocument('雾港');
  document.story.premise = '未来来信';
  document.chapters = Array.from({length: chapterCount}, (_, order) => ({
    nodeId: `c${order + 1}`, volumeNodeId: 'v', order, title: `来信 ${order + 1}`,
    summary: '作者章纲', purpose: '保留线索', planningDepth: 'rough', characterNodeIds: [], payoffNodeIds: [],
  }));
  document.volumes = [{nodeId: 'v', order: 0, title: '初来', summary: '作者卷纲', planningDepth: 'rough', chapterNodeIds: document.chapters.map(c => c.nodeId)}];
  const revisionId = `${name}-revision`;
  await prisma.outlineProject.create({data: {id: name, title: '雾港', currentVersion: 1, currentRevisionId: revisionId}});
  await prisma.outlineRevision.create({data: {id: revisionId, projectId: name, version: 1, sourceType: 'manual', documentJson: JSON.stringify(document)}});
  const input = {revisionId, expectedProjectVersion: 1, bookSettings: {title: '雾港', estimatedChapterCount: 3, defaultChapterLength: 3000}, volumeQuotas: {v: 3}, allowOptimize: []};
  const preview = await outline.preview(name, input);
  const binding = await outline.confirm(name, {...input, requestHash: preview.requestHash, idempotencyKey: `open-${name}`});
  const {novelId} = binding;
  const [{volumeId, planId, chapterId}] = binding.mapping.chapters;
  const volume = await prisma.volumePlan.findUniqueOrThrow({where: {id: volumeId}});
  assert.equal(volume.status, chapterCount === 3 ? 'chapter_list_generated' : 'chapter_list_partial');
  assert.equal(await prisma.volumeChapterPlan.count({where: {volumeId}}), chapterCount);

  const contract = options.contractFactory({runId: `run-${name}`, novelId, driver: 'assisted', stepIdsInScope: null,
    launchInput: {storyInput: '未来来信', estimatedChapterCount: 3, worldMode: 'skip', targetMode: 'opening',
      provider: 'openai', model: 'no-ai', executionRange: {from: 1, to: 1}},
  });
  await prepareOutlineHandoff(contract);
  assert.equal(contract.launchInput.targetVolumeId, volumeId);
  // Seed the model-dependent task sheet at its saved boundary. The production worker stays stopped.
  const plan = await prisma.volumeChapterPlan.update({where: {id: planId}, data: {taskSheet: '已保存的任务', sceneCards: '已保存的场景'}});
  await runs.open(contract);
  await runs.transition(contract.runId, {type: 'start'}, 0);
  await ledger.record({novelId, type: 'chapter_task_sheet', scope: contract.scope, status: 'draft',
    protectedUserContent: false, contentRef: `chapter_task_sheet:${planId}`, contentHash: 'fixture', producedByRunId: contract.runId});
  await runs.transition(contract.runId, {type: 'open_gate', gateId: 'chapter_detail_bundle', artifactTypes: ['chapter_task_sheet']}, 1);
  return {contract, novelId, volume, volumeId, plan, planId, chapterId};
}

async function atAutomaticActiveGate(name) {
  const novelId = `novel-${name}`, volumeId = `volume-${name}`, planId = `plan-${name}`, chapterId = `chapter-${name}`;
  await prisma.novel.create({data: {id: novelId, title: '普通自动导演', estimatedChapterCount: 3, directorVersion: 'v2'}});
  const version = await prisma.volumePlanVersion.create({data: {id: `version-${name}`, novelId, version: 1, status: 'active', contentJson: '{}'}});
  await prisma.volumePlan.create({data: {id: volumeId, novelId, sortOrder: 1, title: '第一卷', status: 'active', sourceVersionId: version.id,
    chapters: {create: {id: planId, chapterId, chapterOrder: 1, title: '第一章', summary: '路线', taskSheet: '已保存的任务', sceneCards: '已保存的场景'}}}});
  await prisma.chapter.create({data: {id: chapterId, novelId, order: 1, title: '第一章', content: ''}});
  const contract = options.contractFactory({runId: `run-${name}`, novelId, driver: 'auto', stepIdsInScope: null,
    launchInput: {storyInput: '故事', estimatedChapterCount: 3, worldMode: 'skip', targetMode: 'selected_volume', targetVolumeId: volumeId,
      provider: 'openai', model: 'no-ai', executionRange: {from: 1, to: 1}},
  });
  await runs.open(contract);
  await runs.transition(contract.runId, {type: 'start'}, 0);
  await ledger.record({novelId, type: 'chapter_task_sheet', scope: contract.scope, status: 'draft',
    protectedUserContent: false, contentRef: `chapter_task_sheet:${planId}`, contentHash: 'fixture', producedByRunId: contract.runId});
  await runs.transition(contract.runId, {type: 'open_gate', gateId: 'chapter_detail_bundle', artifactTypes: ['chapter_task_sheet']}, 1);
  return {contract, novelId, volume: await prisma.volumePlan.findUniqueOrThrow({where: {id: volumeId}}), volumeId,
    plan: await prisma.volumeChapterPlan.findUniqueOrThrow({where: {id: planId}}), planId, chapterId};
}

async function request(pathname, command) {
  const result = await fetch(base + pathname, command ? {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(command),
  } : undefined);
  return {status: result.status, body: await result.json()};
}

const run = f => request(`/runs/${f.contract.runId}`);
const current = f => request(`/novels/${f.novelId}/current`);
const workspace = f => request(`/novels/${f.novelId}/workspace`);
async function confirm(f, key, extra = {}) {
  const {runId} = f.contract;
  return request('/commands', {type: 'resolve_gate', runId, decision: 'confirm',
    expectedVersion: (await runs.getControl(runId)).version, idempotencyKey: `${runId}-${key}`, ...extra});
}

async function savedFacts(f) {
  return {
    volumes: await prisma.volumePlan.findMany({where: {novelId: f.novelId}, orderBy: {id: 'asc'}}),
    plans: await prisma.volumeChapterPlan.findMany({where: {volume: {novelId: f.novelId}}, orderBy: {id: 'asc'}}),
    versions: await prisma.volumePlanVersion.findMany({where: {novelId: f.novelId}, orderBy: {version: 'asc'}}),
    chapters: await prisma.chapter.findMany({where: {novelId: f.novelId}, orderBy: {order: 'asc'}}),
  };
}

async function gateFacts(f) {
  return {business: await savedFacts(f), control: await runs.getControl(f.contract.runId),
    artifacts: await ledger.listByNovel(f.novelId), events: await services.http.eventLog.list(f.contract.runId),
    commands: await prisma.directorNextCommand.findMany({where: {runId: f.contract.runId}}),
  };
}

async function assertGateRemainsBlocked(f) {
  const before = await gateFacts(f);
  const [detail, active, book] = await Promise.all([run(f), current(f), workspace(f)]);
  await assert.rejects(() => services.http.projectionService.get(f.contract.runId), error => error instanceof FactIntegrityError);
  assert.equal(detail.status, 500);
  assert.equal(active.status, 500);
  assert.equal(book.status, 200);
  assert.match(book.body.data.reviewContextError, /缺少唯一/);
  assert.ok(book.body.data.chapters.some(chapter => chapter.id === f.chapterId), 'identity failure must not hide saved chapter content');
  assert.deepEqual(await gateFacts(f), before, 'projection and workspace reads must not repair or mutate saved facts');
  const rejected = await confirm(f, 'rejected');
  assert.equal(rejected.status, 409, JSON.stringify(rejected.body));
  assert.match(rejected.body.error, /无法定位|缺少唯一/);
  assert.equal((await runs.getControl(f.contract.runId)).status, 'waiting_gate');
  assert.deepEqual(await gateFacts(f), before, 'failed confirmation must roll back the command and keep the gate open');
}

for (const [name, count] of [['partial-outline', 2], ['full-outline', 3]]) {
  test(`${name} exposes the saved chapter gate, confirms it and supplies the next execution plan`, async () => {
    const f = await atSavedGate(name, count);
    assert.ok(DIRECTOR_PLANNED_VOLUME_STATUSES.includes(f.volume.status));
    await prisma.volumePlan.create({data: {id: `archived-${name}`, novelId: f.novelId, sortOrder: 9, title: '归档卷', status: 'archived',
      chapters: {create: {id: `archived-plan-${name}`, chapterOrder: 1, title: '旧章', summary: '过期路线'}}}});
    const before = await gateFacts(f);
    const [detail, active, book] = await Promise.all([run(f), current(f), workspace(f)]);
    assert.deepEqual(await gateFacts(f), before, 'polling a saved gate is read-only');
    const accepted = await confirm(f, 'complete');
    // Keep both read and write statuses in the baseline failure output.
    assert.deepEqual([detail.status, active.status, accepted.status], [200, 200, 202], JSON.stringify({run: detail.body.error, current: active.body.error, confirm: accepted.body.error}));
    for (const view of [detail, active]) {
      assert.ok(view.body.data.availableActions.some(a => a.target === `/lab/director/${f.novelId}?review=chapter_task_sheet`));
    }
    assert.equal(book.status, 200);
    assert.equal(book.body.data.reviewContextError, null);
    assert.equal(book.body.data.planning.volumes.length, 1, 'archived stale volumes are excluded from the saved workspace');
    assert.deepEqual(book.body.data.reviewContexts[0], {type: 'chapter_task_sheet', novelId: f.novelId, runId: f.contract.runId,
      controlVersion: before.control.version, from: 1, to: 1, volumeId: f.volumeId, chapterId: f.planId});
    const planning = book.body.data.planning;
    assert.equal(planning.volumes[0].chapters[0].sceneCards, f.plan.sceneCards);
    const execution = await readExecutionWindow({contract: f.contract}, planning);
    assert.equal(execution.workspace.volumes[0].chapters[0].taskSheet, f.plan.taskSheet);
    assert.equal((await prisma.chapter.findUniqueOrThrow({where: {id: f.chapterId}})).content, '', 'saved planning must not be copied into an empty execution chapter');
    assert.equal((await runs.getControl(f.contract.runId)).status, 'running');
    assert.equal((await ledger.listByNovel(f.novelId)).find(a => a.type === 'chapter_task_sheet').status, 'confirmed');
    assert.deepEqual(await savedFacts(f), before.business, 'confirmation and preparing inputs preserve plan fields and empty execution rows');
  });
}

test('ordinary automatic director active volumes remain eligible for unique chapter confirmation', async () => {
  const f = await atAutomaticActiveGate('automatic-active');
  assert.equal(f.contract.driver, 'auto');
  assert.equal(f.volume.status, 'active');
  const [detail, active] = await Promise.all([run(f), current(f)]);
  assert.deepEqual([detail.status, active.status], [200, 200]);
  assert.equal(detail.body.data.availableActions.some(a => a.target === `/lab/director/${f.novelId}?review=chapter_task_sheet`), true);
  const accepted = await confirm(f, 'complete');
  assert.equal(accepted.status, 202, JSON.stringify(accepted.body));
  assert.equal((await runs.getControl(f.contract.runId)).status, 'running');
});

test('partial routes that preserve an active or generated base status remain eligible', async () => {
  const f = await atSavedGate('partial-prefixed', 2);
  for (const status of ['chapter_list_partial:active', 'chapter_list_partial:chapter_list_generated']) {
    await prisma.volumePlan.update({where: {id: f.volumeId}, data: {status}});
    const view = await run(f);
    assert.equal(view.status, 200, `${status} should retain its unique saved chapter route`);
  }
});

test('archived stale target volume cannot resolve the gate', async () => {
  const f = await atSavedGate('stale-only', 2);
  await prisma.volumePlan.update({where: {id: f.volumeId}, data: {status: 'archived'}});
  await assertGateRemainsBlocked(f);
});

test('two eligible volumes with the same chapter order remain a fact integrity failure', async () => {
  const f = await atSavedGate('duplicate-plan', 2);
  await prisma.volumePlan.create({data: {id: 'duplicate-current-volume', novelId: f.novelId, sortOrder: 2, title: '重复卷', status: 'chapter_list_partial',
    chapters: {create: {id: 'duplicate-current-plan', chapterOrder: 1, title: '冲突章', summary: '不能猜选'}}}});
  await assertGateRemainsBlocked(f);
});

test('a missing saved plan cannot resolve the gate or commit confirmation', async () => {
  const f = await atSavedGate('missing-plan', 2);
  await prisma.volumeChapterPlan.update({where: {id: f.planId}, data: {chapterOrder: 3}});
  await assertGateRemainsBlocked(f);
});
