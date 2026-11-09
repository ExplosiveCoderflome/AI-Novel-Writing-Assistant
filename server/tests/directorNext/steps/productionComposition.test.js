const test=require('node:test');const assert=require('node:assert/strict');
const {createDirectorProductionOptions}=require('../../../dist/app/director/productionComposition');
const {targetVolume,executionWindow}=require('../../../dist/app/director/productionInputs');
const {readBatchOutcome}=require('../../../dist/app/director/batchOutcome');
const {prisma}=require('../../../dist/db/prisma');
const {buildChapterArtifactContentHash}=require('../../../dist/services/novel/runtime/artifactSync');
const options=createDirectorProductionOptions();
const launchInput={storyInput:'故事',estimatedChapterCount:10,worldMode:'skip',targetMode:'opening',provider:'openai',model:'snapshot-model',executionRange:{from:1,to:10}};
const contract=options.contractFactory({runId:'run',novelId:'novel',driver:'auto',stepIdsInScope:null,launchInput});
const context={runId:'run',contract,facts:{artifacts:[],debts:[],stopSignal:null}};
test('real production composition registers all adapters and freezes complete policy settings',()=>{
 for(const step of options.plan.steps)assert.equal(typeof options.stepRegistry.get(step.id),'function');
 assert.equal(contract.modelConfig.model,'snapshot-model');assert.equal(contract.issuePolicy.pipelinePolicy.issueActions['quality.chapter_below_threshold'],'continue_with_warning');
 const nextRange=options.contractFactory({runId:'next',novelId:'novel',driver:'auto',stepIdsInScope:null,launchInput:{...launchInput,executionRange:{from:2,to:3}}});
 assert.notEqual(nextRange.scope,contract.scope,'a completed batch from a different range cannot satisfy the next batch');
 assert.throws(()=>options.contractFactory({runId:'bad',novelId:'novel',driver:'auto',stepIdsInScope:null}),/快照/);
 assert.throws(()=>options.contractFactory({runId:'bad',novelId:'novel',driver:'auto',stepIdsInScope:null,launchInput:{...launchInput,model:'default'}}),/快照/);
 const planning=options.contractFactory({runId:'plan',novelId:'novel',driver:'auto',stepIdsInScope:null,launchInput:{...launchInput,executionRange:undefined}});
 assert.equal(planning.stepIdsInScope.includes('chapter_batch'),false);assert.equal(planning.chapterRange,null);
 assert.throws(()=>options.contractFactory({runId:'bad',novelId:'novel',driver:'auto',stepIdsInScope:['chapter_batch'],launchInput:{...launchInput,executionRange:undefined}}),/授权范围/);
});

