const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {setup}=require('./persistence/sqliteFixture.cjs');
async function invoke(f,scenario,replay){
 const databases=await f.db.$queryRawUnsafe('PRAGMA database_list'),file=databases.find(row=>row.name==='main').file;
 const result=spawnSync(process.execPath,[path.join(__dirname,'batch/nativeEntryProcess.cjs')],{encoding:'utf8',timeout:55000,maxBuffer:2000000,
  env:{...process.env,DATABASE_URL:`file:${file}`,NODE_ENV:'test',RAG_ENABLED:'false',PRODUCTION_KERNEL_V2_CHAPTERS:replay?'false':'true',
   KERNEL_TEST_CASE:scenario,KERNEL_TEST_REPLAY:replay??'',PRODUCTION_KERNEL_MODEL_WINDOWS:JSON.stringify([{provider:'openai',model:'fixture-model',contextWindow:1000000}])}});
 assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
 return JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
}
test('real production composition enters the native kernel with actual planning, prompts, assessment and consumers',async t=>{
 const f=await setup(t),databases=await f.db.$queryRawUnsafe('PRAGMA database_list');
 const file=databases.find(row=>row.name==='main').file;
 const child=spawnSync(process.execPath,[path.join(__dirname,'batch/nativeEntryProcess.cjs')],{encoding:'utf8',timeout:55000,maxBuffer:2000000,
  env:{...process.env,DATABASE_URL:`file:${file}`,NODE_ENV:'test',RAG_ENABLED:'false',PRODUCTION_KERNEL_V2_CHAPTERS:'true',
   PRODUCTION_KERNEL_MODEL_WINDOWS:JSON.stringify([{provider:'openai',model:'fixture-model',contextWindow:1000000}])}});
 assert.equal(child.status,0,child.stdout+'\n'+child.stderr);
 const data=JSON.parse(child.stdout.trim().split(/\r?\n/).at(-1));
 assert.equal(data.result.stopSignal,undefined,JSON.stringify(data.result));assert.ok(data.result.artifact);
 assert.equal(data.units.length,1);assert.equal(data.jobs,0);assert.ok(data.reports>0);
 assert.equal(data.chapters[0].generationState,'approved');assert.equal(data.chapters[0].chapterStatus,'completed');
 assert.ok(data.calls.includes('writer'));assert.ok(data.calls.includes('review'));
 assert.ok(data.outputTokens.length>0);assert.ok(data.outputTokens.every(row=>row.maxTokens===8192),JSON.stringify(data.outputTokens));
 assert.ok(data.events.some(row=>row.type==='production_batch_implementation'));
 const restarted=spawnSync(process.execPath,[path.join(__dirname,'batch/nativeEntryProcess.cjs')],{encoding:'utf8',timeout:55000,maxBuffer:2000000,
  env:{...process.env,DATABASE_URL:`file:${file}`,NODE_ENV:'test',RAG_ENABLED:'false',PRODUCTION_KERNEL_V2_CHAPTERS:'false',KERNEL_TEST_REPLAY:'true',
   PRODUCTION_KERNEL_MODEL_WINDOWS:JSON.stringify([{provider:'openai',model:'fixture-model',contextWindow:1000000}])}});
 assert.equal(restarted.status,0,restarted.stdout+'\n'+restarted.stderr);
 const resumed=JSON.parse(restarted.stdout.trim().split(/\r?\n/).at(-1));
 assert.deepEqual(resumed.calls,[]);assert.deepEqual(resumed.result,data.result);
 assert.equal(resumed.reports,data.reports);assert.equal(resumed.jobs,0);
});

test('native entry keeps retrieval enabled, prepares an empty ledger read-only and reuses saved results after restart',async t=>{
 const f=await setup(t),databases=await f.db.$queryRawUnsafe('PRAGMA database_list');
 const file=databases.find(row=>row.name==='main').file;
 const env={...process.env,DATABASE_URL:`file:${file}`,NODE_ENV:'test',RAG_ENABLED:'true',PRODUCTION_KERNEL_V2_CHAPTERS:'true',
  KERNEL_TEST_CASE:'rag',EMBEDDING_PROVIDER:'openai',EMBEDDING_MODEL:'fixture-embedding',OPENAI_API_KEY:'fixture-key',
  OPENAI_BASE_URL:'https://models.invalid/v1',QDRANT_URL:'https://qdrant.invalid',QDRANT_COLLECTION:'fixture-read-only',
  PRODUCTION_KERNEL_MODEL_WINDOWS:JSON.stringify([{provider:'openai',model:'fixture-model',contextWindow:1000000},{provider:'openai',model:'fixture-embedding',contextWindow:32768}])};
 const execute=replay=>{
  const child=spawnSync(process.execPath,[path.join(__dirname,'batch/nativeEntryProcess.cjs')],{encoding:'utf8',timeout:55000,maxBuffer:2000000,
   env:{...env,KERNEL_TEST_REPLAY:replay?'true':'',PRODUCTION_KERNEL_V2_CHAPTERS:replay?'false':'true'}});
  assert.equal(child.status,0,child.stdout+'\n'+child.stderr);return JSON.parse(child.stdout.trim().split(/\r?\n/).at(-1));
 };
 const first=execute(false);assert.ok(first.result.artifact);assert.equal(first.result.stopSignal,undefined);
 assert.equal(first.chapters[0].generationState,'approved');assert.equal(first.chapters[0].chapterStatus,'completed');
 assert.ok(first.http.some(call=>call.path.endsWith('/embeddings')));assert.ok(first.http.every(call=>call.method==='GET'||call.path.endsWith('/embeddings')||call.path.endsWith('/points/search')));
 assert.ok((await f.db.llmInvocationUsageRecord.count({where:{stage:'rag_embedding'}}))>0);
 const second=execute(true);assert.deepEqual(second.http,[]);assert.deepEqual(second.calls,[]);assert.equal(second.reports,first.reports);
});

test('real entry saves a quality pause and resumes only reconciliation after the explicit source command',async t=>{
 const f=await setup(t),first=await invoke(f,'quality');
 assert.equal(first.result.stopSignal.kind,'manual_recovery');assert.match(first.result.stopSignal.reason,/质量/);
 assert.ok(first.chapters[0].content);assert.equal(first.reports,0);assert.equal(first.jobs,0);
 assert.equal(first.units[0].progress.qualityPause.acknowledged,false);
 const resumed=await invoke(f,'quality','quality');
 assert.equal(resumed.result.stopSignal,undefined,JSON.stringify(resumed.result));assert.ok(resumed.result.artifact);
 assert.equal(resumed.calls.includes('writer'),false);assert.equal(resumed.calls.filter(task=>task==='fact_extraction').length,1);
 assert.equal(resumed.chapters[0].content,first.chapters[0].content);assert.equal(resumed.chapters[0].chapterStatus,'completed');
});

test('real entry persists an unsent budget denial and consumes the source-page chapter grant without creating a legacy job',async t=>{
 const f=await setup(t),first=await invoke(f,'budget');
 assert.match(first.result.stopSignal.reason,/额度/);assert.deepEqual(first.calls,[]);assert.equal(first.chapters[0].content,'');
 assert.equal(first.jobs,0);assert.equal(first.reports,0);
 const resumed=await invoke(f,'budget','budget');
 assert.equal(resumed.result.stopSignal,undefined,JSON.stringify(resumed.result));assert.ok(resumed.result.artifact);
 assert.equal(resumed.calls.filter(task=>task==='writer').length,1);assert.equal(resumed.jobs,0);
 assert.ok(resumed.events.some(row=>row.type==='chapter_budget_granted'));
});
