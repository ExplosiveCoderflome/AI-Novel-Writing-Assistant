const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./batch/assembledFixture.cjs');
test('three real chapter units publish formal reports and assets once, with one verified repair in chapter two',async t=>{
 const f=await fixture(t);const result=await f.handler(f.context);
 assert.equal(result.stopSignal,undefined);assert.match(result.artifact.contentRef,/chapter_batch_closed/);
 const chapters=await f.db.chapter.findMany({where:{novelId:'novel-1'},orderBy:{order:'asc'}});
 assert.deepEqual(chapters.map(c=>c.content),[f.body(1),f.candidate,f.body(3)]);
 assert.ok(chapters.every(c=>c.generationState==='approved'&&c.chapterStatus==='completed'));
 assert.deepEqual(f.calls.filter(x=>/repair|verify/.test(x)),['2:repair','2:verify']);
 for(const name of ['chapterSummary','storyStateSnapshot','chapterTimeAnchor','timelineCheckReport'])assert.equal(await f.db[name].count(),3,name);
 assert.equal(await f.db.auditReport.count(),3);assert.equal(await f.db.generationJob.count(),0);
 assert.equal(await f.db.ragIndexJob.count(),6);
 const calls=[...f.calls],reports=await f.db.auditReport.findMany({orderBy:{id:'asc'}});
 await f.handler(f.context);assert.deepEqual(f.calls,calls);assert.deepEqual(await f.db.auditReport.findMany({orderBy:{id:'asc'}}),reports);
 const second=await f.api.readKernelUnitOutcome(f.db,f.contract,chapters[1]);assert.equal(second.status,'completed');assert.equal(second.progress.selected,'candidate');
 assert.equal((await f.budget.read(second.progress.unit)).used,70);
});
test('a human edit during chapter three preserves the first two completed chapters and never overwrites or replays their models',async t=>{
 const f=await fixture(t,{editThird:true});
 await assert.rejects(()=>f.handler(f.context),/manuscript changed/);
 const chapters=await f.db.chapter.findMany({where:{novelId:'novel-1'},orderBy:{order:'asc'}});
 assert.deepEqual(chapters.map(c=>c.content),[f.body(1),f.candidate,'人工保留的第三章']);
 assert.equal(chapters[0].generationState,'approved');assert.equal(chapters[1].generationState,'approved');assert.notEqual(chapters[2].chapterStatus,'completed');
 const calls=[...f.calls];await assert.rejects(()=>f.handler(f.context),/manuscript changed/);assert.deepEqual(f.calls,calls);
 assert.equal(await f.db.chapterSummary.count(),2);assert.equal(await f.db.auditReport.count(),2);
});