test('planning-only chapter splitting records batch progress for the active run version',async()=>{
 const {NovelVolumeService}=require('../../../dist/services/novel/volume/NovelVolumeService');
 const {PrismaEventLog}=require('../../../dist/modules/director');
 const originals={read:NovelVolumeService.prototype.getVolumes,generate:NovelVolumeService.prototype.generateVolumes,
  save:NovelVolumeService.prototype.updateVolumesWithOptions,append:PrismaEventLog.prototype.append};
 const workspace={novelId:'novel',volumes:[{id:'v1',sortOrder:1,status:'active',chapters:[{id:'p1',chapterOrder:1}]}],
  beatSheets:[{volumeId:'v1',beats:[{key:'opening'}]}]};
 const progress={volumeId:'v1',completedChapters:1,totalChapters:3,label:'开卷已生成'};
 const events=[];
 NovelVolumeService.prototype.getVolumes=async()=>workspace;
 NovelVolumeService.prototype.generateVolumes=async(_id,input)=>{await input.onPhaseStart({scope:'chapter_list',phase:'prompt',label:progress.label,chapterProgress:progress});return workspace;};
 NovelVolumeService.prototype.updateVolumesWithOptions=async()=>workspace;
 PrismaEventLog.prototype.append=async event=>{events.push(event);};
 try {
  const result=await options.stepRegistry.get('volume_chapter_list')({...context,
   control:{version:8},contract:{...contract,chapterRange:null}});
  assert.deepEqual(events,[{runId:'run',type:'chapter_list_progress',payload:{controlVersion:8,progress}}]);
  assert.equal(result.artifact.status,'confirmed');
 } finally {
  NovelVolumeService.prototype.getVolumes=originals.read;NovelVolumeService.prototype.generateVolumes=originals.generate;
  NovelVolumeService.prototype.updateVolumesWithOptions=originals.save;PrismaEventLog.prototype.append=originals.append;
 }
});
test('every production confirmation stays in its own new director workspace', async () => {
 const {ProjectionService}=require('../../../dist/modules/director/application');
 const expectedGates=['character_cast','volume_strategy','chapter_task_sheet','chapter_execution_contract','chapter_batch_closed'];
 const gates=options.plan.steps.filter(step=>step.gateable).map(step=>step.produces);
 assert.deepEqual(gates,expectedGates);
 for(const type of gates){
  const savedContract={...contract,novelId:'book/中文?other=1',driver:'assisted'};
  const service=new ProjectionService({planRegistry:{get:()=>options.plan},artifactTypes:options.artifactTypes,
   sourceRoute:options.sourceRoute,factsLoader:{load:async()=>({contract:savedContract,
    control:{status:'waiting_gate',version:2,gate:{gateId:type,artifactTypes:[type]},pause:null,cursorStepId:null,failureReason:null},
    facts:{artifacts:[],debts:[],stopSignal:null}})}});
  const view=await service.get(contract.runId);
  const target=view.availableActions.find(action=>action.id===`review:${type}`).target;
  assert.equal(target,`/lab/director/${encodeURIComponent(savedContract.novelId)}?review=${type}`);
  assert.equal(view.sourceRoute,`/lab/director/${encodeURIComponent(savedContract.novelId)}`);
  assert.equal(new URL(target,'https://local.test').searchParams.has('directorTaskId'),false);
 }
});
test('opening follows AI volume order and prepares only the first execution contract',()=>{
 const workspace={volumes:[{id:'later',sortOrder:2,chapters:[]},{id:'opening',sortOrder:1,chapters:[{id:'p1',chapterOrder:1},{id:'p2',chapterOrder:2}]}]};
 assert.equal(targetVolume(context,workspace),'opening');
 assert.deepEqual(executionWindow(context,workspace),{targets:[{volumeId:'opening',chapterId:'p1'}],executionRange:{startOrder:1,endOrder:1}});
 assert.throws(()=>targetVolume({...context,contract:{...contract,chapterRange:{from:5,to:10}}},workspace),/路线/);
});

test('new director planning reads cannot hydrate empty execution fields over prepared tasks',async()=>{
 const {NovelVolumeService}=require('../../../dist/services/novel/volume/NovelVolumeService');
 const original=NovelVolumeService.prototype.getVolumes,seen=[];
 NovelVolumeService.prototype.getVolumes=async(_id,input)=>{seen.push(input);throw Error('read-boundary-reached');};
 try {await assert.rejects(()=>options.stepRegistry.get('execution_contract_sync')(context),/read-boundary-reached/);
  assert.deepEqual(seen,[{hydrateCanonical:false}]);}
 finally {NovelVolumeService.prototype.getVolumes=original;}
});

