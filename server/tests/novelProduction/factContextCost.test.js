const test = require('node:test');
const assert = require('node:assert/strict');
const {loadRuntimeSource} = require('./sourceHarness.cjs');

test('V2 structured summary and fact chunks reuse their source labels without extra AI calls',async()=>{
  let calls=0;
  const {RagContextualChunkService}=loadRuntimeSource('../../rag/RagContextualChunkService.ts',{
    'node:crypto':require('node:crypto'),
    '../../config/rag':{ragConfig:{contextualRetrievalEnabled:true,contextualRetrievalVersion:1,contextualRetrievalConcurrency:2}},
    '../../prompting/prompts/rag/contextualChunk.prompts':{ragContextualChunkPrompt:{}},
    './utils':require('../../dist/services/rag/utils'),
  });
  const service=new RagContextualChunkService(async()=>{
    calls++;
    return {output:{contextPrefix:'模型生成的说明'}};
  });
  const document={ownerType:'chapter_summary',ownerId:'c',title:'交易',novelId:'n',
    metadata:{chapterArtifactVersion:1,chapterOrder:2,chapterContentHash:'saved-hash'}};
  const candidates=[
    {ownerType:'chapter_summary',ownerId:'c',chunkOrder:0,chunkText:'甲买下钥匙。',tokenEstimate:5,metadataJson:JSON.stringify({...document.metadata,artifactKind:'summary'})},
    {ownerType:'chapter_summary',ownerId:'c',chunkOrder:1,chunkText:'钥匙花费三百两。',tokenEstimate:6,metadataJson:JSON.stringify({...document.metadata,artifactKind:'fact',category:'completed'})},
  ];
  await service.applyToCandidates({candidates,documentsByOwner:new Map([['chapter_summary:c',document]])});
  assert.equal(calls,0,'already extracted facts must not create a contextual prompt per fact');
  for(const candidate of candidates){
    assert.match(candidate.searchText,/第2章/);
    assert.match(candidate.searchText,/交易/);
    assert.ok(candidate.searchText.endsWith(candidate.chunkText));
    assert.equal(JSON.parse(candidate.metadataJson).chapterContentHash,'saved-hash');
  }
  const legacy=await service.buildContextPrefix({document:{...document,metadata:{}},chunkOrder:0,chunkText:'旧摘要'});
  assert.equal(calls,1,'the V1 contextual retrieval setting keeps its original behavior');
  assert.equal(legacy.contextPrefix,'模型生成的说明');
  await service.buildContextPrefix({document:{ownerType:'knowledge_document',ownerId:'k'},chunkOrder:0,chunkText:'知识资料'});
  assert.equal(calls,2,'other document types retain contextual AI enrichment');
});
