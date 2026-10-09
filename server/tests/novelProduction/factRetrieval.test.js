const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {loadRuntimeSource} = require('./sourceHarness.cjs');
const {buildChapterArtifactContentHash: hash} = loadRuntimeSource('artifactSync/ChapterArtifactContentVersion.ts', {'node:crypto':require('node:crypto')});
const ragUtils = require('../../dist/services/rag/utils');
const facets = require('../../dist/services/rag/chunkFacets');

function fixture() {
  const chapter = {id:'c',novelId:'n',order:2,title:'交易',content:'甲付了三百两，买下后门钥匙。',updatedAt:new Date(),generationState:'approved',novel:{directorVersion:'v2'}};
  const summary = {novelId:'n',chapterId:'c',summary:'甲买下钥匙。',updatedAt:new Date(),keyEvents:null,characterStates:null,hook:null};
  let checkpointHash = hash(chapter.content);
  let extractionSummary = summary.summary;
  let extractionFact = '钥匙花费三百两。';
  let writtenFacts = [{text:'钥匙花费三百两。',category:'completed'}];
  const prisma = {
    chapterSummary:{findUnique:async()=>summary},
    chapter:{findUnique:async()=>chapter,findMany:async()=>[chapter]},
    chapterArtifactSyncCheckpoint:{findFirst:async({where})=>where.contentHash===checkpointHash ? {metadataJson:JSON.stringify({schemaVersion:1,output:{summary:extractionSummary,
      concreteFacts:[{text:extractionFact,category:'completed'},{text:'后门锁已更换。',category:'revealed'}]}})} : null},
    novelFactEntry:{findMany:async()=>writtenFacts},
    knowledgeChunk:{findMany:async()=>[]},
  };
  const projectionPath = path.resolve(__dirname,'../../src/services/novel/runtime/artifactSync/facts/ChapterArtifactFactProjection.ts');
  const projection = fs.existsSync(projectionPath) ? loadRuntimeSource('artifactSync/facts/ChapterArtifactFactProjection.ts', {
    '../../../../../db/prisma':{prisma},'../ChapterArtifactContentVersion':{buildChapterArtifactContentHash:hash},
  }) : {};
  const documentsPath = path.resolve(__dirname,'../../src/services/rag/facts/ChapterFactDocuments.ts');
  const documents = fs.existsSync(documentsPath) ? loadRuntimeSource('../../rag/facts/ChapterFactDocuments.ts', {
    '../../../db/prisma':{prisma},'../../novel/runtime/artifactSync/facts':{...projection,buildChapterArtifactContentHash:hash},
  }) : {};
  const {RagIndexService} = loadRuntimeSource('../../rag/RagIndexService.ts', {
    '../../db/prisma':{prisma},'../../config/rag':{ragConfig:{}},'../settings/RagSettingsService':{},
    './EmbeddingService':{},'./VectorStoreService':{},'./RagContextualChunkService':{RagContextualChunkService:class{}},
    './embeddingModelLimits':{},'./utils':ragUtils,'./chunkFacets':facets,'./facts':{...documents,buildChapterArtifactContentHash:hash},
  });
  return {chapter,summary,prisma,documents,index:new RagIndexService({},{}),
    completeFacts:()=>{writtenFacts.push({text:'后门锁已更换。',category:'revealed'});},
    withWhitespace:()=>{
      extractionSummary='甲买下   钥匙。'; summary.summary='甲买下 钥匙。';
      extractionFact='钥匙花费\n三百两。'; writtenFacts=[{text:'钥匙花费 三百两。',category:'completed'}];
    },
    edit:()=>{chapter.content='甲没有购买钥匙。';},
    corrupt:()=>{prisma.chapterArtifactSyncCheckpoint.findFirst=async()=>({metadataJson:'not JSON'});},
  };
}

test('V2 indexes unified hard facts as individual chunks only after they are written', async()=>{
  const f=fixture();
  let docs=await f.index.loadSourceDocuments('chapter_summary','c','tenant');
  assert.deepEqual(docs[0].preChunks?.map(x=>x.chunkText),['甲买下钥匙。','钥匙花费三百两。']);
  f.completeFacts();
  docs=await f.index.loadSourceDocuments('chapter_summary','c','tenant');
  assert.deepEqual(docs[0].preChunks.map(x=>x.chunkText),['甲买下钥匙。','钥匙花费三百两。','后门锁已更换。']);
  assert.equal(docs[0].metadata.chapterContentHash,hash(f.chapter.content));
  assert.equal(docs[0].preChunks[2].metadata.category,'revealed');
  f.edit();
  assert.deepEqual(await f.index.loadSourceDocuments('chapter_summary','c','tenant'),[],'a stale summary cannot be relabeled as a new text version');
});

