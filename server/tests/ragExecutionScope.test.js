const test=require('node:test'),assert=require('node:assert/strict');
const {ragConfig}=require('../dist/config/rag');
const {EmbeddingService}=require('../dist/services/rag/EmbeddingService');
const {VectorStoreService}=require('../dist/services/rag/VectorStoreService');
const {HybridRetrievalService}=require('../dist/services/rag/HybridRetrievalService');
const fields=['tenantId','ownerType','ownerId','novelId','worldId','characterRole','chapterAnchor','genreTags','sellingPointTags'];
const scope=()=>require('../dist/services/rag/execution');
const ports=()=>({retrieve:async(_query,_options,run)=>run(),request:async(_input,send)=>send()});
function embedding(){const service=new EmbeddingService();
 service.resolveRuntimeSettings=async()=>({provider:'test',model:'embedding'});service.resolveApiKey=async()=> 'secret-never-persist';
 service.resolveBaseUrl=async()=> 'https://private.test/v1';return service;}
test('read-only vector checks issue only GET and reject missing collections or payload indexes',async t=>{
 const original=global.fetch;let missing=false,indexMissing=false;const calls=[];
 global.fetch=async(url,options={})=>{calls.push(options.method??'GET');return missing?new Response('{}',{status:404}):Response.json({result:{config:{params:{vectors:{size:3}}},payload_schema:Object.fromEntries(fields.filter(f=>!indexMissing||f!=='tenantId').map(f=>[f,{data_type:'keyword'}]))}});};
 t.after(()=>{global.fetch=original;});
 const service=new VectorStoreService();
 await scope().withRagExecutionScope(ports(),()=>service.ensureCollection(3));assert.deepEqual(calls,['GET']);
 missing=true;await assert.rejects(scope().withRagExecutionScope(ports(),()=>service.ensureCollection(3)),/索引|集合/);
 missing=false;indexMissing=true;await assert.rejects(scope().withRagExecutionScope(ports(),()=>service.ensureCollection(3)),/索引/);
 assert.ok(calls.every(method=>method==='GET'));
 global.fetch=async()=>{throw TypeError('fetch failed');};
 await assert.rejects(scope().withRagExecutionScope(ports(),()=>service.ensureCollection(3)),error=>error.code==='production_rag_index_not_ready'&&error.sourceRoute==='/knowledge');
});
test('embedding retries and adaptive splits expose every physical input with credentials excluded',async t=>{
 const original=ragConfig.embeddingMaxRetries;ragConfig.embeddingMaxRetries=0;t.after(()=>{ragConfig.embeddingMaxRetries=original;});
 const service=embedding(),descriptions=[];
 service.fetchWithTimeout=async(_url,options)=>{const body=JSON.parse(options.body);return body.input.length>1?Response.json({error:'busy'},{status:503}):Response.json({data:[{index:0,embedding:[body.input[0].length]}],usage:{total_tokens:5,prompt_tokens:5}});};
 const result=await scope().withRagExecutionScope({...ports(),request:async(input,send)=>{descriptions.push(input);return send();}},()=>service.embedTexts(['one','two']));
 assert.deepEqual(result.vectors,[[3],[3]]);assert.equal(descriptions.length,3);
 assert.deepEqual(descriptions.map(d=>d.input.input.length),[2,1,1]);
 assert.ok(descriptions.every(d=>d.model==='embedding'&&d.configurationKey&&d.kind==='embedding'));
 for(const secret of ['secret-never-persist','private.test'])assert.ok(!JSON.stringify(descriptions).includes(secret));
});
test('a swallowed request fence cannot publish a degraded empty retrieval or dispatch HTTP',async t=>{
 const original=ragConfig.enabled;ragConfig.enabled=true;t.after(()=>{ragConfig.enabled=original;});
 const service=embedding();let http=0;service.fetchWithTimeout=async()=>{http++;throw Error('must not run');};
 const hybrid=new HybridRetrievalService(service,new VectorStoreService());hybrid.keywordSearch=async()=>[];
 const rejected=Error('captured lease lost');
 await assert.rejects(scope().withRagExecutionScope({...ports(),request:async()=>{throw rejected;}},
  ()=>hybrid.retrieve('query',{ownerTypes:['chapter']})),error=>error===rejected);
 assert.equal(http,0);
});
test('concurrent new scopes and legacy requests never borrow another execution port',async()=>{
 const service=embedding(),seen=[];service.fetchWithTimeout=async()=>Response.json({data:[{index:0,embedding:[1]}]});
 const run=id=>scope().withRagExecutionScope({...ports(),request:async(input,send)=>{await Promise.resolve();seen.push(id);return send();}},()=>service.embedTexts(['query']));
 const values=await Promise.all([run('one'),run('two'),service.embedTexts(['query'])]);
 assert.equal(values.length,3);assert.deepEqual(seen.sort(),['one','two']);
});
