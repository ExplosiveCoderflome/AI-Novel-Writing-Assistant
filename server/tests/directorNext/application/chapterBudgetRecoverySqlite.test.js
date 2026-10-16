const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');

test('chapter budget authorization and resume commit atomically, replay after restart, and preserve prose and usage',()=>{
 const root=path.resolve(__dirname,'../../../..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'chapter-budget-recovery-'));
 const script=path.join(dir,'worker.cjs');
 fs.writeFileSync(script,String.raw`
const assert=require('node:assert/strict'),path=require('node:path');
const server=path.join(process.env.DIRECTOR_NEXT_REPO_ROOT,'server');
const {prisma}=require(path.join(server,'dist/db/prisma'));
const {ensureRuntimeDatabaseReady}=require(path.join(server,'dist/db/runtimeMigrations'));
const {PrismaRunRepository,PrismaCommandRepository}=require(path.join(server,'dist/modules/director/infrastructure'));
const {CommandService}=require(path.join(server,'dist/modules/director/application'));
const {resumeBusiness}=require(path.join(server,'dist/app/director/savedContent'));
const {contract}=require(path.join(server,'tests/directorNext/fixtures'));
const runs=new PrismaRunRepository(prisma),commands=new PrismaCommandRepository(prisma,{resumeBusiness});
let seq=0;
const service=new CommandService({runRepository:runs,commandRepository:commands,runtime:{nextId:()=>process.argv[2]+'-'+(++seq)},contractFactory:contract});
const grant={jobId:'job',chapterId:'c3',metric:'raw_tokens_v1',tokenLimit:122000};
const command={type:'resume',runId:'run',expectedVersion:2,idempotencyKey:'grant-once',chapterBudget:grant};
(async()=>{
 if(process.argv[2]==='create'){
  await ensureRuntimeDatabaseReady();
  await prisma.novel.create({data:{id:'book',title:'预算恢复测试'}});
  await prisma.chapter.create({data:{id:'c3',novelId:'book',order:3,title:'第三章',content:'用户保存的正文'}});
  const snapshot={runId:'run',decisions:[{issueCode:'runtime.token_budget_exceeded',chapterOrder:3,action:'pause_for_manual',
   reason:'预检暂停',locked:true,policySource:'safety',retryExhaustedAction:'pause_for_manual'}],
   chapterUsage:[{chapterId:'c3',chapterOrder:3,startJobTokens:50000,totalTokens:89892,budgetPause:{reserveTokens:16000,stage:'review'}}]};
  await prisma.generationJob.create({data:{id:'job',novelId:'book',startOrder:3,endOrder:3,status:'queued',pendingManualRecovery:true,
   retryCount:1,totalTokens:142892,promptTokens:113000,completionTokens:29892,payload:JSON.stringify({directorNext:snapshot})}});
  await runs.open(contract({runId:'run',novelId:'book',chapterRange:{from:3,to:3}}));
  await runs.transition('run',{type:'start'},0);
  await runs.transition('run',{type:'pause',pause:{kind:'manual_recovery',reason:'预算预检暂停'}},1);
  await prisma.directorNextEvent.create({data:{id:'run:1',runId:'run',seq:1,type:'chapter_batch_job',payloadJson:JSON.stringify({jobId:'job'})}});
  await prisma.directorNextEvent.create({data:{id:'run:2',runId:'run',seq:2,type:'stop_signal',payloadJson:JSON.stringify({kind:'manual_recovery',reason:'预算预检暂停',source:'runtime'})}});
  const before=await prisma.generationJob.findUniqueOrThrow({where:{id:'job'}});
  const rollbackService=new CommandService({runRepository:runs,
   commandRepository:new PrismaCommandRepository(prisma,{resumeBusiness:async(...args)=>{await resumeBusiness(...args);throw Error('fault after allowance write');}}),
   runtime:{nextId:()=> 'rollback-id'},contractFactory:contract});
  await assert.rejects(rollbackService.execute({...command,idempotencyKey:'rollback'}),/fault after allowance write/);
  const {readProductionProjection}=require(path.join(server,'dist/app/director/projections/productionProgress'));
  const projection=await readProductionProjection({contract:await runs.getContract('run'),control:await runs.getControl('run')});
  assert.equal(projection.chapterBudget.usedTokens,92892);assert.equal(projection.chapterBudget.reserveTokens,16000);
  await assert.rejects(service.execute({...command,chapterBudget:undefined,idempotencyKey:'no-grant'}),error=>error.statusCode===400);
  for(const [key,bad] of [['low',{...grant,tokenLimit:105892}],['stale-usage',{...grant,tokenLimit:106000}],['foreign-job',{...grant,jobId:'foreign'}],
   ['foreign-chapter',{...grant,chapterId:'c2'}],['metric',{...grant,metric:'uncached_tokens_v1'}]]){
   await assert.rejects(service.execute({...command,idempotencyKey:key,chapterBudget:bad}),error=>error.statusCode===400);
  }
  await assert.rejects(service.execute({...command,expectedVersion:1,idempotencyKey:'stale'}),error=>error.statusCode===409);
  assert.deepEqual(await prisma.generationJob.findUniqueOrThrow({where:{id:'job'}}),before);
  assert.equal(await prisma.directorNextCommand.count(),0);
  assert.equal((await runs.getControl('run')).status,'paused');
  const result=await service.execute(command);assert.equal(result.controlVersion,3);
 }
 const replay=await service.execute(command);assert.equal(replay.replayed,true);
 await assert.rejects(service.execute({...command,chapterBudget:{...grant,tokenLimit:140000}}),error=>error.statusCode===400);
 const job=await prisma.generationJob.findUniqueOrThrow({where:{id:'job'}}),snapshot=JSON.parse(job.payload).directorNext;
 assert.equal(job.totalTokens,142892);assert.equal(job.retryCount,1);assert.equal(job.pendingManualRecovery,false);
 assert.equal(snapshot.chapterUsage[0].tokenLimit,122000);assert.equal(snapshot.chapterUsage[0].startJobTokens,50000);
 assert.equal(snapshot.chapterUsage[0].totalTokens,92892);assert.equal(snapshot.decisions.length,1);assert.equal(snapshot.resolvedDecisionCount,1);
 assert.equal((await prisma.chapter.findUniqueOrThrow({where:{id:'c3'}})).content,'用户保存的正文');
 assert.equal((await runs.getControl('run')).status,'running');
 assert.equal(await prisma.directorNextCommand.count(),1);
 assert.equal(await prisma.directorNextEvent.count({where:{runId:'run',type:'chapter_budget_granted'}}),1);
 const savedContract=await runs.getContract('run');assert.equal(savedContract.tokenBudget,null);
 await prisma.$disconnect();
})().catch(async error=>{console.error(error);await prisma.$disconnect();process.exitCode=1;});
`);
 const env={...process.env,NODE_ENV:'test',AI_NOVEL_RUNTIME:'desktop',AI_NOVEL_APP_DATA_DIR:dir,
  DIRECTOR_NEXT_REPO_ROOT:root,DATABASE_URL:'file:'+path.join(dir,'budget.db').replace(/\\/g,'/')};
 for(const mode of ['create','restart']){
  const result=spawnSync(process.execPath,[script,mode],{cwd:root,env,encoding:'utf8',timeout:60000});
  assert.equal(result.status,0,result.stderr+'\n'+result.stdout);
 }
});