test('artifact facts match the saved normalization of whitespace',async()=>{
  const f=fixture();
  f.withWhitespace();
  const docs=await f.index.loadSourceDocuments('chapter_summary','c','tenant');
  assert.deepEqual(docs[0]?.preChunks.map(x=>x.chunkText),['甲买下 钥匙。','钥匙花费 三百两。']);
});

test('V1 keeps its summary document and malformed V2 checkpoints fail the indexing job visibly', async()=>{
  const f=fixture();
  f.chapter.novel.directorVersion='v1';
  const docs=await f.index.loadSourceDocuments('chapter_summary','c','tenant');
  assert.equal(docs[0].content,'甲买下钥匙。');
  assert.equal(docs[0].preChunks,undefined);
  f.chapter.novel.directorVersion='v2';
  f.corrupt();
  await assert.rejects(f.index.loadSourceDocuments('chapter_summary','c','tenant'),/JSON|检查点/);
});

test('V2 full prose indexes also carry the saved version used by retrieval filtering',async()=>{
  const f=fixture();
  const docs=await f.index.loadSourceDocuments('chapter','c','tenant');
  assert.equal(docs[0].metadata.chapterContentHash,hash(f.chapter.content));
  assert.equal(docs[0].metadata.chapterArtifactVersion,1);
});

test('retrieval filters outdated and future fact chunks before topK fusion, retaining ordinary sources', async()=>{
  const f=fixture();
  const chunk=(id,metadata,overrides={})=>({id,ownerType:'chapter_summary',ownerId:'c',novelId:'n',score:1,
    title:'交易',chunkText:id,chunkOrder:0,metadataJson:JSON.stringify(metadata),source:'vector',...overrides});
  const meta={chapterArtifactVersion:1,chapterId:'c',chapterOrder:2,chapterContentHash:hash(f.chapter.content)};
  const candidates=[
    chunk('stale-prose',{...meta,chapterContentHash:'obsolete'},{ownerType:'chapter'}),
    chunk('obsolete',{...meta,chapterContentHash:'obsolete'}),
    chunk('future',{...meta,chapterOrder:4}),
    chunk('wrong-book',meta,{novelId:'other'}),
    chunk('valid',meta),
    chunk('ordinary',{}, {ownerType:'world',ownerId:'w'}),
  ];
  const {HybridRetrievalService} = loadRuntimeSource('../../rag/HybridRetrievalService.ts', {
    '../../db/prisma':{prisma:f.prisma},'../../config/rag':{ragConfig:{enabled:true,defaultTenantId:'tenant',finalTopK:2,rerankerEnabled:false}},
    './utils':ragUtils,'./EmbeddingService':{},'./VectorStoreService':{},
    '../knowledge/common':{resolveKnowledgeDocumentIds:async()=>[]},
    './types':require('../../dist/services/rag/types'),'./chunkFacets':facets,
    './RagRetrievalTracer':{RagRetrievalTracer:class{record(){} setScope(){} flushAsync(){}}},
    './RagRerankerService':{RagRerankerService:class{},resolveRerankerCandidateLimit:()=>2},'./facts':f.documents,
  });
  const service=new HybridRetrievalService({},{});
  service.vectorSearch=async()=>candidates;
  service.keywordSearch=async()=>[];
  const result=await service.retrieve('钥匙',{novelId:'n',currentChapterOrder:3,finalTopK:2,knowledgeDocumentIds:[]});
  assert.deepEqual(result.map(x=>x.id).sort(),['ordinary','valid']);
  service.vectorSearch=async()=>[chunk('shared',{...meta,chapterContentHash:'obsolete'})];
  service.keywordSearch=async()=>[chunk('shared',meta,{chunkText:'有效关键词结果',source:'keyword'})];
  const overlap=await service.retrieve('钥匙',{novelId:'n',currentChapterOrder:3,finalTopK:2,knowledgeDocumentIds:[]});
  assert.equal(overlap[0].chunkText,'有效关键词结果','a current keyword hit cannot authorize an outdated vector hit with the same chunk id');
  service.vectorSearch=async()=>candidates;
  service.keywordSearch=async()=>[];
  f.edit();
  const afterEdit=await service.retrieve('钥匙',{novelId:'n',currentChapterOrder:3,finalTopK:2,knowledgeDocumentIds:[]});
  assert.deepEqual(afterEdit.map(x=>x.id),['ordinary']);
});
