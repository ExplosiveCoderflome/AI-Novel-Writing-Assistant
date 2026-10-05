const test=require('node:test'); const assert=require('node:assert/strict');
const {attachLLMUsageTracking,runWithLlmUsageTracking}=require('../dist/llm/usageTracking');
const {runWithInvocationUsageObserver}=require('../dist/platform/llm/usage/application/InvocationUsageObserver');
const {LlmLiveBroker}=require('../dist/platform/llm/live/LlmLiveBroker');
const {prisma}=require('../dist/db/prisma');
const answer=n=>({content:'正文',usage_metadata:{input_tokens:n,output_tokens:100,total_tokens:n+100,input_token_details:{cache_read:n/2}}});
test('physical calls have distinct ids and child invoke batch is not charged twice',async()=>{
 const records=[],updates=[],old=prisma.generationJob.updateMany; prisma.generationJob.updateMany=async d=>{updates.push(d);return {count:1}};
 try { const llm={invoke:async()=>answer(1000),stream:async()=>{},async batch(inputs){return Promise.all(inputs.map(i=>this.invoke(i)))}};attachLLMUsageTracking(llm);
 await runWithInvocationUsageObserver(r=>records.push(r),()=>runWithLlmUsageTracking({generationJobId:'mock'},()=>llm.batch([1,2,3])));
 assert.equal(records.length,3);assert.equal(new Set(records.map(r=>r.invocationId)).size,3);assert.equal(updates.length,3);
 }finally{prisma.generationJob.updateMany=old}
});
test('SDK batch registers each unobserved result separately',async()=>{const records=[]; const llm={invoke:async()=>{},stream:async()=>{},batch:async()=>[answer(1000),answer(500)]};attachLLMUsageTracking(llm);await runWithInvocationUsageObserver(r=>records.push(r),()=>llm.batch([]));assert.equal(records.length,2)});
test('session sums attempts, deduplicates notifications and ignores legacy last-attempt snapshot',()=>{
 const b=new LlmLiveBroker(),s=b.begin({label:'test',mode:'structured'});
 const usage=n=>({promptTokens:n,completionTokens:100,totalTokens:n+100,inputCache:{cacheHitTokens:n/2,cacheMissTokens:n/2,cacheWriteTokens:null,cacheUsageStatus:'reported'}});
 s.attemptUsage('first',usage(1000));s.attemptUsage('repair',usage(500));s.attemptUsage('repair',usage(500));s.usage({...usage(500),reasoningTokens:null});
 assert.equal(b.getSnapshots({})[0].tokenUsage.promptTokens,1500);assert.equal(b.getSnapshots({})[0].tokenUsage.inputCache.cacheHitTokens,750);
 s.attemptUsage('failed',null);assert.equal(b.getSnapshots({})[0].tokenUsage.inputCache.cacheHitTokens,null);
});
test('failed invoke still emits one unknown attempt and preserves error',async()=>{const records=[]; const llm={invoke:async()=>{throw new Error('original')},stream:async()=>{},batch:async()=>[]};attachLLMUsageTracking(llm);await assert.rejects(runWithInvocationUsageObserver(r=>records.push(r),()=>llm.invoke([])),/original/);assert.equal(records.length,1);assert.equal(records[0].status,'failed');assert.equal(records[0].usage,null)});