test('new director synchronization keeps the planning source until contracts are explicitly written',async()=>{
 const {NovelVolumeService}=require('../../../dist/services/novel/volume/NovelVolumeService');
 const {ChapterService}=require('../../../dist/services/novel/ChapterService');
 const originals={read:NovelVolumeService.prototype.getVolumes,sync:NovelVolumeService.prototype.syncVolumeChaptersWithOptions,chapters:ChapterService.prototype.listChapters};
 NovelVolumeService.prototype.getVolumes=async()=>({novelId:'novel',volumes:[{id:'v1',chapters:[{id:'p1',chapterOrder:1,taskSheet:'保存任务',sceneCards:'保存场景'}]}]});
 ChapterService.prototype.listChapters=async()=>[];
 NovelVolumeService.prototype.syncVolumeChaptersWithOptions=async(_id,_input,opts)=>{assert.deepEqual(opts,{emitEvent:false,syncPayoffLedger:false,hydrateCanonical:false});throw Error('sync-boundary-reached');};
 try {await assert.rejects(()=>options.stepRegistry.get('execution_contract_sync')(context),/sync-boundary-reached/);}
 finally {NovelVolumeService.prototype.getVolumes=originals.read;NovelVolumeService.prototype.syncVolumeChaptersWithOptions=originals.sync;ChapterService.prototype.listChapters=originals.chapters;}
});
test('batch result reads structured decisions and current-content closure instead of status alone',async()=>{
 const decision={issueCode:'quality.chapter_below_threshold',action:'continue_with_warning',reason:'局部债',locked:false,policySource:'task_snapshot',retryExhaustedAction:'continue_with_warning',chapterOrder:1};
 let decisions=[decision],manual=false;
 prisma.generationJob.findUniqueOrThrow=async()=>({id:'job',novelId:'novel',startOrder:1,endOrder:1,status:'succeeded',pendingManualRecovery:manual,payload:JSON.stringify({directorNext:{runId:'run',decisions}})});
 prisma.chapter.findMany=async()=>[{id:'c1',novelId:'novel',order:1,content:'保存正文',generationState:'approved',artifactSyncCheckpoints:[{contentHash:buildChapterArtifactContentHash('保存正文'),metadataJson:JSON.stringify({outcome:'completed'})}]}];
 const job={id:'job',novelId:'novel',startOrder:1,endOrder:1,status:'succeeded'};
 let result=await readBatchOutcome(job,context);assert.equal(result.chapters[0].closed,true);assert.equal(result.debts[0].code,decision.issueCode);assert.equal(result.stopSignal,undefined);
 decisions=[{...decision,issueCode:'quality.replan_required',action:'pause_for_manual'}];manual=true;
 result=await readBatchOutcome(job,context);assert.equal(result.stopSignal.kind,'replan');
 decisions=[{...decision,action:'pause_for_manual'}];
 result=await readBatchOutcome(job,{...context,contract:{...contract,issuePolicy:{mode:'quality_first'}}});assert.equal(result.stopSignal.kind,'manual_recovery');
 prisma.chapter.findMany=async()=>[{id:'c1',novelId:'novel',order:1,content:'修改后的正文',generationState:'approved',artifactSyncCheckpoints:[{contentHash:buildChapterArtifactContentHash('保存正文'),metadataJson:JSON.stringify({outcome:'completed'})}]}];
 decisions=[];manual=false;result=await readBatchOutcome(job,context);assert.equal(result.chapters[0].closed,false);
});
test('chapter quality closure exposes the applied structured decision without changing its behavior',async()=>{
 const governance=require('../../../dist/services/novel/production/issueGovernance/PipelineIssueGovernance');
 const {applyChapterQualityClosure}=require('../../../dist/services/novel/production/qualityClosure/ChapterQualityClosure');
 const decision={issueCode:'quality.acceptance_unavailable',action:'continue_with_warning',reason:'保留正文',locked:false,policySource:'task_snapshot',retryExhaustedAction:'continue_with_warning'};
 governance.reportPipelineIssue=async input=>{await input.applyAction(decision);return {decision};};
 const observed=[];
 const result=await applyChapterQualityClosure({governance:null,novelId:'novel',jobId:'job',chapter:{id:'c1',order:1},chapterResult:{pass:true,reviewExecuted:false,issues:[],score:{}},
  qualityThreshold:75,runtimePayload:{autoReview:true},qualityAlertDetails:[],replanAlertDetails:[],recoverableRepairDetails:[],runLocalReplan:async()=>{},onIssueDecision:value=>observed.push(value)});
 assert.equal(result.shouldStopAfterCurrentChapter,false);assert.deepEqual(observed,[decision]);
});


test('registered production routes reuse the window service and never request a full volume',async()=>{
 const {NovelVolumeService}=require('../../../dist/services/novel/volume/NovelVolumeService');
 const {ChapterRouteWindowService}=require('../../../dist/services/novel/planning/ChapterRouteWindowService');
 const originals={read:NovelVolumeService.prototype.getVolumes,generate:NovelVolumeService.prototype.generateVolumes,window:ChapterRouteWindowService.prototype.ensureRouteWindow};
 const calls=[];const workspace={novelId:'novel',volumes:[{id:'v1',sortOrder:1,chapters:[1,2,3,4,5].map(chapterOrder=>({chapterOrder}))}]};
 NovelVolumeService.prototype.getVolumes=async()=>workspace;
 NovelVolumeService.prototype.generateVolumes=async()=>{throw Error('full volume generation is forbidden in this production step');};
 ChapterRouteWindowService.prototype.ensureRouteWindow=async(...args)=>{calls.push(args);return {availableRouteCount:5,extended:false};};
 try {const result=await options.stepRegistry.get('volume_chapter_list')(context);assert.equal(result.artifact.scope,contract.scope);assert.equal(calls.length,1);assert.equal(calls[0][1],1);assert.equal(calls[0][2].target,5);assert.equal(calls[0][2].model,'snapshot-model');}
 finally {NovelVolumeService.prototype.getVolumes=originals.read;NovelVolumeService.prototype.generateVolumes=originals.generate;ChapterRouteWindowService.prototype.ensureRouteWindow=originals.window;}
});

