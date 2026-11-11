const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {loadRuntimeSource}=require('./sourceHarness.cjs');
const version=loadRuntimeSource('artifactSync/ChapterArtifactContentVersion.ts',{'node:crypto':require('node:crypto')});

test('V2 summary and fact writes consume AI deltas rather than rerunning legacy text extraction',async()=>{
  let legacyExtractions=0;
  const summaries=[];
  const facts=[];
  const queued=[];
  const feedbackNotifications=[];
  const feedback={notify:(novelId,chapterId)=>{feedbackNotifications.push([novelId,chapterId]);}};
  const content='甲交了三百两，肩伤加重。';
  const prisma={chapter:{findFirst:async()=>({id:'c',order:2,content}),update:async()=>{}},
    chapterSummary:{upsert:async request=>{summaries.push(request.create);}},
    $transaction:async callback=>callback(prisma)};
  const p0={extractFacts:()=>{legacyExtractions++;return [{category:'plot',content:'旧关键词摘要'}];}};
  const factService={novelFactService:{writeFacts:async(n,order,items)=>{facts.push(...items);}}};
  const compact={compactText:value=>String(value??'').replace(/\s+/g,' ').trim()};
  const writerPath=path.resolve(__dirname,'../../src/services/novel/runtime/artifactSync/facts/ChapterArtifactFactWriter.ts');
  const writer=fs.existsSync(writerPath)?loadRuntimeSource('artifactSync/facts/ChapterArtifactFactWriter.ts',{
    '../../../../../db/prisma':{prisma},'../../../../../modules/planning/outline/feedback':{outlineFeedbackService:feedback},'../../../characterResource/characterResourceShared':compact,
    '../../../fact/NovelFactService':factService,'../../../novelP0Utils':p0,
    '../ChapterArtifactSyncResult':{ChapterArtifactContentVersionError:class extends Error{}},
    '../ChapterArtifactContentVersion':version,
  }):{};
  const {ChapterArtifactDeltaService}=loadRuntimeSource('ChapterArtifactDeltaService.ts',{
    '../characters/appearances':{characterAppearanceService:{applyFinalChapter:async()=>{throw Error('fact writing must not write appearances');}}},
    '../../../db/prisma':{prisma},'../../../prompting/core/promptRunner':{},
    '../../../prompting/prompts/novel/chapterArtifactDelta.prompts':{},'../../rag':{ragServices:{ragIndexService:{enqueueUpsert:async(type,id)=>{queued.push([type,id]);}}}},
    '../../state/StateService':{},'../../payoff/payoffLedgerShared':{},
    '../characterResource/CharacterResourceLedgerService':{},'../characterMind/CharacterMindService':{},
    '../characterResource/CharacterResourceStaleScanService':{},'../characterResource/characterResourceShared':compact,
     '../fact/NovelFactService':factService,'../novelP0Utils':p0,'../state/StateCommitService':{},
     '../../modules/planning/outline/feedback':{outlineFeedbackService:feedback},
    '../state/stateProposalSourceQuality':{normalizeContentProvenance:()=> 'confirmed'},
    './artifactSync/ChapterArtifactSyncResult':{ChapterArtifactContentVersionError:class extends Error{}},
    './artifactSync/ChapterArtifactContentVersion':version,'./artifactSync/context':{},'./artifactSync/facts':writer,
    '../characters/locations':{},
  });
  const result=await new ChapterArtifactDeltaService().applyChapterArtifactConsumer({novelId:'n',chapterId:'c',content,contentHash:version.buildChapterArtifactContentHash(content),consumer:'summary_facts',artifactSyncPolicy:'director_v2',
    output:{summary:'甲交易后负伤。',concreteFacts:[{text:'甲已支付三百两。',category:'completed'}],stateDeltas:{characterStates:[{summary:'肩伤加重'}]}}});
  assert.equal(summaries[0].keyEvents,'甲已支付三百两。');
  assert.equal(summaries[0].characterStates,'肩伤加重');
  assert.equal(legacyExtractions,0);
  assert.deepEqual(facts,[{text:'甲已支付三百两。',category:'completed',source:'auto'}]);
  assert.equal(result.concreteFactCount,1);
  assert.deepEqual(queued,[['chapter','c'],['chapter_summary','c']]);
  assert.deepEqual(feedbackNotifications,[['n','c']]);
});

test('V2 working drafts do not schedule premature or duplicate embeddings; V1 indexing remains',async()=>{
  const queued=[];
  let legacyFactReads=0;
  const resultModule=loadRuntimeSource('artifactSync/ChapterArtifactSyncResult.ts',{});
  const feedbackNotifications=[];
  const {ChapterArtifactSyncService}=loadRuntimeSource('ChapterArtifactSyncService.ts',{
    '../../../modules/planning/outline/feedback':{outlineFeedbackService:{notify:(novelId,chapterId)=>feedbackNotifications.push([novelId,chapterId])}},
    '../../../db/prisma':{prisma:{chapter:{findFirst:async()=>({content:'旧链路稿'}),findMany:async()=>[],update:async()=>{}},chapterSummary:{upsert:async()=>{}},consistencyFact:{deleteMany:async()=>{},createMany:async()=>{},findMany:async()=>{legacyFactReads++;return []; }},character:{findMany:async()=>[]},$transaction:async callback=>callback({chapter:{findFirst:async()=>({content:'旧链路稿'})},chapterSummary:{upsert:async()=>{}},consistencyFact:{deleteMany:async()=>{},createMany:async()=>{}}})}},
    '../../../db/sqliteRetry':{withSqliteRetry:work=>work()},'../../rag':{ragServices:{ragIndexService:{enqueueUpsert:async(type,id)=>queued.push([type,id])}}},
    '../novelP0Utils':{extractFacts:()=>[{category:'plot',content:'旧链路摘要'}],briefSummary:()=> '旧链路摘要'},'./ChapterArtifactBackgroundSyncService':{},'./ChapterArtifactDeltaService':{buildContentHash:()=> 'hash'},
    './artifactSync/ChapterArtifactSyncResult':resultModule,'./lifecycle':{chapterLifecycleService:{}},
  });
  const service=new ChapterArtifactSyncService();
  let legacyTimelineWrites=0;
  service.syncCharacterTimelineForChapter=async()=>{legacyTimelineWrites++;};
  await service.syncChapterArtifacts('n','c','待修复稿',{artifactSyncPolicy:'director_v2',skipLegacySummaryAndFacts:true,scheduleBackgroundSync:false});
  assert.deepEqual(queued,[]);
  assert.deepEqual(feedbackNotifications,[],'V2 drafts must not trigger feedback analysis');
  assert.equal(legacyFactReads,0);
  assert.equal(legacyTimelineWrites,0,'V2 must wait for structured identity-confirmed appearance records');
  await service.syncChapterArtifacts('n','c','旧链路稿',{scheduleBackgroundSync:false});
  assert.deepEqual(queued,[['chapter','c'],['chapter_summary','c'],['novel','n']]);
  assert.equal(legacyFactReads,1);
  assert.equal(legacyTimelineWrites,1,'V1 timeline behavior stays independent');
  assert.deepEqual(feedbackNotifications,[['n','c']],'V1 sync retains the feedback hook');
});
