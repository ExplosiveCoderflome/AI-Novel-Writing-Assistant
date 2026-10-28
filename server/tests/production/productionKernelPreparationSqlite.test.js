const test=require('node:test'),assert=require('node:assert/strict');
const {fixture:batch}=require('./batch/fixture.cjs');
const persistence=require('../../dist/services/planner/plannerPersistence');
const planInput=require('./planning/fixtures/chapterPlanBaseline.json').persist;
async function fixture(t){
 assert.equal(typeof persistence.persistStoryPlanInTransaction,'function','native planning commit must share the caller transaction');
 const f=await batch(t),before=await f.db.chapter.findUniqueOrThrow({where:{id:'chapter-1'}}),ownership=f.api.createKernelOwnership(f.context);
 const guard=async(tx,point)=>{
  await ownership(tx);
  if(point==='before'){
   const locked=await tx.chapter.updateMany({where:{id:'chapter-1',novelId:'novel-1',content:before.content,updatedAt:before.updatedAt},data:{updatedAt:before.updatedAt}});
   if(locked.count!==1)throw Error('Prepared chapter version changed');
  }
 };
 return{...f,before,guard,save:(assertTransaction=guard)=>f.db.$transaction(tx=>persistence.persistStoryPlanInTransaction(tx,structuredClone(planInput),assertTransaction))};
}
test('native chapter planning commits its plan, scenes and chapter metadata in the caller transaction',async t=>{
 const f=await fixture(t),result=await f.save(),chapter=await f.db.chapter.findUniqueOrThrow({where:{id:'chapter-1'}});
 assert.equal(result.objective,'完成钥匙交接');assert.equal(await f.db.storyPlan.count(),1);assert.equal(await f.db.chapterPlanScene.count(),3);
 assert.equal(chapter.content,f.before.content);assert.ok(chapter.taskSheet.includes('完成钥匙交接'));assert.ok(chapter.sceneCards.includes('出示钥匙'));
 assert.equal(result.id,(await f.db.storyPlan.findFirst()).id);
});
test('a replaced worker cannot commit native planning records or chapter metadata',async t=>{
 const f=await fixture(t);await f.db.directorNextRunControl.update({where:{runId:'batch-1'},data:{leaseOwner:'worker:2'}});
 await assert.rejects(()=>f.save(),/lease|ownership/i);assert.equal(await f.db.storyPlan.count(),0);
 assert.deepEqual(await f.db.chapter.findUniqueOrThrow({where:{id:'chapter-1'}}),f.before);
});
test('a failed post-write transaction fence rolls back native planning and every scene',async t=>{
 const f=await fixture(t);
 await assert.rejects(()=>f.save(async(tx,point)=>{await f.guard(tx,point);if(point==='after')throw Error('lost after write')}),/lost after write/);
 assert.equal(await f.db.storyPlan.count(),0);assert.equal(await f.db.chapterPlanScene.count(),0);
 assert.deepEqual(await f.db.chapter.findUniqueOrThrow({where:{id:'chapter-1'}}),f.before);
});
test('editing the chapter after request preparation preserves the human content and rejects stale planning',async t=>{
 const f=await fixture(t);await f.db.chapter.update({where:{id:'chapter-1'},data:{content:'人工保留的正文'}});
 await assert.rejects(()=>f.save(),/version changed/);assert.equal(await f.db.storyPlan.count(),0);
 assert.equal((await f.db.chapter.findUniqueOrThrow({where:{id:'chapter-1'}})).content,'人工保留的正文');
});

