const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), {randomUUID} = require('node:crypto');
const {initializeTemporarySqliteDatabase} = require('../../testInfrastructure/tempSqliteDatabase.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'director-worker-recovery-'));
process.env.DATABASE_URL = initializeTemporarySqliteDatabase(directory, 'test.db');
process.env.NODE_ENV = 'test';process.env.AI_NOVEL_RUNTIME = 'desktop';process.env.AI_NOVEL_APP_DATA_DIR = directory;
const {prisma} = require('../../../dist/db/prisma');
const {withExecutionSignal, executionSignal} = require('../../../dist/platform/runtime/execution');
const {DirectorWorker, CommandService, ProjectionService, FactsLoader} = require('../../../dist/modules/director/application');
const {PrismaRunRepository, PrismaCommandRepository, PrismaArtifactLedger, PrismaQualityDebtRepository, PrismaEventLog} = require('../../../dist/modules/director/infrastructure');
const {createDirectorNextRouter} = require('../../../dist/modules/director/http');
const {createDirectorProductionOptions} = require('../../../dist/app/director/productionComposition');
const {contract, plan, artifactTypes} = require('../fixtures');
const runs = new PrismaRunRepository(), events = new PrismaEventLog();
let wakes = 0;
const commands = new CommandService({runRepository: runs,
  commandRepository: new PrismaCommandRepository(prisma, {beforeRetry: createDirectorProductionOptions().executionBoundary.beforeRetry}),
  runtime: {nextId: randomUUID, now: () => new Date()}, contractFactory: () => {throw Error('unexpected open');}, wakeWorker: () => wakes++});
let server, base;
test.before(async () => {
  const express = require('express'), app = express();app.use(express.json());
  app.use('/api/director-next', createDirectorNextRouter({commandService: commands, runRepository: runs, eventLog: events,
    projectionService: {get: async () => {throw Error('unexpected read');}}}));
  server = app.listen(0,'127.0.0.1');await new Promise(r => server.once('listening',r));
  base = 'http://127.0.0.1:' + server.address().port + '/api/director-next';
});
test.after(async () => {await new Promise(r => server.close(r));await prisma.$disconnect();});

async function book(status = 'queued') {
  const novelId = randomUUID(), runId = randomUUID();
  await prisma.novel.create({data: {id: novelId, title: '工作进程恢复', directorVersion: 'v2'}});
  await runs.open(contract({runId, novelId, executionEpoch: 0}));
  if (status !== 'queued') await prisma.directorNextRunControl.update({where: {runId}, data: {status,
    pauseJson: status === 'paused' ? JSON.stringify({kind: 'manual_recovery', reason: 'quality_first_pause'}) : null}});
  const chapter = await prisma.chapter.create({data: {novelId, title: '手动正文', order: 1, content: '作者保存的正文。'}});
  return {novelId, runId, chapter};
}
async function post(runId, key = randomUUID(), version = 0) {
  const response = await fetch(base + '/commands', {method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({type:'retry_start',runId,idempotencyKey:key,expectedVersion:version})});
  return {status: response.status, body: await response.json()};
}

test('HTTP retry_start preserves the original run and prose and is idempotent', async () => {
  const b = await book(), key = randomUUID(), beforeWakes = wakes;
  assert.equal((await post(b.runId,key)).status, 202);
  const current = await runs.getControl(b.runId);assert.equal(current.status,'queued');assert.equal(current.version,1);
  assert.equal((await post(b.runId,key)).status,202);
  assert.equal(await prisma.directorNextCommand.count({where:{runId:b.runId}}),1);
  assert.equal(await prisma.directorNextRun.count({where:{novelId:b.novelId}}),1);
  assert.equal((await prisma.chapter.findUnique({where:{id:b.chapter.id}})).content,b.chapter.content);
  assert.equal(wakes,beforeWakes+2);
});

test('retry cannot steal a live lease or clear paused, gated or terminal work', async () => {
  const leased = await book();
  await runs.acquireLease(leased.runId,'foreign',new Date(Date.now()+60000),new Date());
  const before = await prisma.directorNextRunControl.findUnique({where:{runId:leased.runId}});
  assert.equal((await post(leased.runId)).status,409);
  assert.deepEqual(await prisma.directorNextRunControl.findUnique({where:{runId:leased.runId}}),before);
  for (const status of ['paused','waiting_gate','running','completed','failed','cancelled']) {
    const b = await book(status), row = await prisma.directorNextRunControl.findUnique({where:{runId:b.runId}});
    assert.equal((await post(b.runId)).status,400,status);
    assert.deepEqual(await prisma.directorNextRunControl.findUnique({where:{runId:b.runId}}),row);
    assert.equal(await prisma.directorNextCommand.count({where:{runId:b.runId}}),0);
  }
});

test('expired leases may be requeued while stale versions and epochs remain fenced', async () => {
  const b = await book();
  await runs.acquireLease(b.runId,'old',new Date(Date.now()-1),new Date(Date.now()-100));
  assert.equal((await post(b.runId)).status,202);
  assert.equal((await prisma.directorNextRunControl.findUnique({where:{runId:b.runId}})).leaseOwner,null);
  assert.equal(await runs.heartbeat(b.runId,'old',new Date(Date.now()+30000),new Date()),false);
  await runs.acquireLease(b.runId,'new-owner',new Date(Date.now()+30000),new Date());
  await runs.releaseLease(b.runId,'old');
  assert.equal((await prisma.directorNextRunControl.findUnique({where:{runId:b.runId}})).leaseOwner,'new-owner');
  assert.equal((await post(b.runId,randomUUID(),0)).status,409);
  const stale = await book();await prisma.novel.update({where:{id:stale.novelId},data:{directorEpoch:1}});
  assert.equal((await post(stale.runId)).status,409);
  assert.equal(await prisma.directorNextCommand.count({where:{runId:stale.runId}}),0);
});

test('queued projection reveals scheduler failure and stays read-only', async () => {
  const b = await book(), before = await prisma.directorNextRunControl.findUnique({where:{runId:b.runId}});
  let health = {state:'stopped',activeRunId:null,lastPollAt:null};
  const projection = new ProjectionService({factsLoader: new FactsLoader({runRepository:runs, eventLog:events,
    artifactLedger:new PrismaArtifactLedger(),qualityDebtRepository:new PrismaQualityDebtRepository()}),
    planRegistry:{get:()=>plan},artifactTypes,readScheduling:id=>runs.getSchedulingState(id),readWorkerHealth:()=>health});
  const stopped = await projection.get(b.runId);
  assert.equal(stopped.mode,'queued');assert.equal(stopped.workerStatus.canRetry,true);
  assert.ok(stopped.availableActions.some(a=>a.command==='retry_start'));
  assert.deepEqual(await prisma.directorNextRunControl.findUnique({where:{runId:b.runId}}),before);
  health={state:'working',activeRunId:'another-book',lastPollAt:new Date()};
  assert.match((await projection.get(b.runId)).headline,/其他作品/);
  assert.equal((await projection.get(b.runId)).workerStatus.canRetry,false);
  await runs.acquireLease(b.runId,'foreign',new Date(Date.now()+60000),new Date());
  assert.equal((await projection.get(b.runId)).workerStatus.canRetry,false);
});

test('revoked executions cannot write prose or finish an open transaction; billing facts and manual writes remain available', async () => {
  const b = await book(), cancelled = new AbortController();cancelled.abort(Error('revoked'));
  await assert.rejects(withExecutionSignal(cancelled.signal,()=>prisma.chapter.update({where:{id:b.chapter.id},data:{content:'旧执行覆盖'}})),/revoked/);
  const controller = new AbortController();
  await assert.rejects(withExecutionSignal(controller.signal,()=>prisma.$transaction(async tx=>{
    await tx.chapter.update({where:{id:b.chapter.id},data:{content:'事务中间结果'}});controller.abort(Error('lost'));
    await tx.chapter.update({where:{id:b.chapter.id},data:{title:'不得提交'}});
  })),/lost/);
  assert.equal((await prisma.chapter.findUnique({where:{id:b.chapter.id}})).content,b.chapter.content);
  const id = randomUUID();
  await withExecutionSignal(cancelled.signal,()=>prisma.llmInvocationUsageRecord.create({data:{id,requestProtocol:'openai',status:'partial',
    startedAt:new Date(),finishedAt:new Date(),totalTokens:17,cacheUsageStatus:'unavailable'}}));
  assert.equal((await prisma.llmInvocationUsageRecord.findUnique({where:{id}})).totalTokens,17);
  await prisma.chapter.update({where:{id:b.chapter.id},data:{content:'新的作者手动保存'}});
  assert.equal((await prisma.chapter.findUnique({where:{id:b.chapter.id}})).content,'新的作者手动保存');
});

test('a real leased Worker cannot publish late prose after a rejected heartbeat', {timeout:3000}, async () => {
  const b = await book(), actual = new PrismaRunRepository();let fenced = false;
  const worker = new DirectorWorker({executionScope:withExecutionSignal,runtime:{nextId:randomUUID,now:()=>new Date(),workerId:()=>randomUUID(),leaseExpiresAt:n=>new Date(n.getTime()+500)},
    heartbeatMs:3, onError:()=>{},canExecute:async id=>id===b.runId,
    runRepository:{...Object.fromEntries(['listLeaseCandidates','acquireLease','releaseLease','getControl','transition'].map(name=>[name,actual[name].bind(actual)])),heartbeat:async()=>false},
    executor:{runOnce:async()=>{
      const signal=executionSignal();await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));
      await assert.rejects(prisma.chapter.update({where:{id:b.chapter.id},data:{content:'旧执行的迟到结果'}}));fenced=true;
      signal.throwIfAborted();
    }}});
  const keepAlive=setInterval(()=>{},1000);
  try {assert.equal(await worker.tick(),false);} finally {clearInterval(keepAlive);}
  assert.equal(fenced,true);assert.equal((await prisma.chapter.findUnique({where:{id:b.chapter.id}})).content,b.chapter.content);
});

