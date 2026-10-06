const test=require('node:test');const assert=require('node:assert/strict');
const steps=require('../../../dist/modules/director/steps');
const {RunExecutor,FactsLoader}=require('../../../dist/modules/director/application');
const {applyEvent,createPlanOrchestrator}=require('../../../dist/modules/director/domain');
const {contract}=require('../fixtures');

function harness(crash=false) {
 const plan=steps.directorProductionPlan;
 const runContract=contract({planVersion:plan.version,chapterRange:{from:1,to:1}});
 let control={version:1,status:'running',pause:null,gate:null,cursorStepId:null,failureReason:null};
 const artifacts=[{type:'novel_seed',scope:'book',version:1,status:'confirmed',protectedUserContent:true}],events=[],debts=[],executed=[];
 let workspace={novelId:runContract.novelId,volumes:[],beatSheets:[]},characters=[],chapters=[],binding=null;
 const hash=()=> 'saved-hash',model={model:'snapshot-model'};
 const volumeService={generateVolumes:async(novel,options)=>{
  const scope=options.scope;
  if(scope==='skeleton') workspace={...workspace,volumes:[{id:'v1',status:'draft',chapters:[]}]};
  if(scope==='beat_sheet') workspace={...workspace,beatSheets:[{volumeId:'v1',beats:[{key:'b1'}]}]};
  if(scope==='chapter_list') workspace={...workspace,volumes:[{id:'v1',status:'draft',chapters:[{id:'p1',chapterOrder:1}]}]};
  if(scope==='chapter_detail') workspace={...workspace,volumes:[{id:'v1',status:'draft',chapters:[{id:'p1',chapterOrder:1,taskSheet:'任务',sceneCards:'场景'}]}]};
  return workspace;
 },updateVolumes:async(_,draft)=>draft,updateVolumesWithOptions:async(_,draft)=>draft,
 syncVolumeChaptersWithOptions:async()=>{chapters=[{id:'c1',novelId:runContract.novelId,order:1,content:'',taskSheet:'任务',sceneCards:'场景'}];return {clearContentCount:0,deleteCount:0};}};
 const handlers={
  story_macro:steps.createStoryMacroStepHandler({inputProvider:async()=>({...model,storyInput:'故事'}),storyMacroService:{decompose:async()=>({story:'宏观'})},contentHash:hash}),
  book_contract:steps.createBookContractStepHandler({inputProvider:async()=>({novelId:runContract.novelId}),generationService:{generate:async()=>({contract:'约定'})},bookContractService:{upsert:async novelId=>({id:'book-contract',novelId})},contentHash:hash}),
  world_setup:steps.createWorldSetupStepHandler({inputProvider:async()=>({storyInput:'故事',storyMacroContext:'宏观',bookContractContext:'约定',openingOnly:true}),worldService:{hasActiveWorld:async()=>false,generateWorldFromNovelTheme:async()=>({}),getWorldContextBlock:async()=>({rawSlice:{world:'世界'}})},contentHash:hash}),
  character_setup:steps.createCharacterSetupStepHandler({inputProvider:async()=>({storyInput:'故事'}),characterService:{readCast:async()=>({characters,relations:[]}),prepareEmptyCast:async novelId=>{characters=[{id:'hero',novelId,name:'主角'}];return {characterIds:['hero']};}},contentHash:hash}),
  volume_strategy:steps.createVolumeStrategyStepHandler({inputProvider:async()=>({...model,estimatedChapterCount:1}),volumeService,contentHash:hash}),
  volume_beat_sheet:steps.createVolumeBeatSheetStepHandler({inputProvider:async()=>({...model,workspace,targetVolumeId:'v1'}),volumeService,contentHash:hash}),
  volume_chapter_list:steps.createVolumeChapterListStepHandler({inputProvider:async()=>({...model,workspace,targetVolumeId:'v1'}),volumeService,contentHash:hash}),
  chapter_detail_bundle:steps.createChapterDetailBundleStepHandler({inputProvider:async()=>({...model,workspace,targets:[{volumeId:'v1',chapterId:'p1'}]}),volumeService,resolveIssues:async()=>({action:'continue_with_warning',reason:'局部提醒'}),contentHash:hash}),
  execution_contract_sync:steps.createExecutionContractSyncStepHandler({inputProvider:async()=>({workspace,executionRange:{startOrder:1,endOrder:1}}),volumeService,chapterService:{listChapters:async()=>chapters},contentHash:hash}),
  chapter_batch:steps.createChapterBatchStepHandler({inputProvider:async()=>({...model,startOrder:1,endOrder:1}),jobBinding:{get:async()=>binding,save:async(_,id)=>{binding=id;}},pipelineService:{startPipelineJob:async novelId=>{chapters=chapters.map(c=>({...c,content:'小说正文',closed:true}));return {id:'job',novelId,startOrder:1,endOrder:1,status:'succeeded'};},getPipelineJobById:async()=>null,resumePipelineJob:async()=>{}},readOutcome:async()=>({chapters,debts:[{chapterOrder:1,code:'local_patch_plan',action:'defer_and_continue'}]}),waitForPoll:async()=>{},isRunActive:async()=>true,contentHash:hash}),
 };
 const wrapped=Object.fromEntries(Object.entries(handlers).map(([id,handler])=>[id,async ctx=>{executed.push(id);return handler(ctx);} ]));
 const stepRegistry=steps.createProductionStepRegistry(wrapped);
 const runRepository={getContract:async()=>runContract,getControl:async()=>control,transition:async(_,event,version)=>{
  if(event.type==='step_finished'&&crash){crash=false;throw new Error('crash after save');}
  control=applyEvent(control,event,version);return control;
 }};
 const artifactLedger={listByNovel:async()=>artifacts,record:async input=>{const artifact={...input,version:1};artifacts.push(artifact);return artifact;}};
 const qualityDebtRepository={listByNovel:async()=>debts,record:async debt=>debts.push(debt)};
 const eventLog={list:async()=>events,append:async event=>events.push({...event,seq:events.length+1,createdAt:new Date()})};
 const factsLoader=new FactsLoader({runRepository,artifactLedger,qualityDebtRepository,eventLog});
 const executor=new RunExecutor({factsLoader,planRegistry:{get:()=>plan},orchestrator:createPlanOrchestrator(),runRepository,artifactLedger,qualityDebtRepository,eventLog,stepRegistry});
 return {executor,executed,artifacts,debts,getControl:()=>control,getChapters:()=>chapters};
}
test('all ten real adapters complete a production plan against fake business services',async()=>{
 const h=harness();for(let i=0;i<15&&h.getControl().status==='running';i++)await h.executor.runOnce('run-1');
 assert.equal(h.getControl().status,'completed');assert.deepEqual(h.executed,steps.directorProductionPlan.steps.map(s=>s.id));
 assert.equal(h.artifacts.at(-1).type,'chapter_batch_closed');assert.equal(h.getChapters()[0].content,'小说正文');assert.equal(h.debts.length,1);
});
test('crash after a persisted adapter result resumes without generating that asset again',async()=>{
 const h=harness(true);await assert.rejects(()=>h.executor.runOnce('run-1'),/crash after save/);
 for(let i=0;i<15&&h.getControl().status==='running';i++)await h.executor.runOnce('run-1');
 assert.equal(h.getControl().status,'completed');assert.equal(h.executed.filter(id=>id==='story_macro').length,1);
});
test('missing production implementations fail before a worker can launch',()=>{
 assert.throws(()=>steps.createProductionStepRegistry({}),/missing director production implementation/);
});
