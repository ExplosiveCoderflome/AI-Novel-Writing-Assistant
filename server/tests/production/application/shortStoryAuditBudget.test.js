const test=require('node:test'),assert=require('node:assert/strict');
const {withShortStoryAuditBudget,ShortStoryAuditBudgetError}=require('../../../dist/modules/novel/short-story/application/shortStoryAuditPolicy');
const {withModelRequestBudget,claimModelRequest,currentModelRequestDescription}=require('../../../dist/platform/llm/retries');
const request=(model='primary',maxTokens=8192)=>({configuration:{provider:'openai',model,maxTokens},input:[{role:'user',content:'完整输入'}]});
test('an unknown physical output allowance cannot silently borrow an audit default',async()=>{
 const physical=request();delete physical.configuration.maxTokens;
 await assert.rejects(()=>withShortStoryAuditBudget(async()=>1000000,async()=>{await claimModelRequest(physical);return 'sent';}),ShortStoryAuditBudgetError);
});
test('fallback requests use their actual model window and a swallowed refusal cannot become success',async()=>{
 const sent=[],models=[];
 await assert.rejects(()=>withShortStoryAuditBudget(async(provider,model)=>{models.push(model);return model==='primary'?1000000:100;},async()=>{
  await claimModelRequest(request());sent.push('primary');
  try{await claimModelRequest(request('fallback'));sent.push('fallback');}catch{}
  return 'native code attempted to degrade';
 }),ShortStoryAuditBudgetError);
 assert.deepEqual(models,['primary','fallback']);assert.deepEqual(sent,['primary']);
});
test('the audit guard preserves the enclosing request budget and physical metadata',async()=>{
 const seen=[];
 await withModelRequestBudget({remaining:()=>2,beforeRequest:async()=>seen.push(currentModelRequestDescription().configuration.model)},()=>
  withShortStoryAuditBudget(async()=>1000000,async()=>{await claimModelRequest(request());await claimModelRequest(request('fallback'));}));
 assert.deepEqual(seen,['primary','fallback']);
});
