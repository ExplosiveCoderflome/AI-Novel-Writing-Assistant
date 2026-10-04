const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

test('production progress follows only the bound same-book job and current content boundary, without writes', () => {
 const root=path.resolve(__dirname,'../../../..'), dir=fs.mkdtempSync(path.join(os.tmpdir(),'director-progress-'));
 const script=path.join(dir,'verify.cjs');
 fs.writeFileSync(script,String.raw`
const assert=require('node:assert/strict'),path=require('node:path');
const server=path.join(process.env.DIRECTOR_NEXT_REPO_ROOT,'server');
const Database=require(require.resolve('better-sqlite3',{paths:[server]}));
const {prisma}=require(path.join(server,'dist/db/prisma'));
const {ensureRuntimeDatabaseReady}=require(path.join(server,'dist/db/runtimeMigrations'));
const {createDirectorProductionOptions}=require(path.join(server,'dist/app/director/productionComposition'));
const {PrismaEventLog,FactIntegrityError}=require(path.join(server,'dist/modules/director'));
const {PrismaRunRepository}=require(path.join(server,'dist/modules/director/infrastructure'));
const {buildChapterArtifactContentHash,CHAPTER_ARTIFACT_BOUNDARY_TYPE}=require(path.join(server,'dist/services/novel/runtime/artifactSync'));
function snapshot(){const db=new Database(process.env.DATABASE_URL.slice(5),{readonly:true});try{return ['Chapter','GenerationJob','DirectorNextEvent','DirectorNextRun','DirectorNextRunControl','ChapterArtifactSyncCheckpoint'].map(t=>db.prepare('SELECT * FROM "'+t+'" ORDER BY rowid').all());}finally{db.close();}}
(async()=>{
 await ensureRuntimeDatabaseReady();
 await prisma.novel.createMany({data:[{id:'book',title:'本书'},{id:'other',title:'其他书'}]});
 const options=createDirectorProductionOptions();
 const contract=options.contractFactory({runId:'r',novelId:'book',driver:'assisted',stepIdsInScope:null,launchInput:{storyInput:'故事',estimatedChapterCount:8,worldMode:'skip',targetMode:'opening',provider:'openai',model:'no-ai',executionRange:{from:2,to:3}}});
 const control={status:'running',version:1,cursorStepId:'chapter_batch',gate:null,pause:null,failureReason:null};
 await new PrismaRunRepository(prisma).open(contract);
 await prisma.chapter.createMany({data:[
  {id:'c1',novelId:'book',order:1,title:'第一章',content:'已保存'},
  {id:'c2',novelId:'book',order:2,title:'第二章',content:'新版正文',generationState:'approved',chapterStatus:'completed'},
  {id:'c3',novelId:'book',order:3,title:'第三章',content:'草稿'},
  {id:'c6',novelId:'book',order:6,title:'第六章',content:'已保存，不能推荐覆盖'},
  {id:'foreign',novelId:'other',order:3,title:'其他书第三章',content:'其他书'}]});
 let before=snapshot(),p=await options.readProductionProjection({contract,control});
 assert.equal(p.chapterProgress.current,null);assert.equal(p.chapterProgress.done,0);
 assert.deepEqual(p.nextLaunchRange,{from:4,to:5},'recommendation must stop before existing prose');
 assert.deepEqual(snapshot(),before);
 await prisma.generationJob.create({data:{id:'job',novelId:'book',startOrder:2,endOrder:3,status:'running',currentStage:'reviewing',currentItemKey:'c3',currentItemLabel:'错误标签第99章',payload:JSON.stringify({directorNext:{runId:'r',decisions:[]}})}});
 await new PrismaEventLog().append({runId:'r',type:'chapter_batch_job',payload:{jobId:'job'}});
 await prisma.chapterArtifactSyncCheckpoint.create({data:{novelId:'book',chapterId:'c2',artifactType:CHAPTER_ARTIFACT_BOUNDARY_TYPE,syncMode:'production',status:'succeeded',contentHash:buildChapterArtifactContentHash('旧版正文'),metadataJson:JSON.stringify({outcome:'completed'})}});
 before=snapshot();p=await options.readProductionProjection({contract,control});
 assert.deepEqual(p.chapterProgress,{from:2,to:3,total:2,done:0,current:{order:3,title:'第三章',phase:'reviewing'}});
 assert.deepEqual(snapshot(),before);
 await prisma.chapterArtifactSyncCheckpoint.create({data:{novelId:'book',chapterId:'c2',artifactType:CHAPTER_ARTIFACT_BOUNDARY_TYPE,syncMode:'production',status:'succeeded',contentHash:buildChapterArtifactContentHash('新版正文'),metadataJson:JSON.stringify({outcome:'completed'})}});
 assert.equal((await options.readProductionProjection({contract,control})).chapterProgress.done,1);
 for(const currentStage of ['generating_chapters','repairing','finalizing']){
  await prisma.generationJob.update({where:{id:'job'},data:{currentStage}});
  assert.equal((await options.readProductionProjection({contract,control})).chapterProgress.current.phase,currentStage);
 }
 assert.equal((await options.readProductionProjection({contract,control:{...control,status:'paused'}})).chapterProgress.current,null,'stale live phase must not hide manual pause');
 await prisma.generationJob.update({where:{id:'job'},data:{pendingManualRecovery:true}});
 assert.equal((await options.readProductionProjection({contract,control})).chapterProgress.current,null);
 await prisma.generationJob.update({where:{id:'job'},data:{pendingManualRecovery:false,currentItemKey:'foreign'}});
 await assert.rejects(()=>options.readProductionProjection({contract,control}),e=>e instanceof FactIntegrityError);
 await prisma.generationJob.update({where:{id:'job'},data:{currentItemKey:'c1'}});
 await assert.rejects(()=>options.readProductionProjection({contract,control}),e=>e instanceof FactIntegrityError);
 await prisma.generationJob.update({where:{id:'job'},data:{currentItemKey:'c3',endOrder:4}});
 await assert.rejects(()=>options.readProductionProjection({contract,control}),e=>e instanceof FactIntegrityError);
 await prisma.generationJob.update({where:{id:'job'},data:{endOrder:3,payload:JSON.stringify({directorNext:{runId:'different',decisions:[]}})}});
 before=snapshot();await assert.rejects(()=>options.readProductionProjection({contract,control}),e=>e instanceof FactIntegrityError);assert.deepEqual(snapshot(),before);
 await prisma.$disconnect();
})().catch(async e=>{console.error(e);await prisma.$disconnect();process.exitCode=1;});
`);
 execFileSync(process.execPath,[script],{cwd:root,env:{...process.env,NODE_ENV:'test',AI_NOVEL_RUNTIME:'desktop',AI_NOVEL_APP_DATA_DIR:dir,DIRECTOR_NEXT_REPO_ROOT:root,DATABASE_URL:'file:'+path.join(dir,'progress.db').replace(/\\/g,'/')},stdio:'pipe'});
});
