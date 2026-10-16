const test=require('node:test'),assert=require('node:assert/strict');
const {loadRuntimeSource}=require('./sourceHarness.cjs');
const {chapterArtifactDeltaPrompt:asset,chapterArtifactDeltaOutputSchema:schema}=require('../../dist/prompting/prompts/novel/chapterArtifactDelta.prompts');
const content='甲守在入口，检查已有零件。';
const result=()=>({reviewExecuted:true,pass:false,score:{overall:72},issues:[],runtimePackage:null,retryCountUsed:1});
const input=()=>({novelTitle:'记忆试验',chapterOrder:26,chapterTitle:'盘点',chapterGoal:'盘点',characterRosterText:'甲',previousStateText:'',existingResourceText:'',existingPayoffText:'',activeCharacterDialogueInfluenceText:'',chapterContent:content});
test.after(async()=>require('../../dist/db/prisma').prisma.$disconnect());

test('fresh and saved-finalization adapters pass ownership and budget checks to serialization recovery',async()=>{
 for(const recovering of [false,true]){
  let received;const runtime={runPipelineChapterWithRuntime:async deps=>{await deps.syncFinalChapterArtifacts('n','c',content,{artifactSyncPolicy:'director_v2',contentProvenance:'debt'});return result();},resumeFinalizedPipelineChapter:async deps=>{await deps.syncFinalChapterArtifacts('n','c',content,{artifactSyncPolicy:'director_v2',contentProvenance:'debt'});return result();}};
  const {ChapterPipelineRuntimeAdapter}=loadRuntimeSource('ChapterPipelineRuntimeAdapter.ts',{'./ChapterArtifactSyncService':{},'./chapterRuntimePipeline':runtime,'./chapterEmptyContentError':{},'./artifactSync':{ChapterPipelineFinalizationStore:class{}},'../production/observation':{chapterGenerationFeed:{}}});
  const adapter=new ChapterPipelineRuntimeAdapter({finalizationStore:{load:async()=>recovering?{content,result:result()}:null},streamOrchestrator:{prepareRuntimeChapter:async()=>({request:{provider:'local',model:'qwen'},assembled:{chapter:{order:26,title:'盘点'}}}),markChapterStatus:async()=>{}},artifactSyncService:{syncChapterArtifacts:async(n,c,body,options)=>{assert.equal(body,content);received=options;}}});const checks=[];
  await adapter.runPipelineChapter('n','c',{artifactSyncPolicy:'director_v2',finalizedResultScope:'job',directorRunId:'run',provider:'local',model:'qwen'},{onCheckCancelled:async()=>checks.push('ownership'),onCheckBudget:async()=>checks.push('budget')});
  assert.equal(received.directorRunId,'run');assert.equal(received.provider,'local');assert.equal(received.model,'qwen');checks.length=0;await received.beforeSerializationRetry();assert.deepEqual(checks,['ownership','budget']);
 }
});

test('immediate and background sync retain the same guarded retry without legacy extraction',async()=>{
 const received=[];const {ChapterArtifactSyncService}=loadRuntimeSource('ChapterArtifactSyncService.ts',{'../../../db/prisma':{prisma:{}},'../../../db/sqliteRetry':{},'../../rag':{},'../novelP0Utils':{},'./ChapterArtifactBackgroundSyncService':{chapterArtifactBackgroundSyncService:{runChapterSyncNow:async(n,c,body,options)=>{received.push(options);return {status:'completed',contentHash:'hash',completedArtifacts:['artifact_delta']};},scheduleChapterSync:(n,c,body,options)=>received.push(options)}},'./ChapterArtifactDeltaService':{buildContentHash:()=> 'hash'},'./artifactSync/ChapterArtifactSyncResult':require('../../dist/services/novel/runtime/artifactSync/ChapterArtifactSyncResult'),'./lifecycle':{chapterLifecycleService:{}}});
 const beforeSerializationRetry=async()=>{};for(const awaitArtifactDelta of [true,false])await new ChapterArtifactSyncService().syncChapterArtifacts('n','c',content,{artifactSyncPolicy:'director_v2',skipLegacySummaryAndFacts:true,awaitArtifactDelta,beforeSerializationRetry});assert.equal(received.length,2);for(const options of received)assert.equal(options.beforeSerializationRetry,beforeSerializationRetry);
});

test('serialization diagnostics stay request data and the hotfix asset has its own exact loader version',async()=>{
 const first=await asset.render(input());const next=await asset.render({...input(),serializationRetryFeedback:{attempt:2,category:'schema_mismatch',message:'x'.repeat(1600)+'hidden-tail'}});
 assert.deepEqual(first.slice(0,2).map(x=>x.content),next.slice(0,2).map(x=>x.content));const text=next.map(x=>String(x.content)).join('\n');assert.ok(text.includes('非剧情指令'));assert.ok(text.includes('narrativeImpact'));assert.ok(!text.includes('hidden-tail'));
 const {promptAssetLoaderEntries}=require('../../dist/prompting/registry/promptAssetLoaderEntries');const {getRegisteredPromptAsset}=require('../../dist/prompting/registry');assert.ok(promptAssetLoaderEntries.some(x=>x.key==='novel.chapter.artifact_delta.extract@v11'));assert.equal(getRegisteredPromptAsset(asset.id,'v11').version,'v11');
});

