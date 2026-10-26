const test=require('node:test'),assert=require('node:assert/strict');
const {nativeFixture}=require('./preparation/nativeFixture.cjs');
for(const fault of [null,'after_models','assembly'])test(`native preparation uses persisted contract and planner results across ${fault||'normal execution'}`,async t=>{
 const f=await nativeFixture(t,fault),before=await f.db.chapter.findUniqueOrThrow({where:{id:'chapter-1'}});
 let reply;
 if(fault){await assert.rejects(()=>f.execute(),/exit/);reply=await f.stage.recover(f.run,'prepare-request');}
 else reply=await f.execute();
 assert.equal(reply.result.stage,'prepare');assert.equal(f.state.models,3);
 const chapter=await f.db.chapter.findUniqueOrThrow({where:{id:'chapter-1'}});
 assert.equal(chapter.content,before.content);assert.match(chapter.taskSheet,/完成钥匙交接/);
 assert.equal(await f.db.storyPlan.count({where:{level:'chapter'}}),1);assert.equal(await f.db.chapterPlanScene.count(),3);
 assert.deepEqual(await f.stage.recover(f.run,'prepare-request'),reply);assert.equal(f.state.models,3);
 assert.deepEqual(await f.db.chapter.findUniqueOrThrow({where:{id:'chapter-1'}}),chapter);
 const requests=f.state.requests;assert.equal(requests.filter(input=>input.options.maxTokens===3200).length,1);
 assert.ok(requests.every(input=>input.promptInput));
});
test('preparation reuses a current native chapter plan without another model call or planning overwrite',async t=>{
 const f=await nativeFixture(t,'reuse_plan'),before=await f.db.chapter.findUniqueOrThrow({where:{id:'chapter-1'}});
 const plan=await f.db.storyPlan.findUniqueOrThrow({where:{id:'existing-chapter-plan'},include:{scenes:true}});
 assert.equal((await f.execute()).result.stage,'prepare');assert.equal(f.state.models,0);
 assert.deepEqual(await f.db.chapter.findUniqueOrThrow({where:{id:'chapter-1'}}),before);
 assert.deepEqual(await f.db.storyPlan.findUniqueOrThrow({where:{id:'existing-chapter-plan'},include:{scenes:true}}),plan);
});
test('a manual workspace edit after contract commit stops before another paid planning request',async t=>{
 const f=await nativeFixture(t,'workspace_after_contract');
 await assert.rejects(()=>f.execute(),/version|snapshot|版本/i);assert.equal(f.state.models,2);
 assert.equal(await f.db.storyPlan.count({where:{level:'chapter'}}),0);
 assert.match((await f.db.volumePlanVersion.findUniqueOrThrow({where:{id:'version-1'}})).contentJson,/人工保留的卷纲修订/);
});
test('a manual workspace edit after chapter plan commit prevents publishing the outer preparation receipt',async t=>{
 const f=await nativeFixture(t,'workspace_after_plan');
 await assert.rejects(()=>f.execute(),/version|snapshot|版本/i);assert.equal(f.state.models,3);
 assert.equal(await f.db.storyPlan.count({where:{level:'chapter'}}),1);
 assert.match((await f.db.volumePlanVersion.findUniqueOrThrow({where:{id:'version-1'}})).contentJson,/人工保留的卷纲修订/);
});
