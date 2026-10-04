const test=require('node:test');const assert=require('node:assert/strict');
const {createDirectorProductionOptions}=require('../../../dist/app/director/productionComposition');
const {targetVolume,executionWindow}=require('../../../dist/app/director/productionInputs');
const {readBatchOutcome}=require('../../../dist/app/director/batchOutcome');
const {prisma}=require('../../../dist/db/prisma');
const {buildChapterArtifactContentHash}=require('../../../dist/services/novel/runtime/artifactSync');
const options=createDirectorProductionOptions();
const launchInput={storyInput:'故事',estimatedChapterCount:10,worldMode:'skip',targetMode:'opening',provider:'openai',model:'snapshot-model',executionRange:{from:1,to:10}};
const contract=options.contractFactory({runId:'run',novelId:'novel',driver:'auto',stepIdsInScope:null,launchInput});
const context={runId:'run',contract};
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

test('registered opening production defers future volume skeletons but planning retains the full-book request',async()=>{
 const {NovelVolumeService}=require('../../../dist/services/novel/volume/NovelVolumeService');
 const originals={generate:NovelVolumeService.prototype.generateVolumes,save:NovelVolumeService.prototype.updateVolumes};
 const calls=[];NovelVolumeService.prototype.generateVolumes=async(_id,input)=>{calls.push(input);return {volumes:[{id:'v1'}]};};NovelVolumeService.prototype.updateVolumes=async(_id,input)=>input;
 try {
  await options.stepRegistry.get('volume_strategy')(context);
  assert.equal(calls.find(call=>call.scope==='skeleton').skeletonVolumeCount,1);
  assert.equal(calls[0].estimatedChapterCount,10);
  calls.length=0;await options.stepRegistry.get('volume_strategy')({...context,contract:{...contract,chapterRange:null}});
  assert.equal(calls.find(call=>call.scope==='skeleton').skeletonVolumeCount,undefined);
 } finally {NovelVolumeService.prototype.generateVolumes=originals.generate;NovelVolumeService.prototype.updateVolumes=originals.save;}
});


test('next batch prepares missing future routes before resolving its volume and reuses saved beats',async()=>{
 const {NovelVolumeService}=require('../../../dist/services/novel/volume/NovelVolumeService');
 const {ChapterRouteWindowService}=require('../../../dist/services/novel/planning/ChapterRouteWindowService');
 const originals={read:NovelVolumeService.prototype.getVolumes,generate:NovelVolumeService.prototype.generateVolumes,window:ChapterRouteWindowService.prototype.ensureRouteWindow};
 let workspace={novelId:'novel',volumes:[{id:'v1',sortOrder:1,chapters:[{chapterOrder:1}]}],beatSheets:[]};const calls=[];
 NovelVolumeService.prototype.getVolumes=async()=>workspace;
 NovelVolumeService.prototype.generateVolumes=async()=>{throw Error('prepared beats must not be regenerated');};
 ChapterRouteWindowService.prototype.ensureRouteWindow=async(...args)=>{calls.push(args);workspace={...workspace,volumes:[...workspace.volumes,{id:'v2',sortOrder:2,chapters:[11,12,13].map(chapterOrder=>({chapterOrder}))}],beatSheets:[{volumeId:'v2',beats:[{key:'continuation'}]}]};return {availableRouteCount:3,extended:true};};
 const next=options.contractFactory({runId:'next',novelId:'novel',driver:'auto',stepIdsInScope:null,launchInput:{...launchInput,estimatedChapterCount:30,executionRange:{from:11,to:13}}});
 try {const result=await options.stepRegistry.get('volume_beat_sheet')({runId:'next',contract:next});assert.equal(result.artifact.contentRef,'volume_beat_sheet:novel:v2');assert.equal(calls.length,1);assert.equal(calls[0][1],11);assert.equal(calls[0][2].completionProfile.targetChapterCount,30);assert.equal(calls[0][2].model,'snapshot-model');}
 finally {NovelVolumeService.prototype.getVolumes=originals.read;NovelVolumeService.prototype.generateVolumes=originals.generate;ChapterRouteWindowService.prototype.ensureRouteWindow=originals.window;}
});
