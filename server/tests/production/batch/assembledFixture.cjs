const assert=require('node:assert/strict');
const {fixture:base}=require('./fixture.cjs');
const {request}=require('../application/harness.cjs');
const {assessmentResult}=require('../application/assessmentFixture.cjs');
const {output}=require('../persistence/outputs.cjs');
const {claimModelRequest}=require('../../../dist/platform/llm/retries');
const {captureInvocationUsageObserver}=require('../../../dist/platform/llm/usage');
const native=require('../../../dist/services/novel/runtime/acceptance/retries/ChapterReviewRetryBudget');
async function fixture(t,options={}) {
 const f=await base(t),{db,kernel:k,api,context}=f;
 f.contract.launchInput={chapterTokenLimit:10000};
 await db.directorNextRun.update({where:{id:'batch-1'},data:{contractJson:JSON.stringify(f.contract)}});
 await db.chapter.update({where:{id:'chapter-1'},data:{content:''}});
 for(const order of [2,3])await db.chapter.create({data:{id:`chapter-${order}`,novelId:'novel-1',order,title:`第 ${order} 章`,content:''}});
 await db.character.create({data:{id:'hero',novelId:'novel-1',name:'主角',role:'主角',personality:'',background:'',development:''}});
 const guard=api.createKernelOwnership(context),budget=api.createKernelChapterBudget(db,context),review=api.createKernelReviewBudget(db,context);
 const checkpoints=new k.PrismaArtifactCheckpointStore(db,guard),lifecycle=new k.ProductionChapterLifecycleService();
 const store=new k.PrismaUnitProgressStore(db,{assertOwnership:guard,writeChapter:lifecycle.commit.bind(lifecycle),finalizeChapter:lifecycle.finalizeSelected.bind(lifecycle)});
 const calls=[],requests=new Map();let invocation=0;
 const body=order=>`第 ${order} 章：主角在城门交出钥匙，答应返回。`,candidate=body(2)+' 他向守卫说明了返回的时间。';
 async function fence(run) {
  await api.assertKernelOwnership(db,context);
  const current=await db.chapter.findUniqueOrThrow({where:{id:run.progress.unit.chapterId}});
  if(run.progress.committedContentHash)assert.equal(k.hashProductionContent(current.content),run.progress.committedContentHash,'committed manuscript changed');
  else if(run.artifacts.prepared) {
   const baseline=run.artifacts.prepared.baseline;
   assert.equal(current.content,baseline.content,'prepared manuscript changed');
   assert.equal(current.updatedAt.toISOString(),baseline.updatedAt,'prepared chapter version changed');
  }
 }
 async function physical(run,stage,result) {
  await claimModelRequest();calls.push(`${run.progress.unit.order}:${stage}`);
  await captureInvocationUsageObserver()({invocationId:`physical-${++invocation}`,runId:'batch-1',novelId:'novel-1',
   chapterId:run.progress.unit.chapterId,status:'completed',usage:{totalTokens:10},startedAt:new Date(0),finishedAt:new Date(1)});
  return result;
 }
 const scoped=(run,key,operation)=>api.runKernelRequestScope({unit:run.progress.unit,requestKey:key,maxRequests:8,
  reserveTokens:100,budget,fence:()=>fence(run)},operation);
 const describePrompt=async input=>({identity:'registered-fixture',promptVersion:'v1',provider:'test',model:'fake-model',outputTokens:100,
  contextWindow:100000,renderedInput:JSON.stringify(input)});
 const wrap=port=>({...port,invoke:(ctx,prepared,key)=>scoped(ctx.run,key,()=>port.invoke(ctx,prepared,key))});
 function stages() {
  const timeline=k.createTimelineArtifactPorts({describePrompt,extractor:{extractFromChapter:async()=>({events:[],hooks:[],addressedHookIds:[],resolvedHookIds:[]}),normalizeEvents:()=>[],normalizeHooks:()=>[]},
   checker:{checkChapter:()=>({status:'passed',score:1,issues:[]})},consumer:k.createTimelineConsumer({checkpoints,forTransaction:require('../persistence/nativeServices.cjs').timeline()})});
  const timelineInvoke=timeline.extraction.invoke.bind(timeline.extraction);
  timeline.extraction=wrap({...timeline.extraction,invoke:async(ctx,prepared,key)=>{await physical(ctx.run,'timeline',null);return timelineInvoke(ctx,prepared,key)}});
  const full=k.createPayoffExtractionPort({read:k.createPayoffSourceReader(db),describePrompt,invokePrompt:async()=>({output:{items:[]}})});
  const fullInvoke=full.invoke.bind(full);
  const reconcile=k.createReconcileStage({executionToken:()=>context.execution.leaseOwner,ports:{checkpoints,
   extraction:wrap({prepare:async ctx=>({inputFingerprint:k.hashProductionContent(ctx.content),outputTokens:100,input:{content:ctx.content}}),
    invoke:ctx=>physical(ctx.run,'extract',output()),validate:x=>x}),
   consumers:k.createArtifactConsumers({checkpoints}),timeline,fullReconcile:wrap({...full,invoke:async(ctx,prepared,key)=>{await physical(ctx.run,'full',null);return fullInvoke(ctx,prepared,key)}}),
   fullReconcileConsumer:k.createFullPayoffConsumer({checkpoints}),fence:ctx=>fence(ctx.run),reserve:async ctx=>(await budget.read(ctx.run.progress.unit)).remaining>=100}});
  const services={purpose:'automatic',readBaseline:async unit=>{const row=await db.chapter.findUniqueOrThrow({where:{id:unit.chapterId}});return{content:row.content,updatedAt:row.updatedAt.toISOString(),protectedUserContent:false}},
   prepare:async run=>({novelTitle:'书',chapterTitle:'章',contextPackage:{chapter:{order:run.progress.unit.order},timelineContext:{chapterIndex:run.progress.unit.order,previousEvents:[],openHooks:[],plannedEventsThisChapter:[],forbiddenEvents:[]}}}),
   describe:async(stage,run,input)=>({callsModel:['draft','accept','repair','verify'].includes(stage),...(run.snapshots.profile.outputBudgets[stage]?{outputTokens:run.snapshots.profile.outputBudgets[stage]}:{}),
    inputFingerprint:k.hashProductionContent(JSON.stringify(input)),input,promptVersion:'v1',configVersion:'v1'}),
   scoped:(run,call,operation)=>scoped(run,run.activeRequestKey,operation),write:run=>physical(run,'draft',body(run.progress.unit.order)),
   assess:input=>review(input.run,async()=>{
    const run=input.run,checking=Boolean(input.repairReviewBaseline),b=native.currentChapterReviewRetryBudget();
    const patch=run.progress.unit.order===2&&!checking?{status:'repairable',blockingIssues:[{code:'missing-action',severity:'high',category:'plot',evidence:input.content,fixSuggestion:'说明返回时间'}],repairDirectives:[{mode:'patch',target:'plot',instruction:'说明返回时间'}]}:{};
    if(checking)patch.repairVerification={contentHash:k.hashProductionContent(input.content),checks:[],factPreservation:{sourceContentHash:k.hashProductionContent(body(2)),status:'preserved',correctionIssueIds:[],currentEvidence:input.content,reason:'保留事实'}};
    const result=await b.runCheck(checking?'candidate':'initial',()=>physical(run,checking?'verify':'accept',assessmentResult(patch)));
    await b.recordResult(checking?'candidate':'initial',true);
    if(options.editThird&&run.progress.unit.order===3)await db.chapter.update({where:{id:'chapter-3'},data:{content:'人工保留的第三章'}});
    return result;
   }),repair:input=>physical(input.run,'repair',{content:candidate}),knownRepairFailure:()=>null};
  return k.createChapterStagePorts(services,{reconcile});
 }
 const readChapters=()=>db.chapter.findMany({where:{novelId:'novel-1',order:{gte:1,lte:3}},orderBy:{order:'asc'},select:{id:true,novelId:true,order:true,content:true}});
 const handler=api.createKernelChapterBatchHandler({assertActive:()=>api.assertKernelOwnership(db,context),readChapters,
  readOutcome:(_ctx,chapter)=>api.readKernelUnitOutcome(db,f.contract,chapter),hashBatch:chapters=>k.hashProductionContent(JSON.stringify(chapters)),
  runChapter:async(_ctx,chapter)=>{
   let req=request({ownerKey:api.productionBatchOwnerKey('batch-1'),unit:{novelId:'novel-1',chapterId:chapter.id,order:chapter.order}});
   req.profile.reconcile='strict';req.profile.capabilities=['character_state','causal_closure'];requests.set(chapter.id,req);
   return k.runUnit(req,{store,stages:stages(),fence,budget:{reserve:async input=>({accepted:true,reservationKey:input.requestKey})}});
  }});
 return {...f,calls,handler,body,candidate,budget,requests,store,stages,fence,readChapters};
}
module.exports={fixture};
