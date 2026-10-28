const test=require('node:test'),assert=require('node:assert/strict');
const {fixture:base}=require('./batch/fixture.cjs');
const {request,hash}=require('./application/harness.cjs');
// Recovery invariants use synthetic providers; real configuration validation has its own SQLite suite.
test.mock.method(require('../../dist/app/director/productionKernel/readiness/models'),'inspectKernelModels',async()=>({ready:true}));
async function fixture(t,kind='budget') {
 const f=await base(t);f.contract.launchInput={chapterTokenLimit:100};
 await f.db.directorNextRun.update({where:{id:f.contract.runId},data:{contractJson:JSON.stringify(f.contract)}});
 await f.api.chooseProductionBatchImplementation(f.db,f.context,true);
 const {PrismaUnitProgressStore}=require('../../dist/modules/production');
 const store=new PrismaUnitProgressStore(f.db,{assertOwnership:f.api.createKernelOwnership(f.context)});
 const req=request({ownerKey:f.api.productionBatchOwnerKey(f.contract.runId)}),run=await store.loadOrCreate(req);
 const descriptor={callsModel:true,outputTokens:40,inputFingerprint:'saved-input',promptVersion:'v1',configVersion:'v1'};
 const progress=kind==='quality'?{...run.progress,completed:['prepare','draft','accept','commit'],original:{contentHash:hash('saved')},
  selected:'original',selectedContentHash:hash('saved'),committedContentHash:hash('saved'),
  qualityPause:{contentHash:hash('saved'),reason:'blocking_quality_policy',acknowledged:false}}:run.progress;
 await f.db.productionUnitRun.update({where:{id:run.id},data:{progressJson:JSON.stringify(progress),
  stageArtifactsJson:JSON.stringify({...run.artifacts,...(kind==='budget'?{deferredDescriptor:{stage:'draft',descriptor}}:{})})}});
 if(kind==='quality')await f.db.chapter.update({where:{id:'chapter-1'},data:{content:'saved'}});
 const budget=f.api.createKernelChapterBudget(f.db,f.context),unit=req.unit;
 if(kind==='budget'){
  await budget.reserve(unit,'paid',80);
  await budget.observe(unit,'paid',{invocationId:'paid',runId:f.contract.runId,novelId:'novel-1',chapterId:'chapter-1',
   status:'completed',usage:{totalTokens:80},startedAt:new Date(0),finishedAt:new Date(1)});
  assert.equal(await budget.reserve(unit,'next-physical',40),false);
 }
 await f.db.directorNextRunControl.update({where:{runId:f.contract.runId},data:{status:'paused',cursorStepId:null,
  pauseJson:JSON.stringify({kind:'manual_recovery',reason:'saved structured pause'})}});
 const {PrismaCommandRepository}=require('../../dist/modules/director/infrastructure');
 const {resumeBusiness,cancelBusiness}=require('../../dist/app/director/savedContent');
 const command=(extra={})=>({id:'resume',idempotencyKey:'resume-once',type:'resume',runId:f.contract.runId,expectedVersion:2,
  event:{type:'resume'},...extra});
 const grant={jobId:run.id,chapterId:'chapter-1',metric:'uncached_tokens_v1',tokenLimit:180};
 return {...f,run,unit,budget,grant,command,repo:new PrismaCommandRepository(f.db,{resumeBusiness,cancelBusiness}),
  makeRepo:options=>new PrismaCommandRepository(f.db,options),resumeBusiness};
}
for(const remaining of [false,true])test(`kernel budget grant is atomic, replayable and scoped (${remaining?'remaining':'one chapter'})`,async t=>{
 const f=await fixture(t),grant={...f.grant,applyToRemaining:remaining};
 if(remaining)grant.tokenLimit=17000;
 assert.equal(typeof f.api.readKernelPausedChapterBudget,'function');
 const control={status:'paused',pause:{kind:'manual_recovery'}};
 const before=await f.db.productionUnitRun.findUnique({where:{id:f.run.id}});
 const receipts=await f.db.chapterArtifactSyncCheckpoint.findMany();
 const view=await f.api.readKernelPausedChapterBudget(f.db,f.contract,control);
 assert.deepEqual(await f.db.chapterArtifactSyncCheckpoint.findMany(),receipts);
 assert.equal(view.jobId,f.run.id);assert.equal(view.usedTokens,80);assert.equal(view.reserveTokens,40);
 assert.equal(view.metric,'uncached_tokens_v1');assert.equal(view.tokenLimit,100);
 await assert.rejects(f.repo.transition(f.command()),/额度|预算/);
 for(const bad of [{...grant,tokenLimit:120},{...grant,jobId:'foreign'},{...grant,chapterId:'foreign'},
  {...grant,metric:'raw_tokens_v1'}])await assert.rejects(f.repo.transition(f.command({chapterBudget:bad})),/额度|预算|口径/);
 const rollback=f.makeRepo({resumeBusiness:async(...args)=>{await f.resumeBusiness(...args);throw Error('after business recovery');}});
 await assert.rejects(rollback.transition(f.command({chapterBudget:grant})),/after business recovery/);
 assert.equal((await f.db.directorNextRunControl.findUnique({where:{runId:f.contract.runId}})).status,'paused');
 assert.equal(await f.db.directorNextEvent.count({where:{type:'chapter_budget_granted'}}),0);
 await assert.rejects(f.repo.transition(f.command({expectedVersion:1,chapterBudget:grant})),/version conflict/);
 const input=f.command({chapterBudget:grant,payload:{type:'resume',runId:f.contract.runId,expectedVersion:2,chapterBudget:grant}});
 const result=await f.repo.transition(input);assert.equal(result.control.status,'running');
 assert.equal((await f.repo.transition(input)).replayed,true);
 await assert.rejects(f.repo.transition({...input,payload:{...input.payload,chapterBudget:{...grant,tokenLimit:grant.tokenLimit+1000}}}),/预算授权/);
 assert.deepEqual(await f.db.productionUnitRun.findUnique({where:{id:f.run.id}}),before);
 assert.equal(await f.db.generationJob.count(),0);
 const budget=f.api.createKernelChapterBudget(f.db,f.context);
 assert.equal((await budget.read(f.unit)).limit,grant.tokenLimit);
 const databases=await f.db.$queryRawUnsafe('PRAGMA database_list');
 const restarted=require('node:child_process').spawnSync(process.execPath,[require('node:path').join(__dirname,'recovery/readBudget.cjs'),databases.find(row=>row.name==='main').file],
  {input:JSON.stringify({context:f.context,unit:f.unit}),encoding:'utf8',timeout:15000});
 assert.equal(restarted.status,0,restarted.stderr);assert.equal(JSON.parse(restarted.stdout).limit,grant.tokenLimit);
 assert.equal(JSON.parse(restarted.stdout).used,80);
 await f.db.chapter.create({data:{id:'chapter-2',novelId:'novel-1',order:2,title:'二'}});
 assert.equal((await budget.read({...f.unit,chapterId:'chapter-2',order:2})).limit,remaining?grant.tokenLimit:100);
 assert.equal((await f.db.directorNextRun.findUnique({where:{id:f.contract.runId}})).contractJson,JSON.stringify(f.contract));
 await assert.rejects(budget.reserve(f.unit,'stale-worker',1),/lease|ownership/);
});
test('quality pause acknowledgment shares the explicit resume transaction and rejects edited prose',async t=>{
 const f=await fixture(t,'quality');
 const before=await f.db.productionUnitRun.findUnique({where:{id:f.run.id}});
 await f.api.readKernelChapterProgress(f.db,f.contract,{status:'paused'});
 assert.deepEqual(await f.db.productionUnitRun.findUnique({where:{id:f.run.id}}),before);
 await f.db.chapter.update({where:{id:'chapter-1'},data:{content:'human edit'}});
 await assert.rejects(f.repo.transition(f.command()),/正文|改动|修改/);
 assert.deepEqual(await f.db.productionUnitRun.findUnique({where:{id:f.run.id}}),before);
 await f.db.chapter.update({where:{id:'chapter-1'},data:{content:'saved'}});
 const rollback=f.makeRepo({resumeBusiness:async(...args)=>{await f.resumeBusiness(...args);throw Error('rollback acknowledgment');}});
 await assert.rejects(rollback.transition(f.command()),/rollback acknowledgment/);
 assert.deepEqual(await f.db.productionUnitRun.findUnique({where:{id:f.run.id}}),before);
 await f.repo.transition(f.command());
 const saved=await f.db.productionUnitRun.findUnique({where:{id:f.run.id}});
 assert.equal(JSON.parse(saved.progressJson).qualityPause.acknowledged,true);assert.equal(saved.version,before.version+1);
 assert.equal(saved.stageArtifactsJson,before.stageArtifactsJson);assert.equal(saved.policySnapshotJson,before.policySnapshotJson);
});
test('kernel cancellation preserves saved progress and unknown claims while revoking old writes',async t=>{
 const f=await fixture(t,'unknown');
 await f.db.productionUnitRun.update({where:{id:f.run.id},data:{activeStage:'draft',activeRequestKey:'unknown'}});
 const before=await f.db.productionUnitRun.findUnique({where:{id:f.run.id}});
 await f.db.novel.update({where:{id:'novel-1'},data:{directorEpoch:1}});
 await f.repo.transition(f.command({id:'cancel',idempotencyKey:'cancel-once',event:{type:'cancel'},type:'cancel'}));
 assert.deepEqual(await f.db.productionUnitRun.findUnique({where:{id:f.run.id}}),before);
 assert.equal(await f.db.generationJob.count(),0);
 await assert.rejects(f.budget.reserve(f.unit,'old-worker',1),/lease|ownership|epoch/);
});
test('explicit resume keeps unknown requests claimed and cannot turn them into budget retries',async t=>{
 const f=await fixture(t,'unknown');
 await f.db.productionUnitRun.update({where:{id:f.run.id},data:{activeStage:'draft',activeRequestKey:'unknown'}});
 const before=await f.db.productionUnitRun.findUnique({where:{id:f.run.id}});
 await assert.rejects(f.repo.transition(f.command({chapterBudget:f.grant})),/预算/);
 await f.repo.transition(f.command());
 assert.deepEqual(await f.db.productionUnitRun.findUnique({where:{id:f.run.id}}),before);
});