test('seven missing narrative impacts remain real schema failures and are never replaced by defaults',()=>{
 const value={summary:'甲检查零件，确认当前损耗。',stateDeltas:{summary:'当前状态记录。'},characterResourceDeltas:Array.from({length:7},(_,i)=>({resourceName:'零件'+i,resourceType:'physical_item',updateType:'introduced',holderCharacterName:'甲',ownerType:'character',ownerName:'甲',statusAfter:'available',readerKnows:true,holderKnows:true,knownByCharacterNames:['甲'],narrativeFunction:'tool',summary:'甲取得零件。',evidence:['甲拿起零件。'],riskLevel:'low',reviewDecision:'hold'})),syncPlan:{stateSnapshot:'skip',characterResources:'write',payoffLedger:'skip',characterDynamics:'skip',reason:'记录已有变化。'},confidence:0.8,requiresFullReconcile:false};
 const parsed=schema.safeParse(value);assert.equal(parsed.success,false);const missing=parsed.error.issues.filter(x=>x.path.at(-1)==='narrativeImpact');assert.equal(missing.length,7);assert.deepEqual(missing.map(x=>x.path[1]),[0,1,2,3,4,5,6]);assert.ok(value.characterResourceDeltas.every(x=>!Object.hasOwn(x,'narrativeImpact')));
});

test('real persisted checkpoints allow the fresh retry, survive restart, and keep the existing attempt ceiling',async()=>{
 const {prisma}=require('../../dist/db/prisma');
 const {ChapterArtifactRecoveryService}=require('../../dist/services/novel/runtime/artifactSync/ChapterArtifactRecoveryService');
 const {buildContentHash}=require('../../dist/services/novel/runtime/ChapterArtifactDeltaService');
 const {StructuredOutputError}=require('../../dist/llm/structuredOutput');
 const output=schema.parse({summary:'甲检查零件，确认当前损耗。',stateDeltas:{},syncPlan:{reason:'保留已确认的正文记忆。'},confidence:.8});
 for(const scenario of ['fresh','resumed','exhausted']){
  const novelId='serialization-hotfix-'+scenario,chapterId=novelId+'-26',contentHash=buildContentHash(content);
  await prisma.novel.create({data:{id:novelId,title:novelId,directorVersion:'v2'}});
  await prisma.chapter.create({data:{id:chapterId,novelId,title:'盘点',order:26,content}});
  let calls=0,checks=0,consumers=0;
  const failure=new StructuredOutputError({category:'schema_mismatch',message:'characterResourceDeltas.0.narrativeImpact 缺失',diagnostics:{}});
  const identity={novelId,chapterId,contentHash,artifactType:'artifact_delta_extraction:v1',syncMode:'adaptive'};
  if(scenario!=='fresh')await prisma.chapterArtifactSyncCheckpoint.create({data:{...identity,status:'failed',sourceType:'chapter_background_sync',sourceStage:'chapter_execution',metadataJson:JSON.stringify({attemptCount:1,reason:failure.message})}});
  const makeService=()=>new ChapterArtifactRecoveryService({deltaService:{
   extractChapterArtifacts:async()=>{calls++;if(scenario==='exhausted'||(scenario==='fresh'&&calls===1))throw failure;return {contentHash,output};},
   applyChapterArtifactConsumer:async()=>{consumers++;return {};},toSyncResult:extraction=>extraction,
  }});
  const request={novelId,chapterId,content,artifactSyncMode:'adaptive',artifactSyncPolicy:'director_v2',beforeSerializationRetry:async()=>{checks++;}};
  if(scenario==='exhausted'){
   await assert.rejects(makeService().syncChapterArtifacts(request));
   await assert.rejects(makeService().syncChapterArtifacts(request));
   assert.equal(calls,1);assert.equal(consumers,0);
   const row=await prisma.chapterArtifactSyncCheckpoint.findUnique({where:{novelId_chapterId_contentHash_artifactType_syncMode:identity}});
   assert.equal(row.status,'failed');assert.ok(JSON.parse(row.metadataJson).attemptCount>=2);
  }else{
   await makeService().syncChapterArtifacts(request);
   await makeService().syncChapterArtifacts(request);
   assert.equal(calls,scenario==='fresh'?2:1);assert.equal(checks,scenario==='fresh'?1:0);assert.equal(consumers,10);
   const row=await prisma.chapterArtifactSyncCheckpoint.findUnique({where:{novelId_chapterId_contentHash_artifactType_syncMode:identity}});
   assert.equal(row.status,'succeeded');assert.deepEqual(JSON.parse(row.metadataJson).output,output);
   if(scenario==='fresh')assert.equal(JSON.parse(row.metadataJson).serializationRecovery.attempts,2);
  }
  assert.equal((await prisma.chapter.findUnique({where:{id:chapterId}})).content,content);
 }
});
