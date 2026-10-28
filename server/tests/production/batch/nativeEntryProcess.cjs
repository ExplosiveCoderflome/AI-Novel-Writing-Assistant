const assert=require('node:assert/strict');
const {createRequire}=require('node:module'),path=require('node:path');
const fromServer=createRequire(path.resolve(__dirname,'../../../package.json'));
// The parent supplies a newly created full-schema SQLite file. Nothing reads the workspace database.
assert.match(process.env.DATABASE_URL,/kernel-consumers-/);
const {PrismaClient}=fromServer('@prisma/client'),{PrismaBetterSqlite3}=fromServer('@prisma/adapter-better-sqlite3');
const db=new PrismaClient({adapter:new PrismaBetterSqlite3({url:process.env.DATABASE_URL})});global.prisma=db;
const http=[];
global.fetch=async(url,options={})=>{
 if(process.env.KERNEL_TEST_CASE!=='rag')throw Error('External HTTP is forbidden in native entry tests');
 const path=new URL(url).pathname,method=options.method??'GET';http.push({path,method});
 if(path.endsWith('/embeddings'))return Response.json({data:JSON.parse(options.body).input.map((_value,index)=>({index,embedding:[1,2,3]})),usage:{prompt_tokens:10,total_tokens:10}});
 if(path.includes('/collections/')&&method==='GET')return Response.json({result:{config:{params:{vectors:{size:3}}},
  payload_schema:Object.fromEntries(['tenantId','ownerType','ownerId','novelId','worldId','characterRole','chapterAnchor','genreTags','sellingPointTags'].map(field=>[field,{data_type:'keyword'}]))}});
 if(path.endsWith('/points/search')&&method==='POST')return Response.json({result:[]});
 throw Error(`Unexpected indexing write or HTTP route: ${method} ${path}`);
};
async function prepareNativeFixture(){
 const native=require('../planning/contractServiceFixture.cjs').fixture();
 const document=native.workspace,target=document.volumes[0].chapters[0];
 document.beatSheets=[{volumeId:document.volumes[0].id,volumeSortOrder:1,status:'generated',beats:[{
  key:'opening',label:'开篇',title:'线索推进',summary:'核对线索后推进调查。',chapterSpanHint:'1-3',mustDeliver:['核实线索来源']}]}];
 await db.volumePlanVersion.create({data:{id:'version-1',novelId:'novel-1',version:1,status:'active',contentJson:JSON.stringify(document)}});
 await db.$transaction(tx=>require('../../../dist/services/novel/volume/volumeWorkspacePersistence').persistActiveVolumeWorkspace(tx,'novel-1',document,'version-1'));
 const chapter=await db.chapter.update({where:{id:'chapter-1'},data:{content:'',taskSheet:target.taskSheet,sceneCards:target.sceneCards,
  targetWordCount:target.targetWordCount,conflictLevel:target.conflictLevel,revealLevel:target.revealLevel,mustAvoid:target.mustAvoid}});
 const hash=require('../../../dist/services/planner/plannerPersistence').buildChapterExecutionContractHash(chapter);
 await db.storyPlan.create({data:{id:'saved-plan',novelId:'novel-1',chapterId:'chapter-1',level:'chapter',title:'本章规划',objective:'核实证据',
  rawPlanJson:JSON.stringify({executionContractHash:hash}),scenes:{create:{sortOrder:1,title:'城门',objective:'交出钥匙'}}}});
 await db.character.create({data:{id:'hero',novelId:'novel-1',name:'主角',role:'主角',personality:'',background:'',development:''}});
 if(process.env.KERNEL_TEST_CASE!=='rag')await db.payoffLedgerItem.create({data:{novelId:'novel-1',ledgerKey:'planned-return',title:'返回约定',summary:'计划中的约定',scopeType:'book',currentStatus:'setup'}});
}
function installNativeTransport(respond){
 const factory=require('../../../dist/llm/factory'),route=require('../../../dist/llm/modelRouter');
 const execution=require('../../../dist/platform/llm/execution'),usage=require('../../../dist/llm/usageTracking');
 const clients=new WeakMap(),calls=[];
 route.resolveModel=async(task,options)=>({provider:options.provider??'openai',model:options.model??'fixture-model',temperature:options.temperature??0.2,
  maxTokens:options.maxTokens??8192,requestProtocol:'openai_compatible',structuredResponseFormat:'auto',routeKey:task,routeDegraded:false});
 factory.setProviderSecretCache('openai',{key:'fixture-key',baseURL:'https://models.invalid/v1',reasoningEnabled:false});
 const make=configuration=>{
  execution.assertLlmExecutionConfiguration(configuration);
  const client=execution.attachLlmExecutionPolicy(usage.attachLLMUsageTracking({invoke:async()=>{throw Error('stream transport required');},
   batch:async()=>{throw Error('one request required');},stream:async function*(input){
    const text=input.map(message=>String(message.content)).join('\n');calls.push({task:configuration.taskType,maxTokens:configuration.maxTokens,text});
    let output;
    if(configuration.taskType==='writer')output='主角在城门交出钥匙，答应返回。'.repeat(160);
    else if(text.includes('addressedHookIds')&&text.includes('resolvedHookIds'))output={events:[],hooks:[],addressedHookIds:[],resolvedHookIds:[]};
    else if(text.includes('characterLocationDeltas'))output=require('../persistence/outputs.cjs').output();
    else if(text.includes('ledgerKey')&&text.includes('items'))output={items:[]};
    else if(configuration.taskType==='review')output={...require('../application/assessmentFixture.cjs').assessmentResult(process.env.KERNEL_TEST_CASE==='quality'?{
      status:'needs_manual_review',repairability:'rewrite_needed',continuePolicy:'pause',blockingIssues:[{code:'plot-unresolved',category:'plot',severity:'high',evidence:'约定尚待核对',fixSuggestion:'人工核对约定'}]}:{}).assessment,
      styleReview:{riskScore:0,summary:'已核对写法',observations:[],perspectiveCheck:{observed:'third_person',evidence:'主角在城门交出钥匙'}}};
    else if(configuration.taskType==='planner'&&respond)output=require('../planning/chapterFixture.cjs').fixture().output;
    else if(configuration.taskType==='repair'&&respond)output={};
    else throw Error(`Unexpected native request ${configuration.taskType}: ${text.slice(0,200)}`);
    if(respond)output=await respond(configuration,text,output);
    yield{content:typeof output==='string'?output:JSON.stringify(output),usage_metadata:{input_tokens:10,output_tokens:10,total_tokens:20}};
   }},configuration),configuration);clients.set(client,configuration);return client;
 };
 factory.createLLMFromResolvedOptions=make;factory.getLLM=async(provider,options)=>make(await factory.resolveLLMClientOptions(provider,options));
 factory.getResolvedLLMClientOptionsFromInstance=client=>clients.get(client);
 if(process.env.KERNEL_TEST_CASE==='rag')require('../../../dist/services/payoff/PayoffLedgerSyncService').payoffLedgerSyncService.syncLedger=async()=>{throw Error('Unprotected empty-ledger synchronization');};
 require('../../../dist/services/novel/novelCorePipelineService').NovelCorePipelineService.prototype.startPipelineJob=async()=>{throw Error('legacy-entry-was-used');};
 return{calls,http};
}
async function main(){
 if(!process.env.KERNEL_TEST_REPLAY)await prepareNativeFixture();
 const{calls}=installNativeTransport();
 const {createDirectorProductionOptions}=require('../../../dist/app/director/productionComposition');
 const options=createDirectorProductionOptions();
 const contract=options.contractFactory({runId:'live-entry',novelId:'novel-1',driver:'auto',stepIdsInScope:['chapter_batch'],launchInput:{
  storyInput:'故事',estimatedChapterCount:1,chapterTokenLimit:process.env.KERNEL_TEST_CASE==='budget'?17000:500000,
  issuePolicyMode:process.env.KERNEL_TEST_CASE==='quality'?'quality_first':'completion_first',worldMode:'skip',targetMode:'opening',provider:'openai',model:'fixture-model',executionRange:{from:1,to:1}}});
 contract.executionEpoch=0;
 if(!process.env.KERNEL_TEST_REPLAY){
 await db.novel.update({where:{id:'novel-1'},data:{directorVersion:'v2'}});
 await db.directorNextRun.create({data:{id:contract.runId,novelId:contract.novelId,driver:'auto',planVersion:contract.planVersion,contractJson:JSON.stringify(contract)}});
 await db.directorNextRunControl.create({data:{runId:contract.runId,novelId:contract.novelId,version:2,status:'running',cursorStepId:'chapter_batch',leaseOwner:'native-worker',leaseExpiresAt:new Date(Date.now()+120000)}});
 }
 if(['quality','budget'].includes(process.env.KERNEL_TEST_REPLAY)){
  await db.directorNextRunControl.update({where:{runId:contract.runId},data:{status:'paused',cursorStepId:null,leaseOwner:null,leaseExpiresAt:null,
   pauseJson:JSON.stringify({kind:'manual_recovery',reason:'saved structured stop'})}});
  const {PrismaCommandRepository}=require('../../../dist/modules/director/infrastructure');
  const {resumeBusiness}=require('../../../dist/app/director/savedContent');
  const unit=await db.productionUnitRun.findFirstOrThrow({where:{ownerKey:`director_next:${contract.runId}:chapter_batch`}});
  const grant=process.env.KERNEL_TEST_REPLAY==='budget'?{chapterBudget:{jobId:unit.id,chapterId:'chapter-1',metric:'uncached_tokens_v1',tokenLimit:100000}}:{};
  await new PrismaCommandRepository(db,{resumeBusiness}).transition({id:'explicit-resume',idempotencyKey:'explicit-resume-once',runId:contract.runId,
   type:'resume',expectedVersion:2,event:{type:'resume'},...grant});
  await db.directorNextRunControl.update({where:{runId:contract.runId},data:{cursorStepId:'chapter_batch',leaseOwner:'native-worker',leaseExpiresAt:new Date(Date.now()+120000)}});
 }
 const current=await db.directorNextRunControl.findUniqueOrThrow({where:{runId:contract.runId}});
 const context={runId:contract.runId,contract,control:{version:current.version,status:'running',pause:null,gate:null,cursorStepId:'chapter_batch',failureReason:null},
  execution:{leaseOwner:'native-worker'},facts:{artifacts:[],debts:[],stopSignal:null},step:options.plan.steps.find(step=>step.id==='chapter_batch')};
 if(process.env.KERNEL_TEST_CASE==='budget'&&!process.env.KERNEL_TEST_REPLAY){
  // Explicit prior paid usage fixture; the actual entry must deny its next unsent writer request.
  const budget=require('../../../dist/app/director/productionKernel').createKernelChapterBudget(db,context);
  const unit={novelId:'novel-1',chapterId:'chapter-1',order:1};
  await budget.reserve(unit,'prior-preparation',16000);
  await budget.observe(unit,'prior-preparation',{invocationId:'prior-preparation',runId:contract.runId,novelId:'novel-1',chapterId:'chapter-1',
    status:'completed',usage:{totalTokens:16000},startedAt:new Date(0),finishedAt:new Date(1)});
 }
 const result=await options.stepRegistry.get('chapter_batch')(context);
 const units=await db.productionUnitRun.findMany({where:{ownerKey:`director_next:${contract.runId}:chapter_batch`}});
 console.log(JSON.stringify({result,http,calls:calls.map(row=>row.task),outputTokens:calls.map(row=>({task:row.task,maxTokens:row.maxTokens})),units:units.map(row=>({progress:JSON.parse(row.progressJson),artifacts:JSON.parse(row.stageArtifactsJson)})),
  chapters:await db.chapter.findMany({where:{novelId:'novel-1'},select:{content:true,generationState:true,chapterStatus:true}}),jobs:await db.generationJob.count(),
  reports:await db.auditReport.count(),events:await db.directorNextEvent.findMany({where:{runId:contract.runId},select:{type:true}})}));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.$disconnect());
module.exports={db,prepareNativeFixture,installNativeTransport};