test('kernel resume requires current assisted character reviews to be resolved in the same command transaction',async t=>{
 const f=await fixture(t,'unknown');
 const {buildChapterArtifactContentHash}=require('../../dist/services/novel/runtime/artifactSync/ChapterArtifactContentVersion');
 const chapter=await f.db.chapter.findUniqueOrThrow({where:{id:f.unit.chapterId}});
 const review={schemaVersion:1,id:'identity-review',revision:0,driver:'assisted',chapterId:chapter.id,chapterOrder:chapter.order,
  contentHash:buildChapterArtifactContentHash(chapter.content),blocking:true,items:[]};
 await f.db.chapterArtifactSyncCheckpoint.create({data:{id:review.id,novelId:'novel-1',chapterId:chapter.id,contentHash:review.contentHash,
  artifactType:`director_v2_character_candidates:${f.contract.runId}`,syncMode:'identity',status:'succeeded',metadataJson:JSON.stringify(review)}});
 await assert.rejects(f.repo.transition(f.command()),/确认.*人物|人物.*确认/);
 assert.equal(await f.db.directorNextCommand.count(),0);
 await f.db.chapterArtifactSyncCheckpoint.update({where:{id:review.id},data:{metadataJson:JSON.stringify({...review,blocking:false})}});
 await f.repo.transition(f.command());
 assert.equal((await f.db.directorNextRunControl.findUniqueOrThrow({where:{runId:f.contract.runId}})).status,'running');
});
test('a replaced book epoch cannot authorize quality acknowledgment or any budget grant',async t=>{
 const f=await fixture(t,'quality'),before=await f.db.productionUnitRun.findUnique({where:{id:f.run.id}});
 await f.db.novel.update({where:{id:'novel-1'},data:{directorEpoch:1}});
 await assert.rejects(f.repo.transition(f.command()),/归属/);
 assert.deepEqual(await f.db.productionUnitRun.findUnique({where:{id:f.run.id}}),before);
 assert.equal(await f.db.directorNextCommand.count(),0);
});
test('late paid usage is re-read before a source-page budget grant is accepted',async t=>{
 const f=await fixture(t);
 await f.budget.observe(f.unit,'paid',{invocationId:'late-paid',runId:f.contract.runId,novelId:'novel-1',chapterId:'chapter-1',
  status:'completed',usage:{totalTokens:100},startedAt:new Date(2),finishedAt:new Date(3)});
 await assert.rejects(f.repo.transition(f.command({chapterBudget:f.grant})),/额度/);
 assert.equal((await f.budget.read(f.unit)).used,180);
 assert.equal(await f.db.directorNextEvent.count({where:{type:'chapter_budget_granted'}}),0);
});
test('explicit global replan resumes only a newer saved route and archives the old uncommitted decision',async t=>{
 const f=await fixture(t,'unknown');
 const chapter=await f.db.chapter.findUniqueOrThrow({where:{id:f.unit.chapterId}}),contentHash=hash(chapter.content);
 const row=await f.db.productionUnitRun.findUniqueOrThrow({where:{id:f.run.id}});
 const progress={unit:f.unit,completed:['prepare','draft','accept'],repairAttemptsUsed:0,
  original:{contentHash,verdict:{contentHash,gateAvailable:true,issues:[],missingObligations:[],replan:'global_book'}}};
 const artifacts={original:chapter.content,prepared:{baseline:{content:chapter.content,updatedAt:chapter.updatedAt.toISOString(),protectedUserContent:false}},receipts:{}};
 await f.db.productionUnitRun.update({where:{id:row.id},data:{progressJson:JSON.stringify(progress),stageArtifactsJson:JSON.stringify(artifacts)}});
 await f.db.directorNextRunControl.update({where:{runId:f.contract.runId},data:{updatedAt:new Date('2026-10-24T00:00:00Z')}});
 await f.db.volumePlanVersion.create({data:{id:'new-route',novelId:'novel-1',version:1,status:'active',contentJson:'{}',updatedAt:new Date('2026-10-23T23:59:00Z')}});
 let before=await f.db.productionUnitRun.findUniqueOrThrow({where:{id:row.id}});
 await assert.rejects(f.repo.transition(f.command()),/规划|路线/);
 assert.deepEqual(await f.db.productionUnitRun.findUniqueOrThrow({where:{id:row.id}}),before);
 await f.db.volumePlanVersion.update({where:{id:'new-route'},data:{updatedAt:new Date('2026-10-24T00:00:01Z')}});
 await f.db.chapter.update({where:{id:chapter.id},data:{content:chapter.content+' 人工修订'}});
 await assert.rejects(f.repo.transition(f.command()),/正文.*修改/);
 await f.db.chapter.update({where:{id:chapter.id},data:{content:chapter.content}});
 await f.db.productionUnitRun.update({where:{id:row.id},data:{progressJson:JSON.stringify({...progress,committedContentHash:contentHash})}});
 await assert.rejects(f.repo.transition(f.command()),/已保存正文/);
 await f.db.productionUnitRun.update({where:{id:row.id},data:{progressJson:JSON.stringify(progress)}});
 before=await f.db.productionUnitRun.findUniqueOrThrow({where:{id:row.id}});
 const rollback=f.makeRepo({resumeBusiness:async(...args)=>{await f.resumeBusiness(...args);throw Error('replan rollback');}});
 await assert.rejects(rollback.transition(f.command()),/replan rollback/);
 assert.deepEqual(await f.db.productionUnitRun.findUniqueOrThrow({where:{id:row.id}}),before);
 assert.equal(await f.db.directorNextEvent.count({where:{type:'production_kernel_replan_reset'}}),0);
 await f.repo.transition(f.command());await f.repo.transition(f.command());
 const next=await f.db.productionUnitRun.findUniqueOrThrow({where:{id:row.id}});
 assert.deepEqual(JSON.parse(next.progressJson),{unit:f.unit,completed:[],repairAttemptsUsed:0});
 assert.deepEqual(JSON.parse(next.stageArtifactsJson),{receipts:{}});
 assert.equal(next.policySnapshotJson,row.policySnapshotJson);assert.equal(next.modelSnapshotJson,row.modelSnapshotJson);
 const event=await f.db.directorNextEvent.findFirstOrThrow({where:{type:'production_kernel_replan_reset'}});
 assert.deepEqual(JSON.parse(event.payloadJson).previous.progress,progress);
 assert.equal(await f.db.directorNextEvent.count({where:{type:'production_kernel_replan_reset'}}),1);
 assert.equal((await f.db.chapter.findUniqueOrThrow({where:{id:chapter.id}})).content,chapter.content);
});