test('opening production and planning both retain the AI multi-volume skeleton request',async()=>{
 const {NovelVolumeService}=require('../../../dist/services/novel/volume/NovelVolumeService');
 const originals={generate:NovelVolumeService.prototype.generateVolumes,save:NovelVolumeService.prototype.updateVolumes,recover:NovelVolumeService.prototype.recoverVolumeStrategy};
 NovelVolumeService.prototype.recoverVolumeStrategy=async()=>null;
 const calls=[];NovelVolumeService.prototype.generateVolumes=async(_id,input)=>{calls.push(input);return {volumes:[{id:'v1'}]};};NovelVolumeService.prototype.updateVolumes=async(_id,input)=>input;
 try {
  await options.stepRegistry.get('volume_strategy')(context);
  assert.equal(calls.find(call=>call.scope==='skeleton').skeletonVolumeCount,undefined);
  assert.equal(calls[0].estimatedChapterCount,10);
  calls.length=0;await options.stepRegistry.get('volume_strategy')({...context,contract:{...contract,chapterRange:null}});
  assert.equal(calls.find(call=>call.scope==='skeleton').skeletonVolumeCount,undefined);
 } finally {NovelVolumeService.prototype.generateVolumes=originals.generate;NovelVolumeService.prototype.updateVolumes=originals.save;NovelVolumeService.prototype.recoverVolumeStrategy=originals.recover;}
});


test('next batch prepares missing future routes before resolving its volume and reuses saved beats',async()=>{
 const {NovelVolumeService}=require('../../../dist/services/novel/volume/NovelVolumeService');
 const {ChapterRouteWindowService}=require('../../../dist/services/novel/planning/ChapterRouteWindowService');
 const originals={read:NovelVolumeService.prototype.getVolumes,generate:NovelVolumeService.prototype.generateVolumes,window:ChapterRouteWindowService.prototype.ensureRouteWindow,recover:NovelVolumeService.prototype.recoverVolumeStrategy};
 let workspace={novelId:'novel',volumes:[{id:'v1',sortOrder:1,chapters:[{chapterOrder:1}]}],beatSheets:[]};const calls=[];
 NovelVolumeService.prototype.recoverVolumeStrategy=async()=>workspace;
 NovelVolumeService.prototype.getVolumes=async()=>workspace;
 NovelVolumeService.prototype.generateVolumes=async()=>{throw Error('prepared beats must not be regenerated');};
 ChapterRouteWindowService.prototype.ensureRouteWindow=async(...args)=>{calls.push(args);workspace={...workspace,volumes:[...workspace.volumes,{id:'v2',sortOrder:2,chapters:[11,12,13].map(chapterOrder=>({chapterOrder}))}],beatSheets:[{volumeId:'v2',beats:[{key:'continuation'}]}]};return {availableRouteCount:3,extended:true};};
 const next=options.contractFactory({runId:'next',novelId:'novel',driver:'auto',stepIdsInScope:null,launchInput:{...launchInput,estimatedChapterCount:30,executionRange:{from:11,to:13}}});
 try {const result=await options.stepRegistry.get('volume_beat_sheet')({...context,runId:'next',contract:next});assert.equal(result.artifact.contentRef,'volume_beat_sheet:novel:v2');assert.equal(calls.length,1);assert.equal(calls[0][1],11);assert.equal(calls[0][2].completionProfile.targetChapterCount,30);assert.equal(calls[0][2].model,'snapshot-model');}
 finally {NovelVolumeService.prototype.getVolumes=originals.read;NovelVolumeService.prototype.generateVolumes=originals.generate;ChapterRouteWindowService.prototype.ensureRouteWindow=originals.window;NovelVolumeService.prototype.recoverVolumeStrategy=originals.recover;}
});

