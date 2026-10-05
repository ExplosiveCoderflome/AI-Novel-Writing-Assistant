const test = require('node:test');
const assert = require('node:assert/strict');
const {extractLlmTokenUsage: decode, mergeStreamTokenUsage: merge} = require('../dist/llm/usageTracking');
const sdk = (read) => ({usage_metadata:{input_tokens:1000,output_tokens:100,total_tokens:1100,
  ...(read === undefined ? {} : {input_token_details:{cache_read:read}})}});
for (const [name, payload, options] of [
  ['SDK', sdk(800)],
  ['DeepSeek', {response_metadata:{usage:{prompt_tokens:1000,completion_tokens:100,prompt_cache_hit_tokens:800,prompt_cache_miss_tokens:200}}}],
  ['Responses', {response_metadata:{usage:{input_tokens:1000,output_tokens:100,input_tokens_details:{cached_tokens:800}}}}],
  ['Qwen', {response_metadata:{usage:{input_tokens:1000,output_tokens:100,cached_tokens:800}}}],
  ['Anthropic raw', {response_metadata:{usage:{input_tokens:20,output_tokens:100,cache_read_input_tokens:800,cache_creation_input_tokens:180}}},{protocol:'anthropic'}],
  ['Gemini', {usageMetadata:{promptTokenCount:1000,candidatesTokenCount:100,totalTokenCount:1100,cachedContentTokenCount:800}},{protocol:'gemini-native'}],
]) test(`${name}: cached input is part of total input`, () => {
  const u=decode(payload,options);
  assert.equal(u.promptTokens,1000); assert.equal(u.totalTokens,1100);
  assert.equal(u.inputCache.cacheHitTokens,800);assert.equal(u.inputCache.cacheMissTokens,200);
  assert.equal(u.inputCache.cacheUsageStatus,'reported');
});
test('missing cache data differs from explicit zero',()=>{
  assert.equal(decode(sdk()).inputCache.cacheHitTokens,null);
  assert.equal(decode(sdk()).inputCache.cacheUsageStatus,'unavailable');
  assert.equal(decode(sdk(0)).inputCache.cacheMissTokens,1000);
});
for (const v of [-1,0.5,NaN,Infinity,1001,Number.MAX_SAFE_INTEGER+1]) test(`invalid cache value ${v} preserves base usage`,()=>{
  const u=decode(sdk(v));assert.equal(u.promptTokens,1000);
  assert.equal(u.inputCache.cacheUsageStatus,'invalid');assert.equal(u.inputCache.cacheHitTokens,null);
});
test('SDK base count and raw cache detail are combined without double counting',()=>{
  const u=decode({...sdk(),response_metadata:{usage:{input_tokens:20,output_tokens:100,
    cache_read_input_tokens:800,cache_creation_input_tokens:180}}},{protocol:'anthropic'});
  assert.equal(u.promptTokens,1000);assert.equal(u.inputCache.cacheWriteTokens,180);
  assert.equal(u.inputCache.cacheMissTokens,200);
});
test('conflicting metadata or hit/miss invalidates cache only',()=>{
  const u=decode({...sdk(800),response_metadata:{usage:{prompt_tokens:1000,completion_tokens:100,prompt_cache_hit_tokens:700,prompt_cache_miss_tokens:300}}});
  assert.equal(u.inputCache.cacheUsageStatus,'invalid');assert.equal(u.totalTokens,1100);
  assert.equal(decode({response_metadata:{usage:{prompt_tokens:1000,completion_tokens:100,prompt_cache_hit_tokens:800,prompt_cache_miss_tokens:300}}}).inputCache.cacheUsageStatus,'invalid');
});
test('cumulative stream usage is not summed and missing final detail is retained',()=>{
  const a=decode(sdk(800)),b=decode(sdk());
  const u=merge(merge(a,a),b);assert.equal(u.totalTokens,1100);assert.equal(u.inputCache.cacheHitTokens,800);
});
test('changed stream input cannot retain mismatched cache detail',()=>{
  const b=decode({usage_metadata:{input_tokens:1100,output_tokens:100,total_tokens:1200}});
  assert.equal(merge(decode(sdk(800)),b).inputCache.cacheUsageStatus,'invalid');
});
test('independent array calls sum cache only with complete coverage',()=>{
  const u=decode([sdk(800),sdk(0)]);assert.equal(u.inputCache.cacheHitTokens,800);assert.equal(u.inputCache.cacheMissTokens,1200);
  assert.equal(decode([sdk(800),sdk()]).inputCache.cacheHitTokens,null);
});

test('explicit zero total tokens still establishes reported zero cache',()=>{const usage=decode({usage_metadata:{input_tokens:0,output_tokens:0,total_tokens:0,input_token_details:{cache_read:0}}});assert.ok(usage);assert.equal(usage.inputCache.cacheHitTokens,0);assert.equal(usage.inputCache.cacheMissTokens,0)});
test('conflicting creation counts across cumulative frames invalidate cache',()=>{const frame=write=>decode({usage_metadata:{input_tokens:1000,output_tokens:100,total_tokens:1100,input_token_details:{cache_read:800,cache_creation:write}}});assert.equal(merge(frame(100),frame(180)).inputCache.cacheUsageStatus,'invalid')});
