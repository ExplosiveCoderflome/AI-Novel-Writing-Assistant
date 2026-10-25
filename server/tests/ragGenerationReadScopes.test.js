const test=require('node:test'),assert=require('node:assert/strict');
const {prisma}=require('../dist/db/prisma');
const {HybridRetrievalService}=require('../dist/services/rag/HybridRetrievalService');
const {ragConfig}=require('../dist/config/rag');
const common=require('../dist/services/knowledge/common');
const {stubDatabaseMethod}=require('./legacyDirector/databasePorts');
function point(id,type,generation){return{id,score:100,payload:{tenantId:'fixture-tenant',ownerType:type,ownerId:type==='knowledge_document'?'fixture-doc':'fixture-chapter',chunkText:id,chunkOrder:0,...(generation?{indexGeneration:generation}:{})}}}
function fixture(t,published=true){
 const old={...ragConfig};Object.assign(ragConfig,{enabled:true,rerankerEnabled:false,retrievalTraceSampleRate:0});t.after(()=>Object.assign(ragConfig,old));
 t.mock.method(common,'resolveKnowledgeDocumentIds',async()=>['fixture-doc']);
 const calls={embedding:0,search:[]};
 stubDatabaseMethod(t,prisma.knowledgeChunk,'findMany',async query=>query.distinct?(published?[{ownerId:'fixture-doc',metadataJson:JSON.stringify({indexGeneration:'published-gen'})}]:[]):query.where?.id?(published?[{id:'published-point'}]:[]):[]);
 const retrieval=new HybridRetrievalService({embedTexts:async()=>{calls.embedding++;return{vectors:[[1,2]]}}},{ensureCollection:async()=>{},search:async(v,n,filters)=>{calls.search.push(filters);return filters.ownerTypes.includes('knowledge_document')?[point('published-point','knowledge_document','published-gen'),point('staging-point','knowledge_document','unpublished-gen')]:[point('chapter-point','chapter')]}});
 return {calls,retrieval};
}
for(const [label,ownerTypes] of [['all owners',undefined],['mixed owners',['chapter','knowledge_document']]]){
 test(`public retrieval separates ${label} and preserves generation-aware document reading`,async t=>{
  const {calls,retrieval}=fixture(t);const result=await retrieval.retrieve('fixture',{tenantId:'fixture-tenant',ownerTypes,finalTopK:5,rerankerEnabled:false});
  assert.deepEqual(result.map(r=>r.id).sort(),['chapter-point','published-point']);
  const docs=calls.search.find(row=>row.ownerTypes.includes('knowledge_document'));
  assert.deepEqual(docs.knowledgeGenerations,[{ownerId:'fixture-doc',generation:'published-gen'}]);
  assert.ok(calls.search.some(row=>!row.ownerTypes.includes('knowledge_document')));
 });
}
test('an unindexed document scope avoids a redundant embedding request while chapter search stays available',async t=>{
 const {calls,retrieval}=fixture(t,false);
 const result=await retrieval.retrieve('fixture',{tenantId:'fixture-tenant',ownerTypes:['chapter','knowledge_document'],finalTopK:5,rerankerEnabled:false});
 assert.deepEqual(result.map(r=>r.id),['chapter-point']);assert.equal(calls.embedding,1);
});
