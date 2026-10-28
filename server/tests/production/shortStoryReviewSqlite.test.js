const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module');
const {setup}=require('./persistence/sqliteFixture.cjs');
const requests=require('../../dist/platform/llm/retries');
const assets=require('../../dist/prompting/prompts/shortStory/shortStory.prompts');
const issue={code:'local_pacing',severity:'standard',description:'原稿局部推进略慢',affectedSegmentOrders:[1]};
const audit=decision=>({decision,summary:'完整审校结果',issues:decision==='accepted'?[]:[issue]});
async function fixture(t,options={}){
 const f=await setup(t),task=await f.db.novelWorkflowTask.create({data:{novelId:'novel-1',lane:'creation_studio',title:'短篇测试',status:'running'}});
 const intent=await f.db.novelIntentVersion.create({data:{novelId:'novel-1',workflowTaskId:task.id,version:1,originalExpression:'测试',structuredIntentJson:'{}'}});
 const row=await f.db.shortStoryPlan.create({data:{novelId:'novel-1',intentVersionId:intent.id,targetWordCount:3000,endingPromise:'兑现结局',structureJson:'{}',segments:{create:[1,2].map(order=>({novelId:'novel-1',order,targetWordCount:1500,content:`原稿${order}`,status:'completed',version:5}))}},include:{segments:{orderBy:{order:'asc'}}}});
 const state={audits:0,calls:[],checkpoints:[],onReview:options.onReview};
 class Workflow{async markTaskRunning(){}async recordCheckpoint(_id,value){state.checkpoints.push(value);}}
 const invoke=async request=>{
  await requests.claimModelRequest({configuration:{provider:'openai',model:'fixture-model',maxTokens:request.options.maxTokens??8192,modelKwargs:options.modelKwargs},
   input:request.asset.render(request.promptInput,{}),options:{response_format:{type:'json_object'}}});
  state.calls.push(request.asset.id);
  if(request.asset===assets.shortStoryPatchRepairPrompt)return{output:{patches:[{segmentOrder:1,content:options.patch??'通过复验的候选稿'}],residualQualityDebt:[]}};
  state.audits++;
  if(state.audits===2&&state.onReview)await state.onReview(f.db,row.segments);
  return{output:audit(state.audits===1?'patchable':options.review??'accepted')};
 };
 const target=require.resolve('../../dist/modules/novel/short-story/application/ShortStoryProductionService'),original=Module._load;
 delete require.cache[target];
 Module._load=function(id,parent,...rest){
  if(parent?.filename===target){
   if(id.endsWith('db/prisma'))return{prisma:f.db};
   if(id.endsWith('core/promptRunner'))return{runStructuredPrompt:invoke};
   if(id.endsWith('workflow/NovelWorkflowService'))return{NovelWorkflowService:Workflow};
  }
  return original.call(this,id,parent,...rest);
 };
 let Service;try{Service=require(target).ShortStoryProductionService;}finally{Module._load=original;}
 const service=new Service({v2Enabled:()=>options.enabled!==false,readAuditContextWindow:async()=>options.window??1000000});
 const context={task,novel:{id:'novel-1'},intent:{originalIdea:'原始想法',understanding:'确认的意图',direction:{}},productionFoundation:options.foundation??'',platform:null};
 return{...f,row,state,run:()=>service.auditAndRepair(context,{row,contract:{segments:[]}},row.segments),
  rows:()=>f.db.shortStorySegment.findMany({where:{planId:row.id},orderBy:{order:'asc'}})};
}
test('rejected repair cannot roll back a human edit in an unpatched segment',async t=>{
 const f=await fixture(t,{review:'patchable',onReview:async(db,rows)=>db.shortStorySegment.update({where:{id:rows[1].id},data:{content:'用户刚保存的新正文',version:{increment:1},userEditedAt:new Date()}})});
 await f.run();const rows=await f.rows();assert.equal(rows[1].content,'用户刚保存的新正文');assert.equal(rows[0].content,'原稿1');
});
test('the candidate is invisible in saved prose until its second review accepts it',async t=>{
 const f=await fixture(t,{onReview:async(db,rows)=>assert.equal((await db.shortStorySegment.findUniqueOrThrow({where:{id:rows[0].id}})).content,'原稿1')});
 await f.run();const rows=await f.rows();assert.equal(rows[0].content,'通过复验的候选稿');assert.equal(rows[0].version,6);assert.equal(f.state.audits,2);
});
test('an accepted candidate cannot publish against prose edited during review',async t=>{
 const f=await fixture(t,{onReview:async(db,rows)=>db.shortStorySegment.update({where:{id:rows[1].id},data:{content:'用户的新正文',version:{increment:1},userEditedAt:new Date()}})});
 await assert.rejects(f.run(),/version|正文.*更新|modified/i);const rows=await f.rows();assert.equal(rows[0].content,'原稿1');assert.equal(rows[1].content,'用户的新正文');
});
test('full audit includes the production foundation in its pre-dispatch context budget',async t=>{
 const f=await fixture(t,{window:16000,foundation:'完整设定'.repeat(6000)});await f.run();
 assert.equal(f.state.calls.length,0);assert.equal(f.state.checkpoints.at(-1).checkpointType,'step_review_required');assert.equal((await f.rows())[0].content,'原稿1');
});
test('second review checks its own larger candidate input before any review dispatch',async t=>{
 const f=await fixture(t,{window:40000,patch:'修整正文'.repeat(10000)});await f.run();
 assert.equal(f.state.audits,1);assert.equal(f.state.calls.length,2);assert.equal((await f.rows())[0].content,'原稿1');assert.equal(f.state.checkpoints.at(-1).checkpointType,'step_review_required');
});
test('model constructor payload participates in the physical audit input budget',async t=>{
 const f=await fixture(t,{window:16000,modelKwargs:{system:'配置中的输入'.repeat(6000)}});await f.run();assert.equal(f.state.calls.length,0);
});
test('a rejected candidate retains the original audit debt instead of escalating its own replan',async t=>{
 const f=await fixture(t,{review:'replan_required'});await f.run();assert.equal((await f.rows())[0].content,'原稿1');
 assert.equal(f.state.checkpoints.at(-1).checkpointType,'workflow_completed');const plan=await f.db.shortStoryPlan.findUniqueOrThrow({where:{id:f.row.id}});assert.deepEqual(JSON.parse(plan.qualityDebtJson),['原稿局部推进略慢']);
});
test('the disabled switch keeps the existing single audit and direct repair behavior',async t=>{
 const f=await fixture(t,{enabled:false,window:null});await f.run();assert.equal(f.state.audits,1);assert.equal(f.state.calls.length,2);assert.equal((await f.rows())[0].content,'通过复验的候选稿');
});
