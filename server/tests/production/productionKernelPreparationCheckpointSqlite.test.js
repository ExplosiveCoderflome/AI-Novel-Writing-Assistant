const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./preparation/fixture.cjs');
test('preparation checkpoint writes and receipts require the prepare claim without a committed manuscript',async t=>{
 const f=await fixture(t),identity=f.identity('contract_commit'),claim=await f.checkpoints.claim(identity);
 assert.equal(claim.status,'claimed');
 const value=await f.checkpoints.applyConsumer(claim.claim,async tx=>{
   await tx.chapter.update({where:{id:'chapter-1'},data:{taskSheet:'本章执行目标'}});return{saved:true};
 });
 assert.deepEqual(value,{saved:true});assert.deepEqual(await f.checkpoints.claim(identity),{status:'cached',value:{saved:true}});
 assert.equal((await f.db.chapter.findUnique({where:{id:'chapter-1'}})).taskSheet,'本章执行目标');
});
test('preparation and reconciliation checkpoints cannot borrow each others stage ownership',async t=>{
 const f=await fixture(t),identity=f.identity('snapshot');
 await assert.rejects(()=>new f.kernel.PrismaArtifactCheckpointStore(f.db,f.assertOwnership).claim(identity));
 await f.db.productionUnitRun.update({where:{id:f.run.id},data:{activeStage:'reconcile'}});
 await assert.rejects(()=>f.checkpoints.claim(identity));assert.equal(await f.db.chapterArtifactSyncCheckpoint.count(),0);
});
test('a preparation model with an unknown outcome keeps its claim across workers and rejects edited prose',async t=>{
 const f=await fixture(t),identity={...f.identity('contract_model'),kind:'model'};
 const first=await f.checkpoints.claim(identity);assert.equal(first.status,'claimed');
 await f.checkpoints.fail(first.claim);assert.equal((await f.checkpoints.claim(identity)).status,'unknown');
 await f.db.chapter.update({where:{id:'chapter-1'},data:{content:'人工改稿'}});
 await assert.rejects(()=>f.checkpoints.succeed(first.claim,{output:'late'}));
 assert.equal((await f.db.chapterArtifactSyncCheckpoint.findFirst()).status,'running');
});
