const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const {spawnSync}=require('node:child_process');

test('a second worker waits for the pipeline lease then resumes the same batch without rewriting closed chapters',()=>{
 const root=path.resolve(__dirname,'../../../..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'director-batch-recovery-'));
 const script=path.join(dir,'worker.cjs');
 fs.writeFileSync(script,String.raw`
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const server=path.join(process.env.DIRECTOR_NEXT_REPO_ROOT,'server'),fixture=process.env.BATCH_RECOVERY_FIXTURE,mode=process.argv[2];
const {prisma}=require(path.join(server,'dist/db/prisma'));
const {ensureRuntimeDatabaseReady}=require(path.join(server,'dist/db/runtimeMigrations'));
const {createDirectorNextServices,createChapterBatchStepHandler,PrismaEventLog}=require(path.join(server,'dist/modules/director'));
const {definePlan}=require(path.join(server,'dist/modules/director/domain'));
const {StepRegistry}=require(path.join(server,'dist/modules/director/application'));
const {NovelCorePipelineService}=require(path.join(server,'dist/services/novel/novelCorePipelineService'));
const {NovelPipelineExecutor}=require(path.join(server,'dist/services/novel/production/NovelPipelineExecutor'));
const {readBatchOutcome}=require(path.join(server,'dist/app/director/batchOutcome'));
const {stringifyPipelinePayload}=require(path.join(server,'dist/services/novel/pipelineJobState'));
const {buildChapterArtifactContentHash,CHAPTER_ARTIFACT_BOUNDARY_TYPE}=require(path.join(server,'dist/services/novel/runtime/artifactSync'));
const {DIRECTOR_ISSUE_POLICY_PRESETS}=require('node:module').createRequire(path.join(server,'package.json'))('@ai-novel/shared/types/directorIssue');
const policy=DIRECTOR_ISSUE_POLICY_PRESETS.find(item=>item.id==='finish_full_book').policy;
require(path.join(server,'dist/events')).novelEventBus.emit=async()=>{};
require(path.join(server,'dist/prompting/core/promptRunner')).runStructuredPrompt=async()=>{throw Error('recovery test must not invoke AI');};
require(path.join(server,'dist/services/novel/planning/ChapterRouteWindowService')).ChapterRouteWindowService.prototype.ensureRouteWindow=async()=>({availableRouteCount:2,extended:false});
const plan=definePlan({version:'batch-recovery-v1',externalArtifacts:['novel_seed'],steps:[
 {id:'chapter_batch',label:'正文',requires:['novel_seed'],produces:'chapter_batch_closed',needs:[],gateable:true,overwrites:[]}]});
const pipeline=new NovelCorePipelineService();
pipeline.pipelineExecutor=new NovelPipelineExecutor({runPipelineChapter:async(_novelId,id)=>{
 const file=path.join(fixture,'calls.json'),calls=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
 calls[id]=(calls[id]??0)+1;fs.writeFileSync(file,JSON.stringify(calls));
 if(mode==='crash'&&id==='c2')process.exit(74);
 const content='已保存的'+id+'正文';
 await prisma.chapter.update({where:{id},data:{content,generationState:'approved'}});
 await prisma.chapterArtifactSyncCheckpoint.create({data:{novelId:'book',chapterId:id,contentHash:buildChapterArtifactContentHash(content),artifactType:CHAPTER_ARTIFACT_BOUNDARY_TYPE,syncMode:'production',status:'succeeded',metadataJson:JSON.stringify({outcome:'completed'})}});
 return {retryCountUsed:0,reviewExecuted:false,pass:true,score:{},issues:[]};
}});
let polls=0,services,jobBefore;
const registry=new StepRegistry();
registry.register('chapter_batch',createChapterBatchStepHandler({inputProvider:async()=>({startOrder:1,endOrder:2}),pipelineService:pipeline,
 jobBinding:{get:async runId=>{const event=await prisma.directorNextEvent.findFirst({where:{runId,type:'chapter_batch_job'}});return event?JSON.parse(event.payloadJson).jobId:null;},save:async()=>assert.fail('bound batch must not be replaced')},
 readOutcome:readBatchOutcome,isRunActive:async runId=>(await prisma.directorNextRunControl.findUniqueOrThrow({where:{runId}})).status==='running',contentHash:()=> 'closed-batch',
 waitForPoll:async()=>{
  if(mode==='recover'&&++polls===1){
   assert.deepEqual(await prisma.generationJob.findUniqueOrThrow({where:{id:'job'}}),jobBefore,'a live foreign pipeline lease must not be modified');
   await prisma.generationJob.update({where:{id:'job'},data:{executionLeaseExpiresAt:new Date(Date.now()-1000)}});
  }
  if(polls>100)throw Error('batch recovery remained stuck');
  await new Promise(resolve=>setTimeout(resolve,10));
 }}));
services=createDirectorNextServices({plan,stepRegistry:registry,
 contractFactory:input=>({runId:input.runId,novelId:input.novelId,driver:'auto',planVersion:plan.version,scope:'chapters:1-2',stepIdsInScope:null,chapterRange:{from:1,to:2},modelConfig:{route:'openai',model:'snapshot-no-ai',version:'v1'},issuePolicy:{mode:'completion_first',version:'v1',pipelinePolicy:policy},tokenBudget:null,rejectionBudget:3}),
 prepareOpen:async()=>[{type:'novel_seed',scope:'chapters:1-2',status:'confirmed',protectedUserContent:true,contentRef:'seed',contentHash:'seed'}]});
const protectedState=async()=>({legacy:await prisma.novelWorkflowTask.findMany({orderBy:{id:'asc'}}),commands:await prisma.directorRunCommand.findMany({orderBy:{id:'asc'}}),outside:await prisma.chapter.findUnique({where:{id:'outside'}}),paused:await prisma.generationJob.findUnique({where:{id:'paused-job'}})});
(async()=>{
 if(mode==='crash'){
  await ensureRuntimeDatabaseReady();await prisma.novel.create({data:{id:'book',title:'正文中断恢复'}});
  await prisma.novel.create({data:{id:'paused-book',title:'人工暂停'}});
  for(const order of [1,2])await prisma.chapter.create({data:{id:'c'+order,novelId:'book',order,title:'章节'+order,content:''}});
  await prisma.chapter.create({data:{id:'outside',novelId:'book',order:3,title:'范围外正文',content:'作者正文必须保留'}});
  await prisma.novelWorkflowTask.create({data:{id:'legacy',novelId:'book',lane:'auto_director',title:'旧任务',status:'running',seedPayloadJson:'invalid seed',pendingManualRecovery:true}});
  await prisma.directorRunCommand.create({data:{id:'legacy-command',taskId:'legacy',commandType:'continue',status:'queued',idempotencyKey:'legacy'}});
  await prisma.generationJob.create({data:{id:'paused-job',novelId:'paused-book',startOrder:1,endOrder:2,status:'queued',pendingManualRecovery:true}});
  const opened=await services.http.commandService.execute({type:'open_run',novelId:'book',driver:'auto',stepIdsInScope:null,idempotencyKey:'batch'});
  const payload={startOrder:1,endOrder:2,autoReview:false,autoRepair:false,skipCompleted:true,maxRetries:1,provider:'openai',model:'snapshot-no-ai',issueGovernanceVersion:1,issuePolicySnapshot:policy,directorNext:{runId:opened.runId,decisions:[]}};
  await prisma.generationJob.create({data:{id:'job',novelId:'book',startOrder:1,endOrder:2,totalCount:2,autoReview:false,autoRepair:false,status:'running',payload:stringifyPipelinePayload(payload)}});
  await new PrismaEventLog().append({runId:opened.runId,type:'chapter_batch_job',payload:{jobId:'job'}});
  fs.writeFileSync(path.join(fixture,'run.json'),JSON.stringify({runId:opened.runId}));
  fs.writeFileSync(path.join(fixture,'protected.json'),JSON.stringify(await protectedState()));
  await services.worker.tick();throw Error('worker missed crash boundary');
 }
 const {runId}=JSON.parse(fs.readFileSync(path.join(fixture,'run.json'),'utf8'));
 const firstChapter=await prisma.chapter.findUniqueOrThrow({where:{id:'c1'}});
 assert.equal(firstChapter.content,'已保存的c1正文');
 assert.equal((await prisma.generationJob.findUniqueOrThrow({where:{id:'job'}})).status,'running');
 assert.equal(await services.worker.tick(),false,'director lease must remain exclusive');
 await prisma.directorNextRunControl.update({where:{runId},data:{leaseExpiresAt:new Date(Date.now()-1000)}});
 jobBefore=await prisma.generationJob.findUniqueOrThrow({where:{id:'job'}});
 assert.ok(jobBefore.executionOwner);assert.ok(jobBefore.executionLeaseExpiresAt>new Date());
 assert.equal(await services.worker.tick(),true);
 assert.equal(await services.worker.tick(),true);
 assert.equal((await prisma.directorNextRunControl.findUniqueOrThrow({where:{runId}})).status,'completed');
 const job=await prisma.generationJob.findUniqueOrThrow({where:{id:'job'}});
 assert.equal(job.status,'succeeded');assert.equal(job.completedCount,2);assert.equal(job.progress,1);
 assert.equal(await prisma.generationJob.count({where:{novelId:'book'}}),1);
 assert.deepEqual(await prisma.chapter.findUniqueOrThrow({where:{id:'c1'}}),firstChapter);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixture,'calls.json'),'utf8')),{c1:1,c2:2});
 assert.deepEqual(JSON.parse(JSON.stringify(await protectedState())),JSON.parse(fs.readFileSync(path.join(fixture,'protected.json'),'utf8')));
 assert.equal(await prisma.directorNextArtifact.count({where:{producedByRunId:runId,type:'chapter_batch_closed'}}),1);
 await prisma.$disconnect();
})().catch(async error=>{console.error(error);await prisma.$disconnect();process.exitCode=1;});
`);
 const env={...process.env,NODE_ENV:'test',AI_NOVEL_RUNTIME:'desktop',AI_NOVEL_APP_DATA_DIR:dir,DIRECTOR_NEXT_REPO_ROOT:root,BATCH_RECOVERY_FIXTURE:dir,DATABASE_URL:'file:'+path.join(dir,'batch.db').replace(/\\/g,'/')};
 const first=spawnSync(process.execPath,[script,'crash'],{cwd:root,env,encoding:'utf8',timeout:30000});
 assert.equal(first.status,74,first.stderr+'\n'+first.stdout);
 const second=spawnSync(process.execPath,[script,'recover'],{cwd:root,env,encoding:'utf8',timeout:30000});
 assert.equal(second.status,0,second.stderr+'\n'+second.stdout);
});
