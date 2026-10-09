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
  const content='甲交了三百两，肩伤加重。';
  const prisma={chapter:{findFirst:async()=>({id:'c',order:2,content}),update:async()=>{}},
    chapterSummary:{upsert:async request=>{summaries.push(request.create);}},
    $transaction:async callback=>callback(prisma)};
  const p0={extractFacts:()=>{legacyExtractions++;return [{category:'plot',content:'旧关键词摘要'}];}};
  const factService={novelFactService:{writeFacts:async(n,order,items)=>{facts.push(...items);}}};
  const compact={compactText:value=>String(value??'').replace(/\s+/g,' ').trim()};
  const writerPath=path.resolve(__dirname,'../../src/services/novel/runtime/artifactSync/facts/ChapterArtifactFactWriter.ts');
  const writer=fs.existsSync(writerPath)?loadRuntimeSource('artifactSync/facts/ChapterArtifactFactWriter.ts',{
    '../../../../../db/prisma':{prisma},'../../../characterResource/characterResourceShared':compact,
    '../../../fact/NovelFactService':factService,'../../../novelP0Utils':p0,
    '../ChapterArtifactSyncResult':{ChapterArtifactContentVersionError:class extends Error{}},
    '../ChapterArtifactContentVersion':version,
  }):{};
  const {ChapterArtifactDeltaService}=loadRuntimeSource('ChapterArtifactDeltaService.ts',{
    '../../../db/prisma':{prisma},'../../../prompting/core/promptRunner':{},
    '../../../prompting/prompts/novel/chapterArtifactDelta.prompts':{},'../../rag':{ragServices:{ragIndexService:{enqueueUpsert:async(type,id)=>{queued.push([type,id]);}}}},
    '../../state/StateService':{},'../../payoff/payoffLedgerShared':{},
    '../characterResource/CharacterResourceLedgerService':{},'../characterMind/CharacterMindService':{},
    '../characterResource/CharacterResourceStaleScanService':{},'../characterResource/characterResourceShared':compact,
    '../fact/NovelFactService':factService,'../novelP0Utils':p0,'../state/StateCommitService':{},
    '../state/stateProposalSourceQuality':{normalizeContentProvenance:()=> 'confirmed'},
    './artifactSync/ChapterArtifactSyncResult':{ChapterArtifactContentVersionError:class extends Error{}},
    './artifactSync/ChapterArtifactContentVersion':version,'./artifactSync/context':{},'./artifactSync/facts':writer,
  });
  const result=await new ChapterArtifactDeltaService().applyChapterArtifactConsumer({novelId:'n',chapterId:'c',content,contentHash:version.buildChapterArtifactContentHash(content),consumer:'summary_facts',artifactSyncPolicy:'director_v2',
    output:{summary:'甲交易后负伤。',concreteFacts:[{text:'甲已支付三百两。',category:'completed'}],stateDeltas:{characterStates:[{summary:'肩伤加重'}]}}});
  assert.equal(summaries[0].keyEvents,'甲已支付三百两。');
  assert.equal(summaries[0].characterStates,'肩伤加重');
  assert.equal(legacyExtractions,0);
  assert.deepEqual(facts,[{text:'甲已支付三百两。',category:'completed',source:'auto'}]);
  assert.equal(result.concreteFactCount,1);
  assert.deepEqual(queued,[['chapter','c'],['chapter_summary','c']]);
});

test('V2 working drafts do not schedule premature or duplicate embeddings; V1 indexing remains',async()=>{
  const queued=[];
  let legacyFactReads=0;
  const resultModule=loadRuntimeSource('artifactSync/ChapterArtifactSyncResult.ts',{});
  const {ChapterArtifactSyncService}=loadRuntimeSource('ChapterArtifactSyncService.ts',{
    '../../../db/prisma':{prisma:{consistencyFact:{findMany:async()=>{legacyFactReads++;return [];}}}},
    '../../../db/sqliteRetry':{},'../../rag':{ragServices:{ragIndexService:{enqueueUpsert:async(type,id)=>queued.push([type,id])}}},
    '../novelP0Utils':{},'./ChapterArtifactBackgroundSyncService':{},'./ChapterArtifactDeltaService':{buildContentHash:()=> 'hash'},
    './artifactSync/ChapterArtifactSyncResult':resultModule,'./lifecycle':{chapterLifecycleService:{}},
  });
  const service=new ChapterArtifactSyncService();
  service.syncCharacterTimelineForChapter=async()=>{};
  await service.syncChapterArtifacts('n','c','待修复稿',{artifactSyncPolicy:'director_v2',skipLegacySummaryAndFacts:true,scheduleBackgroundSync:false});
  assert.deepEqual(queued,[]);
  assert.equal(legacyFactReads,0);
  await service.syncChapterArtifacts('n','c','旧链路稿',{skipLegacySummaryAndFacts:true,scheduleBackgroundSync:false});
  assert.deepEqual(queued,[['chapter','c'],['chapter_summary','c'],['novel','n']]);
  assert.equal(legacyFactReads,1);
});
