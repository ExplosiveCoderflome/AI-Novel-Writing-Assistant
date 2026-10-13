const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {spawnSync} = require('node:child_process');

test('missing strategy recovery preserves saved planning and prose, rejects stale results, and resumes an old protected run', () => {
  const root = path.resolve(__dirname,'../../../..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'missing-volume-strategy-'));
  const script = path.join(dir,'verify.cjs');
  fs.writeFileSync(script,String.raw`
const assert=require('node:assert/strict'),path=require('node:path');
const server=path.join(process.env.DIRECTOR_NEXT_REPO_ROOT,'server');
const {prisma}=require(path.join(server,'dist/db/prisma'));
const {ensureRuntimeDatabaseReady}=require(path.join(server,'dist/db/runtimeMigrations'));
const {NovelVolumeService}=require(path.join(server,'dist/services/novel/volume/NovelVolumeService'));
const {normalizeVolumeWorkspaceDocument}=require(path.join(server,'dist/services/novel/volume/volumeWorkspaceDocument'));
const {createDirectorProductionOptions}=require(path.join(server,'dist/app/director/productionComposition'));
const {createDirectorNextServices}=require(path.join(server,'dist/modules/director'));
const {PrismaArtifactLedger}=require(path.join(server,'dist/modules/director/infrastructure'));
const strategy={recommendedVolumeCount:1,hardPlannedVolumeCount:1,readerRewardLadder:'已有回报',escalationLadder:'已有压力',midpointShift:'已有转向',notes:'补齐战略',volumes:[{sortOrder:1,planningMode:'hard',roleLabel:'开篇',coreReward:'回报',escalationFocus:'压力',uncertaintyLevel:'low'}],uncertainties:[]};
const beats=book=>[{volumeId:book+'-volume',volumeSortOrder:1,status:'draft',beats:[{key:'opening',label:'开篇',title:'保留节奏',summary:'已保存的节奏',chapterSpanHint:'1-3',mustDeliver:['已有回报']}]}];
async function fixture(book,withVersion=true) {
 await prisma.novel.create({data:{id:book,title:'恢复测试',directorVersion:'v2'}});
 const doc=normalizeVolumeWorkspaceDocument(book,{volumes:[{id:book+'-volume',novelId:book,sortOrder:1,title:'作者卷',status:'active',chapters:[{id:book+'-plan',volumeId:book+'-volume',chapterOrder:1,title:'作者章节',summary:'作者概要',taskSheet:'作者任务',sceneCards:'作者场景'}]}],beatSheets:beats(book),rebalanceDecisions:[]});
 doc.legacyAuthorNote='保留旧版手写资料';doc.volumes[0].legacyLabel='保留卷标注';
 if(withVersion) await prisma.volumePlanVersion.create({data:{id:book+'-version',novelId:book,version:1,status:'active',contentJson:JSON.stringify(doc)}});
 await prisma.volumePlan.create({data:{id:book+'-volume',novelId:book,sortOrder:1,title:'作者卷',sourceVersionId:withVersion?book+'-version':null,chapters:{create:{id:book+'-plan',chapterOrder:1,title:'作者章节',summary:'作者概要',taskSheet:'作者任务',sceneCards:'作者场景'}}}});
 await prisma.volumePlan.create({data:{id:book+'-archive',novelId:book,sortOrder:2,title:'归档卷',status:'archived'}});
 await prisma.chapter.create({data:{id:book+'-body',novelId:book,order:1,title:'已写章',content:'作者手写正文'}});
 return doc;
}
async function rows(book){return {volumes:await prisma.volumePlan.findMany({where:{novelId:book},orderBy:{id:'asc'}}),plans:await prisma.volumeChapterPlan.findMany({where:{volume:{novelId:book}},orderBy:{id:'asc'}}),prose:await prisma.chapter.findMany({where:{novelId:book},orderBy:{id:'asc'}})};}
function generator(service,hook=async()=>{}){
 let calls=0;
 service.generateVolumes=async(_book,input)=>{
  calls++;assert.equal(input.scope,'strategy');assert.equal(input.respectExistingVolumeCount,true);
  assert.equal(input.userPreferredVolumeCount,input.draftWorkspace.volumes.length);
  await hook(input);
  return {...input.draftWorkspace,volumes:[],beatSheets:[],strategyPlan:strategy};
 };
 return ()=>calls;
}
(async()=>{
 await ensureRuntimeDatabaseReady();
 await fixture('preserve');const service=new NovelVolumeService(),calls=generator(service);
 const before=await rows('preserve');const result=await service.recoverVolumeStrategy('preserve',{provider:'openai',model:'stub',taskId:'repair',entrypoint:'director_next'});
 assert.equal(result.strategyPlan.notes,'补齐战略');assert.equal(result.volumes[0].title,'作者卷');
 assert.equal(result.volumes[0].chapters[0].taskSheet,'作者任务');assert.equal(result.beatSheets[0].beats[0].title,'保留节奏');
 assert.deepEqual(await rows('preserve'),before,'metadata recovery must not rewrite planning rows, archive rows, or prose');
 const saved=await prisma.volumePlanVersion.findUniqueOrThrow({where:{id:'preserve-version'}});
 assert.equal(JSON.parse(saved.contentJson).legacyAuthorNote,'保留旧版手写资料');
 assert.equal(JSON.parse(saved.contentJson).volumes[0].legacyLabel,'保留卷标注');
 await service.recoverVolumeStrategy('preserve');assert.equal(calls(),1);
 assert.deepEqual(await prisma.volumePlanVersion.findUniqueOrThrow({where:{id:'preserve-version'}}),saved,'complete strategy is a no-op');

 await fixture('edited');const edited=new NovelVolumeService();generator(edited,async()=>{
  const row=await prisma.volumePlanVersion.findUniqueOrThrow({where:{id:'edited-version'}});const changed=JSON.parse(row.contentJson);changed.volumes[0].title='并发修改的卷';
  await prisma.volumePlanVersion.update({where:{id:row.id},data:{contentJson:JSON.stringify(changed)}});
 });
 await assert.rejects(()=>edited.recoverVolumeStrategy('edited'),e=>e.statusCode===409);
 const afterEdit=JSON.parse((await prisma.volumePlanVersion.findUniqueOrThrow({where:{id:'edited-version'}})).contentJson);
 assert.equal(afterEdit.volumes[0].title,'并发修改的卷');assert.equal(afterEdit.strategyPlan,null);

 await fixture('winner');const winner=new NovelVolumeService();generator(winner,async()=>{
  const row=await prisma.volumePlanVersion.findUniqueOrThrow({where:{id:'winner-version'}});const changed=JSON.parse(row.contentJson);changed.strategyPlan={...strategy,notes:'作者先保存的战略'};
  await prisma.volumePlanVersion.update({where:{id:row.id},data:{contentJson:JSON.stringify(changed)}});
 });
 assert.equal((await winner.recoverVolumeStrategy('winner')).strategyPlan.notes,'作者先保存的战略');

 await fixture('failed');const failed=new NovelVolumeService();failed.generateVolumes=async()=>{throw Error('model unavailable');};
 const beforeFailed=await prisma.volumePlanVersion.findUniqueOrThrow({where:{id:'failed-version'}});
 await assert.rejects(()=>failed.recoverVolumeStrategy('failed'),/model unavailable/);
 assert.deepEqual(await prisma.volumePlanVersion.findUniqueOrThrow({where:{id:'failed-version'}}),beforeFailed);

 await fixture('rows-only',false);const rowOnly=new NovelVolumeService();generator(rowOnly);
 const beforeRowsOnly=await rows('rows-only');
 await rowOnly.recoverVolumeStrategy('rows-only');
 assert.deepEqual(await rows('rows-only'),beforeRowsOnly);
 assert.ok((await prisma.volumePlanVersion.findFirstOrThrow({where:{novelId:'rows-only',status:'active'}})).contentJson.includes('补齐战略'));

 await fixture('old-run');await prisma.character.create({data:{id:'old-character',novelId:'old-run',name:'角色',role:'protagonist'}});
 const oldVersion=await prisma.volumePlanVersion.findUniqueOrThrow({where:{id:'old-run-version'}});
 const missingBeats=JSON.parse(oldVersion.contentJson);missingBeats.beatSheets=[];
 await prisma.volumePlanVersion.update({where:{id:oldVersion.id},data:{contentJson:JSON.stringify(missingBeats)}});
 const prototype=NovelVolumeService.prototype.generateVolumes;
 let strategyCalls=0;
 NovelVolumeService.prototype.generateVolumes=async function(book,input){
  const current=await this.getVolumes(book,{hydrateCanonical:false});
  if(input.scope==='strategy'){strategyCalls++;return {...current,volumes:[],beatSheets:[],strategyPlan:strategy};}
  assert.equal(input.scope,'beat_sheet','a resumed run must not regenerate the skeleton');assert.ok(current.strategyPlan);
  return {...current,beatSheets:beats(book)};
 };
 const options=createDirectorProductionOptions();
 const services=createDirectorNextServices(options);
 const opened=await services.http.commandService.execute({type:'open_run',novelId:'old-run',driver:'assisted',stepIdsInScope:['volume_beat_sheet'],launchInput:{storyInput:'已有小说',estimatedChapterCount:10,worldMode:'skip',targetMode:'opening',provider:'openai',model:'stub'},idempotencyKey:'open-old'});
 const runId=opened.runId;
 await new PrismaArtifactLedger().record({novelId:'old-run',type:'volume_strategy',scope:'book',status:'confirmed',protectedUserContent:true,contentRef:'volume_strategy:old-run',contentHash:'old-incomplete',producedByRunId:runId});
 await services.http.runRepository.transition(runId,{type:'start'},0);
 await services.http.eventLog.append({runId,type:'execution_failure',payload:{stepId:'volume_beat_sheet',message:'请先生成卷战略建议，再生成当前卷节奏板。'}});
 await services.http.eventLog.append({runId,type:'stop_signal',payload:{kind:'manual_recovery',source:'runtime',reason:'execution_retry_budget_exhausted',action:'pause_for_manual'}});
 await services.http.runRepository.transition(runId,{type:'pause',pause:{kind:'manual_recovery',reason:'execution_retry_budget_exhausted'}},1);
 assert.equal(await services.worker.tick(),false,'polling must keep the run paused');
 await services.http.commandService.execute({type:'resume',runId,expectedVersion:2,idempotencyKey:'resume-old'});
 assert.equal(await services.worker.tick(),true);
 const control=await services.http.runRepository.getControl(runId);assert.equal(control.status,'running');
 const beat=await prisma.directorNextArtifact.findFirstOrThrow({where:{novelId:'old-run',type:'volume_beat_sheet'},orderBy:{version:'desc'}});
 assert.equal(beat.status,'confirmed');assert.equal(strategyCalls,1);
 assert.equal((await prisma.chapter.findUniqueOrThrow({where:{id:'old-run-body'}})).content,'作者手写正文');
 assert.equal((await prisma.directorNextArtifact.findFirstOrThrow({where:{novelId:'old-run',type:'volume_strategy'}})).protectedUserContent,true);
 assert.equal(await prisma.directorNextEvent.count({where:{runId,type:'execution_failure'}}),1,'original failure remains in history');
 NovelVolumeService.prototype.generateVolumes=prototype;
 await prisma.$disconnect();
})().catch(async error=>{console.error(error);await prisma.$disconnect();process.exitCode=1;});
`);
  const result=spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8',timeout:90000,env:{...process.env,
    NODE_ENV:'test',AI_NOVEL_RUNTIME:'desktop',AI_NOVEL_APP_DATA_DIR:dir,DIRECTOR_NEXT_REPO_ROOT:root,
    DIRECTOR_NEXT_ENABLED:'true',DATABASE_URL:'file:'+path.join(dir,'recovery.db').replace(/\\/g,'/')}});
  assert.equal(result.status,0,result.stderr+'\n'+result.stdout);
});
