const test=require('node:test'),assert=require('node:assert/strict');
const {fixture:batchFixture}=require('./batch/fixture.cjs');
async function fixture(t) {
 const api=require('../../dist/app/director/productionKernel');
 assert.equal(typeof api.readKernelUnitOutcome,'function','current manuscript closure reader must be exported');
 const f=await batchFixture(t),row=await f.db.productionUnitRun.findFirst(),chapter=await f.db.chapter.findFirst();
 const contentHash=f.kernel.hashProductionContent(chapter.content);
 const progress={unit:{novelId:'novel-1',chapterId:'chapter-1',order:1},completed:['prepare','draft','accept','commit','reconcile'],repairAttemptsUsed:0,
  original:{contentHash},selected:'original',selectedContentHash:contentHash,committedContentHash:contentHash,reconcileStatus:'completed'};
 const artifacts={original:chapter.content,receipts:{commit:{requestKey:'commit',result:{stage:'commit',contentHash}},
  reconcile:{requestKey:'reconcile',result:{stage:'reconcile',status:'completed'}}}};
 await f.db.productionUnitRun.update({where:{id:row.id},data:{progressJson:JSON.stringify(progress),stageArtifactsJson:JSON.stringify(artifacts),activeStage:null,activeRequestKey:null}});
 await f.db.chapter.update({where:{id:chapter.id},data:{generationState:'approved',chapterStatus:'completed',riskFlags:JSON.stringify({productionKernel:{runId:row.id,contentHash}})}});
 return {...f,row,chapter,progress,artifacts,read:()=>api.readKernelUnitOutcome(f.db,f.contract,chapter)};
}
test('a new batch can read a real prior kernel closure without inventing a legacy job',async t=>{
 const f=await fixture(t),result=await f.read();
 assert.equal(result.status,'completed');assert.equal(result.progress.unit.chapterId,'chapter-1');
 assert.equal(await f.db.generationJob.count(),0);assert.equal(await f.db.directorNextEvent.count(),0);
});
test('editing the current manuscript invalidates the saved closure without changing production control',async t=>{
 const f=await fixture(t);await f.db.chapter.update({where:{id:'chapter-1'},data:{content:'人工正文'}});
 const before=await f.db.directorNextRunControl.findFirst();
 const result=await f.read();assert.equal(result.status,'failed');assert.equal(result.reason,'data_integrity');
 assert.deepEqual(await f.db.directorNextRunControl.findFirst(),before);
});
test('a completed label without commit receipt or terminal lifecycle cannot close a chapter',async t=>{
 for(const missing of ['receipt','lifecycle']) {
  const f=await fixture(t);
  if(missing==='receipt'){delete f.artifacts.receipts.commit;await f.db.productionUnitRun.update({where:{id:f.row.id},data:{stageArtifactsJson:JSON.stringify(f.artifacts)}});}
  else await f.db.chapter.update({where:{id:'chapter-1'},data:{generationState:'drafted'}});
  assert.equal((await f.read()).status,'failed');
 }
});
test('closure references cannot claim a foreign chapter or a different novel',async t=>{
 const f=await fixture(t);f.progress.unit.chapterId='other-chapter';
 await f.db.productionUnitRun.update({where:{id:f.row.id},data:{progressJson:JSON.stringify(f.progress)}});
 await assert.rejects(()=>f.read(),/identity|chapter|scope/i);
});
test('the source-page batch confirmation reads the persisted kernel route and verifies real closure without a legacy job',async t=>{
 const f=await fixture(t);f.contract.chapterRange.to=1;
 await f.db.directorNextRun.update({where:{id:f.contract.runId},data:{contractJson:JSON.stringify(f.contract)}});
 await f.api.chooseProductionBatchImplementation(f.db,f.context,true);
 const {readEditedArtifact}=require('../../dist/app/director/savedContent');
 const read=()=>f.db.$transaction(tx=>readEditedArtifact({contract:f.contract,type:'chapter_batch_closed',contentRef:'saved-batch'},tx));
 assert.equal((await read()).contentRef,'saved-batch');assert.equal(await f.db.generationJob.count(),0);
 await f.db.chapter.update({where:{id:'chapter-1'},data:{content:'人工修改'}});
 await assert.rejects(read,/正文|闭合|同步/);
});
test('kernel progress reads real unit claims and closure, remains read-only and hides live phases while paused',async t=>{
 const f=await fixture(t);assert.equal(typeof f.api.readKernelChapterProgress,'function');
 await f.db.chapter.create({data:{id:'chapter-2',novelId:'novel-1',order:2,title:'第二章',content:''}});
 const {id,createdAt,updatedAt,...copy}=f.row;
 await f.db.productionUnitRun.create({data:{...copy,ownerKey:f.api.productionBatchOwnerKey(f.contract.runId),chapterId:'chapter-2',
  progressJson:JSON.stringify({unit:{novelId:'novel-1',chapterId:'chapter-2',order:2},completed:['prepare','draft'],repairAttemptsUsed:0}),activeStage:'accept',activeRequestKey:'actual-claim'}});
 const snapshot=async()=>JSON.stringify([await f.db.productionUnitRun.findMany(),await f.db.chapter.findMany(),await f.db.directorNextRunControl.findMany(),await f.db.directorNextEvent.findMany()]);
 const before=await snapshot();
 assert.deepEqual(await f.api.readKernelChapterProgress(f.db,f.contract,f.context.control),{from:1,to:3,total:3,done:1,current:{order:2,title:'第二章',phase:'reviewing'}});
 assert.equal((await f.api.readKernelChapterProgress(f.db,f.contract,{...f.context.control,status:'paused'})).current,null);
 assert.equal(await snapshot(),before);assert.equal(await f.db.generationJob.count(),0);
 await f.db.chapter.update({where:{id:'chapter-1'},data:{content:'人工改稿'}});
 assert.equal((await f.api.readKernelChapterProgress(f.db,f.contract,f.context.control)).done,0);
 await f.db.productionUnitRun.updateMany({where:{chapterId:'chapter-2'},data:{activeStage:'made_up_stage'}});
 await assert.rejects(()=>f.api.readKernelChapterProgress(f.db,f.contract,f.context.control),/stage|阶段|claim|领取/i);
});
