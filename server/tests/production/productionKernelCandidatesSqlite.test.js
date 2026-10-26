const test=require('node:test'),assert=require('node:assert/strict');
const {fixture:base}=require('./batch/fixture.cjs');
const {request}=require('./application/harness.cjs');
const {nativeCandidates}=require('../../dist/app/director/productionKernel/composition/candidates');
const {output}=require('./persistence/outputs.cjs');
async function fixture(t,driver='auto'){
 const f=await base(t);f.contract.driver=driver;
 await f.db.directorNextRun.update({where:{id:f.contract.runId},data:{driver,contractJson:JSON.stringify(f.contract)}});
 const guard=f.api.createKernelOwnership(f.context),store=new f.kernel.PrismaUnitProgressStore(f.db,{assertOwnership:guard});
 const req=request({ownerKey:f.api.productionBatchOwnerKey(f.contract.runId)});
 let run=await store.loadOrCreate(req);
 const chapter=await f.db.chapter.findUniqueOrThrow({where:{id:'chapter-1'}}),content=chapter.content;
 run=await store.compareAndSwap(run,{progress:{...run.progress,selected:'original',selectedContentHash:f.kernel.hashProductionContent(content),
  committedContentHash:f.kernel.hashProductionContent(content)},artifacts:{...run.artifacts,original:content},activeStage:'reconcile',activeRequestKey:'reconcile'});
 const ctx={run,content,contentHash:f.kernel.hashProductionContent(content),executionToken:f.context.execution.leaseOwner,requestKey:'reconcile'};
 const extracted=output({characterCandidates:[{proposedName:'主角',proposedRole:'主角',evidence:[content],identityDecision:'create',decisionReason:'正文确认独立出场'}]});
 return{...f,ctx,extracted,prepare:nativeCandidates({db:f.db,context:f.context,ownership:guard})};
}
test('native candidate identity application shares the captured lease transaction and is idempotent',async t=>{
 const f=await fixture(t);const mapped=await f.prepare(f.ctx,f.extracted);
 assert.equal(await f.db.character.count({where:{novelId:'novel-1'}}),1);
 assert.equal(mapped.stateDeltas.characterStates[0].characterId,(await f.db.character.findFirstOrThrow({where:{name:'主角'}})).id);
 await f.prepare(f.ctx,f.extracted);assert.equal(await f.db.character.count(),1);assert.equal(await f.db.characterCandidate.count(),1);
});
test('blocking assisted identity reviews commit before the pause error and replay without duplicate candidates',async t=>{
 const f=await fixture(t,'assisted');
 await assert.rejects(f.prepare(f.ctx,f.extracted),{name:'CharacterCandidateReviewRequiredError'});
 assert.equal(await f.db.character.count(),0);assert.equal(await f.db.characterCandidate.count(),1);
 const rows=await f.db.chapterArtifactSyncCheckpoint.findMany({where:{artifactType:`director_v2_character_candidates:${f.contract.runId}`}});
 assert.equal(rows.length,1);assert.equal(JSON.parse(rows[0].metadataJson).blocking,true);
 await assert.rejects(f.prepare(f.ctx,f.extracted),{name:'CharacterCandidateReviewRequiredError'});
 assert.equal(await f.db.characterCandidate.count(),1);
});
test('candidate writes reject a replaced worker, changed unit claim and same-normalized edited manuscript',async t=>{
 for(const failure of ['worker','claim','manuscript']){
  const f=await fixture(t);
  if(failure==='worker')await f.db.directorNextRunControl.update({where:{runId:f.contract.runId},data:{leaseOwner:'other-worker'}});
  if(failure==='claim')await f.db.productionUnitRun.update({where:{id:f.ctx.run.id},data:{activeRequestKey:'replacement'}});
  if(failure==='manuscript')await f.db.chapter.update({where:{id:'chapter-1'},data:{content:' '+f.ctx.content}});
  await assert.rejects(f.prepare(f.ctx,f.extracted));assert.equal(await f.db.characterCandidate.count(),0);assert.equal(await f.db.character.count(),0);
 }
});