async function contractFixture(t) {
 const f=await batch(t);
 const {fixture:create}=require('./planning/contractServiceFixture.cjs');
 const native=create(), workspace=native.workspace;
 const {persistActiveVolumeWorkspace}=require('../../dist/services/novel/volume/volumeWorkspacePersistence');
 await f.db.chapter.update({where:{id:'chapter-1'},data:{title:native.chapter.title,taskSheet:null,sceneCards:null}});
 await f.db.volumePlanVersion.create({data:{id:'version-1',novelId:'novel-1',version:1,status:'active',contentJson:JSON.stringify(workspace)}});
 await f.db.$transaction(tx=>persistActiveVolumeWorkspace(tx,'novel-1',workspace,'version-1'));
 const {ChapterExecutionContractService}=require('../../dist/services/novel/volume/ChapterExecutionContractService');
 const service=new ChapterExecutionContractService({...native.deps,ensureActiveVersionRecord:async()=>({versionId:'version-1',version:1})});
 const ports={...native.ports,db:f.db},prepared=await service.prepareChapterExecutionContract('novel-1','chapter-1',{},ports);
 const outcome=await service.evaluatePreparedChapterExecutionContract(JSON.parse(JSON.stringify(prepared)),{},ports);
 const ownership=f.api.createKernelOwnership(f.context);
 return {...f,prepared,outcome,save:(guard=ownership)=>f.db.$transaction(async tx=>{
   const result=await service.commitPreparedChapterExecutionContract(tx,prepared,outcome,guard);
   await tx.chapterArtifactSyncCheckpoint.create({data:{novelId:'novel-1',chapterId:'chapter-1',contentHash:'prepared-input',
     artifactType:'kernel_prepare:contract_commit',syncMode:'planning',status:'succeeded',metadataJson:JSON.stringify({chapterId:result.id})}});
   return result;
 })};
}
test('native contract commit and receipt share the caller transaction across volume, chapter and compatibility rows',async t=>{
 const f=await contractFixture(t),before=await f.db.chapter.findUniqueOrThrow({where:{id:'chapter-1'}});
 const result=await f.save(),volumeChapter=await f.db.volumeChapterPlan.findUniqueOrThrow({where:{id:'volume-chapter-1'}});
 assert.match(result.taskSheet,/补充执行指导/);assert.equal(volumeChapter.taskSheet,result.taskSheet);assert.equal(result.content,before.content);
 assert.match((await f.db.volumePlanVersion.findUniqueOrThrow({where:{id:'version-1'}})).contentJson,/补充执行指导/);
 assert.equal(await f.db.chapterArtifactSyncCheckpoint.count({where:{artifactType:'kernel_prepare:contract_commit'}}),1);
});
for(const change of ['lease','epoch','chapter','document','canonical','after'])test(`contract transaction rejects ${change} drift and preserves all source rows`,async t=>{
 const f=await contractFixture(t);
 if(change==='lease')await f.db.directorNextRunControl.update({where:{runId:'batch-1'},data:{leaseOwner:'worker:2'}});
 if(change==='epoch')await f.db.novel.update({where:{id:'novel-1'},data:{directorEpoch:1}});
 if(change==='chapter')await f.db.chapter.update({where:{id:'chapter-1'},data:{content:'人工保留的正文'}});
 if(change==='document')await f.db.volumePlanVersion.update({where:{id:'version-1'},data:{contentJson:'{"manual":"retain"}'}});
 if(change==='canonical')await f.db.volumeChapterPlan.update({where:{id:'volume-chapter-1'},data:{taskSheet:'人工保留的任务单'}});
 const read=async()=>({chapter:await f.db.chapter.findUniqueOrThrow({where:{id:'chapter-1'}}),
   version:await f.db.volumePlanVersion.findUniqueOrThrow({where:{id:'version-1'}}),
   rows:await f.db.volumeChapterPlan.findMany(),plans:await f.db.storyPlan.findMany()});
 const before=await read(),ownership=f.api.createKernelOwnership(f.context);
 await assert.rejects(()=>f.save(async(tx,point)=>{await ownership(tx);if(change==='after'&&point==='after')throw Error('lost after contract write');}));
 assert.deepEqual(await read(),before);assert.equal(await f.db.chapterArtifactSyncCheckpoint.count({where:{artifactType:'kernel_prepare:contract_commit'}}),0);
});
test('readonly workspace preparation refuses missing canonical rows without rebuilding them',async t=>{
 const f=await batch(t),api=require('../../dist/services/novel/volume/ChapterExecutionContractService');
 assert.equal(typeof api.readExecutionContractWorkspace,'function');
 const document=require('./planning/contractServiceFixture.cjs').fixture().workspace;
 await f.db.volumePlanVersion.create({data:{id:'version-1',novelId:'novel-1',version:1,status:'active',contentJson:JSON.stringify(document)}});
 await assert.rejects(()=>api.readExecutionContractWorkspace(f.db,'novel-1'),/来源页|卷规划/);
 assert.equal(await f.db.volumePlan.count(),0);assert.equal(await f.db.volumeChapterPlan.count(),0);
 assert.equal(await f.db.storyPlan.count(),0);assert.equal(await f.db.volumePlanVersion.count(),1);
});
test('preparation returns a source route for missing earlier timeline and never repairs out of range content',async t=>{
 const f=await batch(t),kernel=require('../../dist/modules/production');assert.equal(typeof kernel.readPreparationTimeline,'function');
 await f.db.chapter.create({data:{id:'chapter-2',novelId:'novel-1',title:'第二章',order:2,content:''}});
 const unit={novelId:'novel-1',chapterId:'chapter-2',order:2};
 await assert.rejects(()=>kernel.readPreparationTimeline(f.db,unit,'/lab/director/novel-1'),error=>{
   assert.equal(error.sourceRoute,'/lab/director/novel-1');assert.equal(error.chapterId,'chapter-1');return true;
 });
 assert.equal(await f.db.storyTimelineEvent.count(),0);assert.equal(await f.db.chapterArtifactSyncCheckpoint.count(),0);
 const chapter=await f.db.chapter.findUniqueOrThrow({where:{id:'chapter-1'}});
 const contentHash=require('node:crypto').createHash('sha1').update(chapter.content.trim()).digest('hex');
 await f.db.chapterArtifactSyncCheckpoint.create({data:{novelId:'novel-1',chapterId:'chapter-1',contentHash,
   artifactType:'timeline_finalization',syncMode:'stable',status:'succeeded'}});
 const sources=await kernel.readPreparationTimeline(f.db,unit,'/lab/director/novel-1');assert.equal(sources.length,1);
 assert.equal(sources[0].contentHash,kernel.hashProductionContent(chapter.content));assert.equal(await f.db.chapterArtifactSyncCheckpoint.count(),1);
 await f.db.chapter.update({where:{id:'chapter-1'},data:{content:'人工修改的前文'}});
 await assert.rejects(()=>f.db.$transaction(tx=>kernel.assertPreparationTimeline(tx,unit,sources,'/lab/director/novel-1')));
 assert.equal(await f.db.storyPlan.count(),0);
});