test('new book progresses from queued to a saved stage after a transient polling fault', {timeout:10000}, async t => {
  const {createDirectorNextServices} = require('../../../dist/modules/director');
  const {StepRegistry} = require('../../../dist/modules/director/application');
  const novelId = randomUUID();await prisma.novel.create({data:{id:novelId,title:'排队恢复演练'}});
  const registry = new StepRegistry();let executed = 0, polls = 0;
  registry.register('story_macro',async context=>{
    executed++;await prisma.novel.update({where:{id:novelId},data:{description:'有效执行保存的故事规划'}});
    return {artifact:{scope:'book',status:'draft',protectedUserContent:false,contentRef:'saved-plan',contentHash:'saved'}};
  });
  const services = createDirectorNextServices({plan,stepRegistry:registry,
    contractFactory: input=>contract({...input,planVersion:plan.version}),
    prepareOpen: async ()=>[{type:'novel_seed',scope:'book',status:'confirmed',protectedUserContent:true,contentRef:'seed',contentHash:'seed'}]});
  const list = PrismaRunRepository.prototype.listLeaseCandidates;
  t.mock.method(PrismaRunRepository.prototype,'listLeaseCandidates',async function(...args){
    if (++polls === 1) throw Error('temporary polling failure');return list.apply(this,args);
  });
  t.mock.method(console,'error',()=>{});
  const opened=await services.http.commandService.execute({type:'open_run',novelId,driver:'auto',stepIdsInScope:['story_macro'],idempotencyKey:randomUUID()});
  assert.equal((await runs.getControl(opened.runId)).status,'queued');
  const loop=services.worker.start();
  try {
    const deadline=Date.now()+7000;
    while ((await runs.getControl(opened.runId)).status!=='completed' && Date.now()<deadline) await new Promise(r=>setTimeout(r,10));
    assert.equal((await runs.getControl(opened.runId)).status,'completed');assert.equal(executed,1);
    assert.equal((await prisma.novel.findUnique({where:{id:novelId}})).description,'有效执行保存的故事规划');
    assert.equal(await prisma.directorNextArtifact.count({where:{novelId,type:'story_macro'}}),1);
  } finally {services.worker.stop();await loop;}
});