test('a resumed beat-sheet step repairs its missing strategy before preparing the route window',async()=>{
 const {NovelVolumeService}=require('../../../dist/services/novel/volume/NovelVolumeService');
 const {ChapterRouteWindowService}=require('../../../dist/services/novel/planning/ChapterRouteWindowService');
 const originals={read:NovelVolumeService.prototype.getVolumes,recover:NovelVolumeService.prototype.recoverVolumeStrategy,window:ChapterRouteWindowService.prototype.ensureRouteWindow};
 let workspace={novelId:'novel',strategyPlan:null,volumes:[{id:'v1',sortOrder:1,chapters:[{chapterOrder:1}]}],beatSheets:[]};
 NovelVolumeService.prototype.getVolumes=async()=>workspace;
 NovelVolumeService.prototype.recoverVolumeStrategy=async()=>{workspace={...workspace,strategyPlan:{notes:'补齐'}};return workspace;};
 ChapterRouteWindowService.prototype.ensureRouteWindow=async()=>{
  assert.ok(workspace.strategyPlan,'route preparation requires a recovered strategy');
  workspace={...workspace,beatSheets:[{volumeId:'v1',beats:[{key:'opening'}]}]};return {availableRouteCount:3,extended:true};
 };
 try {const result=await options.stepRegistry.get('volume_beat_sheet')(context);assert.equal(result.artifact.contentRef,'volume_beat_sheet:novel:v1');}
 finally {NovelVolumeService.prototype.getVolumes=originals.read;NovelVolumeService.prototype.recoverVolumeStrategy=originals.recover;ChapterRouteWindowService.prototype.ensureRouteWindow=originals.window;}
});


test('fixed volume count is frozen and actual multi-volume skeletons share the chapter budget',async()=>{
 const {NovelVolumeService}=require('../../../dist/services/novel/volume/NovelVolumeService');
 const runner=require('../../../dist/prompting/core/promptRunner');
 const {generateBeatSheet}=require('../../../dist/services/novel/volume/volumeBeatSheetGeneration');
 const originals={generate:NovelVolumeService.prototype.generateVolumes,save:NovelVolumeService.prototype.updateVolumes,recover:NovelVolumeService.prototype.recoverVolumeStrategy,prompt:runner.runStructuredPrompt};
 const calls=[];
 NovelVolumeService.prototype.recoverVolumeStrategy=async()=>null;
 let workspace;
 NovelVolumeService.prototype.generateVolumes=async(_id,input)=>{
  calls.push(input);
  if(input.scope==='strategy') return {...workspace,strategyPlan:{recommendedVolumeCount:input.userPreferredVolumeCount ?? 4,volumes:[],uncertainties:[]}};
  if(input.scope==='strategy_critique') return input.draftWorkspace;
  const count=input.skeletonVolumeCount ?? input.draftWorkspace.strategyPlan.recommendedVolumeCount;
  return {...input.draftWorkspace,volumes:Array.from({length:count},(_,i)=>({id:`v${i+1}`,sortOrder:i+1,title:`Volume ${i+1}`,openPayoffs:[],chapters:[]}))};
 };
 NovelVolumeService.prototype.updateVolumes=async(_id,input)=>{workspace=input;return input;};
 try {
  for (const preferred of [undefined,2,1,24]) {
   workspace={novelId:'novel',volumes:[],beatSheets:[]};calls.length=0;
   const fixed=options.contractFactory({runId:'fixed',novelId:'novel',driver:'auto',stepIdsInScope:null,launchInput:{...launchInput,estimatedChapterCount:240,userPreferredVolumeCount:preferred}});
   assert.equal(JSON.parse(JSON.stringify(fixed)).launchInput.userPreferredVolumeCount,preferred);
   await options.stepRegistry.get('volume_strategy')({...context,contract:fixed});
   assert.ok(calls.every(call=>call.userPreferredVolumeCount===preferred));
   assert.equal(calls.find(call=>call.scope==='skeleton').skeletonVolumeCount,preferred);
   assert.deepEqual(calls.map(call=>call.scope),['strategy','strategy_critique','skeleton']);
   assert.equal(workspace.volumes.length,preferred ?? 4);
   const budgets=[];
   runner.runStructuredPrompt=async input=>{budgets.push(input.promptInput.targetChapterCount);return {output:{beats:[]}};};
   for (const volume of workspace.volumes) await generateBeatSheet({document:workspace,workspace,novel:{title:'budget test',estimatedChapterCount:240,characters:[]},storyMacroPlan:null,
    options:{targetVolumeId:volume.id,estimatedChapterCount:240},notifyVolumeGenerationPhase:async()=>{}});
   assert.deepEqual(budgets,Array(preferred ?? 4).fill(240/(preferred ?? 4)));
  }
 } finally {runner.runStructuredPrompt=originals.prompt;NovelVolumeService.prototype.generateVolumes=originals.generate;NovelVolumeService.prototype.updateVolumes=originals.save;NovelVolumeService.prototype.recoverVolumeStrategy=originals.recover;}
});
