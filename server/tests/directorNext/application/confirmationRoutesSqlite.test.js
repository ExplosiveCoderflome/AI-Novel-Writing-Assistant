const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

test('production confirmation routes locate the saved range in its own volume without writing facts', () => {
  const root = path.resolve(__dirname, '../../../..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'director-confirmation-routes-'));
  const script = path.join(dir, 'verify.cjs');
  fs.writeFileSync(script, String.raw`
const assert = require('node:assert/strict');
const path = require('node:path');
const server = path.join(process.env.DIRECTOR_NEXT_REPO_ROOT, 'server');
const Database = require(require.resolve('better-sqlite3', {paths: [server]}));
const {prisma} = require(path.join(server, 'dist/db/prisma'));
const {ensureRuntimeDatabaseReady} = require(path.join(server, 'dist/db/runtimeMigrations'));
const {createDirectorProductionOptions} = require(path.join(server, 'dist/app/director/productionComposition'));
const {createDirectorNextServices, FactIntegrityError} = require(path.join(server, 'dist/modules/director'));
const {PrismaRunRepository} = require(path.join(server, 'dist/modules/director/infrastructure'));
const {readDirectorWorkspace} = require(path.join(server, 'dist/app/director/workspace'));
const {NovelVolumeService} = require(path.join(server,'dist/services/novel/volume/NovelVolumeService'));
function snapshot() {
 const db = new Database(process.env.DATABASE_URL.slice(5), {readonly: true});
 try {return ['DirectorNextRun','DirectorNextRunControl','DirectorNextArtifact','DirectorNextEvent','DirectorNextCommand','DirectorNextQualityDebt',
  'Novel','VolumePlan','VolumeChapterPlan','Chapter'].map(table => ({table, rows: db.prepare('SELECT * FROM "'+table+'" ORDER BY rowid').all()}));}
 finally {db.close();}
}
(async () => {
 await ensureRuntimeDatabaseReady();
 await prisma.novel.createMany({data: [{id: 'book/中文?x=1', title: '本书'}, {id: 'other', title: '其他书'}]});
 const novelId = 'book/中文?x=1';
 await prisma.volumePlan.createMany({data: [
  {id: 'v-first', novelId, sortOrder: 1, title: '首卷'},
  {id: 'v/target?x=2', novelId, sortOrder: 2, title: '目标卷'},
  {id: 'v-other', novelId: 'other', sortOrder: 1, title: '其他书的卷'},
 ]});
 await prisma.chapter.createMany({data: [
  {id: 'c-first', novelId, order: 1, title: '首章', content: '保留首章正文'},
  {id: 'c/7?x=3', novelId, order: 7, title: '范围起点', content: '保留目标正文', taskSheet: '真正同步的任务', sceneCards: '真正同步的场景', targetWordCount: 2100, mustAvoid: '执行禁忌'},
  {id: 'c-other', novelId: 'other', order: 7, title: '其他书同章序', content: '其他书正文'},
 ]});
 await prisma.volumeChapterPlan.createMany({data: [
  {id: 'p-first', volumeId: 'v-first', chapterId: 'c-first', chapterOrder: 1, title: '首章', summary: '首章路线'},
  {id: 'p/7?x=4', volumeId: 'v/target?x=2', chapterId: 'c/7?x=3', chapterOrder: 7, title: '目标章', summary: '目标路线', taskSheet: '上游规划任务', sceneCards: '上游规划场景'},
  {id: 'p-other', volumeId: 'v-other', chapterId: 'c-other', chapterOrder: 7, title: '其他书', summary: '其他书路线'},
 ]});
 const planningBefore=snapshot();
 const savedPlanning=await new NovelVolumeService().getVolumes(novelId,{hydrateCanonical:false});
 assert.equal(savedPlanning.volumes.find(v=>v.id==='v/target?x=2').chapters[0].taskSheet,'上游规划任务','planning reads must retain the prepared source instead of copying execution');
 assert.deepEqual(snapshot(),planningBefore);
 const options = createDirectorProductionOptions();
 const services = createDirectorNextServices(options), runs = new PrismaRunRepository(prisma);
 const contract = options.contractFactory({runId: 'range-run', novelId, driver: 'assisted', stepIdsInScope: null,
  launchInput: {storyInput: '故事', estimatedChapterCount: 12, worldMode: 'skip', targetMode: 'opening', provider: 'openai', model: 'no-ai', executionRange: {from: 7, to: 8}}});
 await runs.open(contract); await runs.transition(contract.runId, {type: 'start'}, 0);
 for (const [type, chapterId, volumeId] of [
  ['chapter_task_sheet','p/7?x=4','v/target?x=2'],
  ['chapter_execution_contract','c/7?x=3','v/target?x=2'],
  ['chapter_batch_closed','c/7?x=3',null],
 ]) {
  const control = await runs.getControl(contract.runId);
  await runs.transition(contract.runId, {type: 'open_gate', gateId: type, artifactTypes: [type]}, control.version);
  const before = snapshot();
  for (let read = 0; read < 2; read++) {
   const book = await readDirectorWorkspace(novelId);
   const execution = book.executionPlans.find(row => row.id === 'c/7?x=3');
   assert.equal(execution.taskSheet,'真正同步的任务');
   assert.equal(execution.sceneCards,'真正同步的场景');
   assert.equal(execution.targetWordCount,2100);
   assert.equal(book.executionPlans.some(row=>row.id==='c-other'),false);
   const view = await services.http.projectionService.get(contract.runId);
   const action = view.availableActions.find(item => item.id === 'review:'+type);
   const url = new URL(action.target, 'https://local.test');
   assert.equal(url.pathname, '/lab/director/'+encodeURIComponent(novelId));
   assert.equal(url.searchParams.get('review'), type);
   assert.equal(url.searchParams.has('stage'), false);
   assert.deepEqual([...url.searchParams.keys()], ['review']);
   const context=book.reviewContexts.find(row=>row.type===type);
   assert.equal(context.from,7);assert.equal(context.to,8);
   assert.equal(context.chapterId,chapterId,'identity belongs in saved review context');
   assert.equal(context.volumeId??null,volumeId);
   assert.equal(context.runId,contract.runId);
   assert.equal(context.controlVersion,view.sourceTrace.controlVersion);
   assert.equal(url.searchParams.has('directorTaskId'), false);
   assert.equal(url.searchParams.has('workspaceTaskId'), false);
  }
  assert.deepEqual(snapshot(), before);
  await runs.transition(contract.runId, {type: 'resolve_gate'}, (await runs.getControl(contract.runId)).version);
 }
 // Missing or duplicate current-book mappings must not silently select a different chapter.
 await runs.transition(contract.runId, {type: 'open_gate', gateId: 'missing', artifactTypes: ['chapter_task_sheet']}, (await runs.getControl(contract.runId)).version);
 await prisma.volumeChapterPlan.update({where: {id: 'p/7?x=4'}, data: {chapterOrder: 9}});
 let before = snapshot();
 await assert.rejects(() => services.http.projectionService.get(contract.runId), error => error instanceof FactIntegrityError);
 const readable=await readDirectorWorkspace(novelId);
 assert.ok(readable.chapters.some(row=>row.id==='c/7?x=3'));
 assert.equal(readable.reviewContexts.length,0);assert.match(readable.reviewContextError,/缺少唯一/);
 assert.deepEqual(snapshot(), before);
 await prisma.volumeChapterPlan.update({where: {id: 'p/7?x=4'}, data: {chapterOrder: 7}});
 await prisma.volumeChapterPlan.create({data: {id: 'p-duplicate', volumeId: 'v-first', chapterOrder: 7, title: '冲突映射', summary: '不可猜测'}});
 before = snapshot();
 await assert.rejects(() => services.http.projectionService.get(contract.runId), error => error instanceof FactIntegrityError);
 assert.deepEqual(snapshot(), before);
 await prisma.$disconnect();
})().catch(async error => {console.error(error); await prisma.$disconnect(); process.exitCode = 1;});
`);
  execFileSync(process.execPath, [script], {cwd: root, env: {...process.env, NODE_ENV: 'test', AI_NOVEL_RUNTIME: 'desktop',
    AI_NOVEL_APP_DATA_DIR: dir, DIRECTOR_NEXT_REPO_ROOT: root, DATABASE_URL: 'file:'+path.join(dir, 'routes.db').replace(/\\/g, '/')}, stdio: 'pipe'});
});
