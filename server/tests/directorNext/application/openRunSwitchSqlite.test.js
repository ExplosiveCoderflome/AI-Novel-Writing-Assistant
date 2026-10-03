const test=require('node:test');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {execFileSync}=require('node:child_process');

test('temporary full-schema switch preserves historical tasks and prose while takeover and handoff share one ledger',()=>{
 const root=path.resolve(__dirname,'../../../..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'director-switch-')),script=path.join(dir,'drill.cjs');
 fs.writeFileSync(script,String.raw`
const assert=require('node:assert/strict');const path=require('node:path');const server=path.join(process.env.DIRECTOR_NEXT_REPO_ROOT,'server');
const {prisma}=require(path.join(server,'dist/db/prisma'));
const {ensureRuntimeDatabaseReady}=require(path.join(server,'dist/db/runtimeMigrations'));
const {createDirectorNextServices}=require(path.join(server,'dist/modules/director'));
const {createDirectorProductionOptions}=require(path.join(server,'dist/app/director/productionComposition'));
const {LegacyRunProjection}=require(path.join(server,'dist/modules/director/http'));
const {readDirectorWorkspace}=require(path.join(server,'dist/app/director/workspace'));
const {launchNewDirectorBook}=require(path.join(server,'dist/app/director/newBook'));
const {executeOpeningCommand,prepareOpeningRetry}=require(path.join(server,'dist/app/director/opening'));
(async()=>{
 await ensureRuntimeDatabaseReady();
 await prisma.novel.create({data:{id:'existing',title:'验收小说'}});
 await prisma.novel.create({data:{id:'fresh',title:'新小说'}});
 await prisma.character.create({data:{id:'character',novelId:'existing',name:'原有主角',role:'主角'}});
 await prisma.chapter.create({data:{id:'chapter',novelId:'existing',order:1,title:'原章节',content:'已有正文，必须完整保留。'}});
 for(const status of ['queued','running','failed','succeeded'])await prisma.novelWorkflowTask.create({data:{id:'old-'+status,novelId:'existing',lane:'auto_director',title:'旧导演',status,seedPayloadJson:'not valid JSON; must never be read'}});
 const before=await prisma.novelWorkflowTask.findMany({orderBy:{id:'asc'}});
 process.env.DIRECTOR_NEXT_ENABLED='true';
 const {createApp}=require(path.join(server,'dist/app'));
 const http=createApp().listen(0);await new Promise(resolve=>http.once('listening',resolve));
 const base='http://127.0.0.1:'+http.address().port;
 const oldCommands=await prisma.directorRunCommand.count();
 await prisma.generationJob.create({data:{id:'owned-job',novelId:'existing',startOrder:1,endOrder:1,status:'failed',pendingManualRecovery:true,payload:JSON.stringify({directorNext:{runId:'test-run',decisions:[]}})}});
 await prisma.generationJob.create({data:{id:'old-owned-job',novelId:'existing',startOrder:2,endOrder:2,status:'failed',pendingManualRecovery:true,payload:JSON.stringify({workflowTaskId:'old-failed'})}});
 const jobsBefore=await prisma.generationJob.findMany({orderBy:{id:'asc'}});
 try {
  for(const route of ['/api/novel-workflows/old-failed/continue','/api/novel-workflows/old-failed/production-experience','/api/novel-workflows/old-failed/repair-chapter-titles','/api/tasks/novel_workflow/old-failed/retry','/api/tasks/novel_workflow/old-failed/cancel','/api/auto-director/follow-ups/old-failed/actions','/api/auto-director/channel-callbacks/dingtalk']) {
   const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,409,route);
  }
  assert.equal(await prisma.directorRunCommand.count(),oldCommands);
  assert.deepEqual(await prisma.novelWorkflowTask.findMany({orderBy:{id:'asc'}}),before);
  const jobDetail=await (await fetch(base+'/api/tasks/novel_pipeline/owned-job')).json();
  assert.equal(jobDetail.data.sourceRoute,'/lab/director/existing');
  assert.equal(jobDetail.data.sourceResource.route,'/lab/director/existing');
  for(const jobId of ['owned-job','old-owned-job'])for(const action of ['retry','cancel','archive']){
   const response=await fetch(base+'/api/tasks/novel_pipeline/'+jobId+'/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,409);
  }
  assert.deepEqual(await prisma.generationJob.findMany({orderBy:{id:'asc'}}),jobsBefore);
  assert.equal(await prisma.directorRunCommand.count(),oldCommands);
 }finally{await new Promise(resolve=>http.close(resolve));}
 const workspace=await readDirectorWorkspace('existing');
 assert.equal(workspace.chapters[0].content,'已有正文，必须完整保留。');assert.equal(workspace.materials.characters[0].name,'原有主角');assert.equal('progress' in workspace,false);
 const history=new LegacyRunProjection({list:()=>prisma.novelWorkflowTask.findMany({select:{id:true,novelId:true,title:true,status:true,progress:true,lastError:true}})});
 assert.equal((await history.list({limit:50})).every(v=>v.mode==='history'),true);
 const services=createDirectorNextServices(createDirectorProductionOptions());
 const launchInput={storyInput:'故事方向',estimatedChapterCount:30,worldMode:'skip',targetMode:'opening',provider:'openai',model:'test-no-invocation'};
 const opened=await services.http.commandService.execute({type:'open_run',novelId:'existing',driver:'auto',stepIdsInScope:[],launchInput,idempotencyKey:'takeover'});
 const rows=await prisma.directorNextArtifact.findMany({where:{novelId:'existing'},orderBy:{id:'asc'}});
 assert.equal(rows.find(a=>a.type==='character_cast').protectedUserContent,true);
 assert.equal(rows.find(a=>a.type==='chapter_draft').protectedUserContent,true);
 assert.equal(rows.find(a=>a.type==='chapter_draft').scope,'chapter:1');
 assert.equal(rows.some(a=>a.type==='story_macro'),false);
 const switched=await services.http.commandService.execute({type:'handoff',runId:opened.runId,toDriver:'assisted',expectedVersion:0,idempotencyKey:'switch'});
 assert.deepEqual(await prisma.directorNextArtifact.findMany({where:{novelId:'existing'},orderBy:{id:'asc'}}),rows);
 assert.equal(await prisma.directorNextRunControl.count({where:{novelId:'existing',status:{in:['queued','running','paused','waiting_gate']}}}),1);
 assert.equal(await services.worker.tick(),true);
 assert.equal((await prisma.directorNextRunControl.findUnique({where:{runId:switched.runId}})).status,'completed');
 assert.equal((await prisma.chapter.findUnique({where:{id:'chapter'}})).content,'已有正文，必须完整保留。');
 const fresh=await services.http.commandService.execute({type:'open_run',novelId:'fresh',driver:'assisted',stepIdsInScope:null,launchInput,idempotencyKey:'fresh'});
 const saved=JSON.parse((await prisma.directorNextRun.findUnique({where:{id:fresh.runId}})).contractJson);
 assert.equal(saved.chapterRange,null);assert.equal(saved.stepIdsInScope.includes('chapter_batch'),false);
 assert.deepEqual(await prisma.novelWorkflowTask.findMany({orderBy:{id:'asc'}}),before);
 await prisma.novelWorkflowTask.create({data:{id:'creation',lane:'creation_studio',title:'新开书'}});
 await prisma.creationStudioConfirmation.create({data:{id:'confirmation',workflowTaskId:'creation',idempotencyKey:'new-book',narrativeForm:'long_novel'}});
 const input={idea:'开书故事',candidate:{workingTitle:'新书标题',logline:'新书故事',targetChapterCount:30},provider:'openai',model:'test-no-invocation',worldSetupMode:'skip',estimatedChapterCount:30};
 const created=await launchNewDirectorBook(input,'creation');
 const replayed=await launchNewDirectorBook(input,'creation');
 assert.equal(created.novel.id,'director-book-confirmation');assert.equal(replayed.workflowTaskId,created.workflowTaskId);
 assert.equal(await prisma.directorNextRun.count({where:{novelId:created.novel.id}}),1);
 assert.equal(await prisma.novelWorkflowTask.count({where:{lane:'auto_director'}}),before.length);
 await prisma.novelWorkflowTask.create({data:{id:'original-opening',lane:'auto_director',title:'原开书界面'}});
 await prisma.directorRunCommand.create({data:{id:'original-confirm',taskId:'original-opening',commandType:'confirm_candidate',idempotencyKey:'confirm',payloadJson:JSON.stringify({confirmRequest:{...input,runMode:'stage_review',narrativePov:'first_person',pacePreference:'fast'}})}});
 await executeOpeningCommand('original-confirm');await executeOpeningCommand('original-confirm');
 const opening=await prisma.novelWorkflowTask.findUniqueOrThrow({where:{id:'original-opening'}});
 assert.equal(opening.status,'succeeded');assert.equal(opening.novelId,'director-opening-book-original-opening');
 assert.equal(JSON.parse(opening.resumeTargetJson).route,'/lab/director/:novelId');
 assert.equal(await prisma.directorNextRun.count({where:{novelId:opening.novelId}}),1);
 const originalNovel=await prisma.novel.findUniqueOrThrow({where:{id:opening.novelId}});
 assert.equal(originalNovel.narrativePov,'first_person');assert.equal(originalNovel.pacePreference,'fast');
 assert.equal((await prisma.directorRunCommand.findUniqueOrThrow({where:{id:'original-confirm'}})).status,'succeeded');
 const originalContract=JSON.parse((await prisma.directorNextRun.findFirst({where:{novelId:opening.novelId}})).contractJson);
 assert.equal(originalContract.driver,'assisted');assert.equal(originalContract.chapterRange,null);assert.ok(originalContract.launchInput.storyInput.includes('新书标题'));
 assert.deepEqual(await prisma.novelWorkflowTask.findMany({where:{id:{in:before.map(row=>row.id)}},orderBy:{id:'asc'}}),before);
 await prisma.novelWorkflowTask.create({data:{id:'interrupted-opening',lane:'auto_director',title:'传输中断',pendingManualRecovery:true,lastError:'transport_error'}});
 const failedOpening=await prisma.directorRunCommand.create({data:{id:'failed-opening',taskId:'interrupted-opening',commandType:'generate_candidates',idempotencyKey:'original',status:'failed',errorMessage:'transport_error',payloadJson:JSON.stringify({candidatesRequest:{idea:'保存的想法',model:'same-model'}})}});
 const retried=await prepareOpeningRetry('interrupted-opening');const retryReplay=await prepareOpeningRetry('interrupted-opening');
 assert.equal(retried.commandId,retryReplay.commandId);assert.notEqual(retried.commandId,failedOpening.id);
 assert.deepEqual(await prisma.directorRunCommand.findUnique({where:{id:failedOpening.id}}),failedOpening);
 const retryCommand=await prisma.directorRunCommand.findUniqueOrThrow({where:{id:retried.commandId}});
 assert.equal(retryCommand.payloadJson,failedOpening.payloadJson);assert.equal(retryCommand.commandType,'generate_candidates');assert.equal(retryCommand.status,'queued');
 assert.equal((await prisma.novelWorkflowTask.findUnique({where:{id:'interrupted-opening'}})).pendingManualRecovery,false);
 await assert.rejects(prepareOpeningRetry('old-failed'),/小说导演台/);
 await prisma.novelWorkflowTask.create({data:{id:'wrong-opening',lane:'auto_director',title:'不允许重试生产命令',pendingManualRecovery:true}});
 await prisma.directorRunCommand.create({data:{taskId:'wrong-opening',commandType:'continue',idempotencyKey:'wrong',status:'failed'}});
 await assert.rejects(prepareOpeningRetry('wrong-opening'),/没有可重试/);
 await prisma.novelWorkflowTask.create({data:{id:'transport-failure',lane:'auto_director',title:'可见的开书失败'}});
 await prisma.directorRunCommand.create({data:{id:'transport-command',taskId:'transport-failure',commandType:'generate_candidates',idempotencyKey:'transport',payloadJson:'{}'}});
 const {DirectorCommandExecutor}=require(path.join(server,'dist/services/novel/director/commands/DirectorCommandExecutor'));
 const originalExecute=DirectorCommandExecutor.prototype.execute;
 try {DirectorCommandExecutor.prototype.execute=async()=>{throw Error('[STRUCTURED_OUTPUT:transport_error] interrupted');};await assert.rejects(executeOpeningCommand('transport-command'),/transport_error/);}
 finally {DirectorCommandExecutor.prototype.execute=originalExecute;}
 const visibleFailure=await prisma.novelWorkflowTask.findUnique({where:{id:'transport-failure'}});
 assert.equal(visibleFailure.status,'failed');assert.equal(visibleFailure.pendingManualRecovery,true);assert.match(visibleFailure.lastError,/transport_error/);
 await prisma.$disconnect();
})().catch(async e=>{console.error(e);await prisma.$disconnect();process.exitCode=1;});
`);
 const env={...process.env,NODE_ENV:'test',AI_NOVEL_RUNTIME:'desktop',AI_NOVEL_APP_DATA_DIR:dir,DIRECTOR_NEXT_REPO_ROOT:root,DATABASE_URL:'file:'+path.join(dir,'drill.db').replace(/\\/g,'/')};
 execFileSync(process.execPath,[script],{cwd:root,env,stdio:'pipe'});
});
