const test=require('node:test'),assert=require('node:assert/strict');
const {nativeFixture}=require('./production/preparation/nativeFixture.cjs');
async function adopted(t){
 const f=await nativeFixture(t),{createEmptyOutlineDocument}=require('@ai-novel/shared/types/outline');
 const {mapOutlineBook}=require('../dist/modules/planning/outline/openBook/domain/mapping');
 const row=await f.db.volumePlanVersion.findUniqueOrThrow({where:{id:'version-1'}}),w=JSON.parse(row.contentJson),v=w.volumes[0],c=v.chapters[0];
 c.purpose='完成钥匙交接并保留作者调查方向';await f.db.volumePlanVersion.update({where:{id:'version-1'},data:{contentJson:JSON.stringify(w)}});await f.db.$transaction(tx=>require('../dist/services/novel/volume/volumeWorkspacePersistence').persistActiveVolumeWorkspace(tx,'novel-1',w,'version-1'));
 const d=createEmptyOutlineDocument('采用的大纲');d.story.premise='保留调查方向';d.volumes=[{nodeId:'v',order:0,title:v.title,summary:v.summary??'',planningDepth:'rough',chapterNodeIds:['c']}];d.chapters=[{nodeId:'c',volumeNodeId:'v',order:0,title:c.title,summary:c.summary??'',purpose:c.purpose??'',planningDepth:'rough',characterNodeIds:[],payoffNodeIds:[]}];
 const mapped=mapOutlineBook(d,{revisionId:'source-r',expectedProjectVersion:1,bookSettings:{title:d.story.title,estimatedChapterCount:3,defaultChapterLength:3000},volumeQuotas:{v:3},allowOptimize:[]},'source-binding');
 Object.assign(mapped.mapping.volumes[0],{volumeId:v.id});Object.assign(mapped.mapping.chapters[0],{volumeId:v.id,planId:c.id,chapterId:'chapter-1'});
 await f.db.outlineProject.create({data:{id:'source-p',title:d.story.title,currentVersion:1,currentRevisionId:'source-r',boundNovelId:'novel-1'}});
 await f.db.outlineRevision.create({data:{id:'source-r',projectId:'source-p',version:1,sourceType:'manual',documentJson:JSON.stringify(mapped.document)}});
 await f.db.outlineBookBinding.create({data:{id:'source-binding',projectId:'source-p',revisionId:'source-r',revisionVersion:1,novelId:'novel-1',sourceDocumentHash:mapped.sourceDocumentHash,requestKey:'source-request',requestHash:mapped.requestHash,mappingJson:JSON.stringify(mapped.mapping),policyJson:JSON.stringify(mapped.policy),postCreateStateJson:'{}'}});
 const scope=require('../dist/modules/planning/outline/constraints'),state=await scope.readOutlinePlanningState(f.db,'novel-1');
 return {...f,scope,planningState:state,before:w};
}
test('adopted rough chapter completes native contract and chapter plan with persisted source identity',async t=>{
 const f=await adopted(t);
 await f.scope.withOutlinePlanningState(f.planningState,async()=>{const descriptor=await f.stage.describe(f.run),run={...f.run,artifacts:{...f.run.artifacts,activeDescriptor:descriptor}};const result=await f.stage.execute(run,{...descriptor,requestKey:'prepare-request'});assert.equal(result.result.stage,'prepare');assert.equal(f.planningState.ref.revisionId,'source-r');});
 assert.equal(f.state.models,3);
 const chapter=await f.db.chapter.findUniqueOrThrow({where:{id:'chapter-1'}});assert.match(chapter.taskSheet,/完成钥匙交接/);assert.equal(await f.db.storyPlan.count({where:{level:'chapter'}}),1);
 const after=JSON.parse((await f.db.volumePlanVersion.findUniqueOrThrow({where:{id:'version-1'}})).contentJson);assert.equal(after.volumes[0].chapters[0].summary,f.before.volumes[0].chapters[0].summary);assert.equal(after.volumes[0].chapters[0].id,f.before.volumes[0].chapters[0].id);assert.equal(after.volumes[0].chapters[0].purpose,'完成钥匙交接并保留作者调查方向');
});
test('native source policy conflict rejects stale preparation before another model or contract commit',async t=>{
 const f=await adopted(t);
 await f.scope.withOutlinePlanningState(f.planningState,async()=>{const descriptor=await f.stage.describe(f.run),run={...f.run,artifacts:{...f.run.artifacts,activeDescriptor:descriptor}};await f.db.outlineBookBinding.update({where:{id:f.planningState.ref.bindingId},data:{policyVersion:2}});await assert.rejects(()=>f.stage.execute(run,{...descriptor,requestKey:'prepare-request'}),e=>e.code==='OUTLINE_POLICY_CONFLICT');});
 assert.equal(f.state.models,0);assert.equal(await f.db.storyPlan.count({where:{level:'chapter'}}),0);assert.equal((await f.db.chapter.findUniqueOrThrow({where:{id:'chapter-1'}})).taskSheet,null);
});
