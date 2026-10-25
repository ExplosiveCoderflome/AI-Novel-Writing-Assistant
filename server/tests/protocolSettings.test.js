const test=require('node:test'), assert=require('node:assert/strict'), http=require('node:http');
const {HumanMessage}=require('@langchain/core/messages');
const {prisma}=require('../dist/db/prisma');
const {EMPTY_MODEL_TOKEN_SETTINGS:empty,saveModelTokenSettings,getModelTokenSettings}=require('../dist/services/settings/modelTokens');
const {saveLLMSelectionSettings,getLLMSelectionSettings}=require('../dist/services/settings/LLMSelectionSettingsService');
const {resolveLLMClientOptions,createLLMFromResolvedOptions,setProviderSecretCache}=require('../dist/llm/factory');
const {resolveProtocol,buildThinkingParameters}=require('../dist/llm/protocols/ProtocolPolicy');
const {normalizeApiBaseURL,originBoundFetch,readSseJSON}=require('../dist/llm/protocols/transport');
const {fetchPaginatedModels,getProviderModels}=require('../dist/llm/modelCatalog');
const {collectLlmResponse}=require('../dist/llm/structured/ResponseCollector');
const records=new Map();
prisma.appSetting.findUnique=async({where})=>records.has(where.key)?{key:where.key,value:records.get(where.key)}:null;
prisma.appSetting.upsert=async({where,create,update})=>{records.set(where.key,records.has(where.key)?update.value:create.value);return{key:where.key,value:records.get(where.key)}};
let route=null;prisma.modelRouteConfig.findUnique=async()=>route;

test('model settings persist 128K/256K independently, reject invalid numbers, preserve blank defaults',async()=>{
  assert.deepEqual(await getModelTokenSettings('fixture','unset'),empty);
  await saveModelTokenSettings('fixture','local',{contextWindowTokens:262144,maxOutputTokens:131072,maxReasoningTokens:262144,budgetSharing:'unknown'});
  const value=await getModelTokenSettings('fixture','local');assert.equal(value.maxOutputTokens,131072);assert.equal(value.maxInputTokens,null);assert.equal(value.maxReasoningTokens,262144);
  for(const n of [0,-1,1.2,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]) await assert.rejects(()=>saveModelTokenSettings('fixture','invalid',{maxOutputTokens:n}));
  await saveLLMSelectionSettings({provider:'fixture',model:'selected',maxTokens:262144});
  assert.equal((await getLLMSelectionSettings()).maxTokens,262144);assert.equal((await getModelTokenSettings('fixture','selected')).maxOutputTokens,null);
  await saveLLMSelectionSettings({provider:'fixture',model:'selected',maxTokens:4096});assert.equal((await getLLMSelectionSettings()).maxTokens,4096);
});

test('effective output priority: request > explicit route > model > task default; legacy 4096 is unset',async()=>{
  setProviderSecretCache('fixture',{key:'offline-fixture',model:'priority',baseURL:'http://127.0.0.1:1/v1'});
  await saveModelTokenSettings('fixture','priority',{maxOutputTokens:131072});
  route={taskType:'planner',provider:'fixture',model:'priority',temperature:0.2,maxTokens:65536,requestProtocol:'auto',structuredResponseFormat:'auto'};
  assert.equal((await resolveLLMClientOptions('fixture',{model:'priority',taskType:'planner',defaultMaxTokens:6400,maxTokens:262144})).maxTokens,262144);
  assert.equal((await resolveLLMClientOptions('fixture',{model:'priority',taskType:'planner',defaultMaxTokens:6400})).maxTokens,65536);
  route.maxTokens=4096;
  assert.equal((await resolveLLMClientOptions('fixture',{model:'priority',taskType:'planner',defaultMaxTokens:6400})).maxTokens,131072);
  records.set('llm.routeOutputExplicit.planner','true');
  assert.equal((await resolveLLMClientOptions('fixture',{model:'priority',taskType:'planner',defaultMaxTokens:6400})).maxTokens,4096);
  route=null;records.delete('llm.routeOutputExplicit.planner');
  assert.equal((await resolveLLMClientOptions('fixture',{model:'blank',defaultMaxTokens:6400})).maxTokens,6400);
  assert.equal((await resolveLLMClientOptions('fixture',{model:'blank'})).maxTokens,undefined);
  await assert.rejects(()=>resolveLLMClientOptions('fixture',{baseURL:'https://other.invalid/v1'}),/域名/);
  setProviderSecretCache('fixture',null);
});

test('protocol capability selection never follows a model alias to another vendor',()=>{
  assert.equal(resolveProtocol('auto','auto','https://gateway.invalid/v1'),'openai_compatible');
  assert.equal(resolveProtocol('auto','auto','https://api.deepseek.com/v1'),'deepseek');
  assert.equal(resolveProtocol('anthropic','deepseek','https://gateway.invalid/v1'),'anthropic');
  assert.deepEqual(buildThinkingParameters('openai_compatible',empty),{});
  assert.throws(()=>buildThinkingParameters('openai_compatible',{...empty,thinkingMode:'enabled'}),/未声明/);
  assert.deepEqual(buildThinkingParameters('openai_compatible',{...empty,chatReasoningFormat:'reasoning_effort',thinkingEffort:'low'}),{reasoning_effort:'low'});
  assert.deepEqual(buildThinkingParameters('deepseek',{...empty,thinkingMode:'disabled'}),{thinking:{type:'disabled'}});
  assert.deepEqual(buildThinkingParameters('openai_responses',{...empty,thinkingEffort:'low'}),{reasoning:{effort:'low'}});
  assert.throws(()=>buildThinkingParameters('anthropic',{...empty,thinkingMode:'enabled',thinkingBudgetTokens:4096},4096),/小于/);
  assert.deepEqual(buildThinkingParameters('anthropic',{...empty,thinkingMode:'adaptive',thinkingEffort:'high'}),{thinking:{type:'adaptive'},output_config:{effort:'high'}});
  assert.deepEqual(buildThinkingParameters('llama_cpp',{...empty,thinkingMode:'disabled'}),{chat_template_kwargs:{enable_thinking:false}});
});

const chatEvents=[{choices:[{index:0,delta:{role:'assistant',reasoning_content:'草稿'},finish_reason:null}]},{choices:[{index:0,delta:{content:'{"ok":true}'},finish_reason:null}]},{choices:[{index:0,delta:{},finish_reason:'stop'}]}];
function responseEvents(incomplete=false){return [
  {type:'response.created',response:{id:'r-fixture',model:'fixture',status:'in_progress'}},
  {type:'response.output_text.delta',item_id:'m-fixture',output_index:0,content_index:0,delta:'{"ok":true}'},
  {type:incomplete?'response.incomplete':'response.completed',response:{id:'r-fixture',model:'fixture',object:'response',created_at:1,status:incomplete?'incomplete':'completed',incomplete_details:incomplete?{reason:'max_output_tokens'}:null,
    output:[{id:'m-fixture',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'{"ok":true}',annotations:[]}]}],usage:{input_tokens:5,output_tokens:7,total_tokens:12}}}];}
async function mockServer(run){
  const received=[];let events=chatEvents;
  const server=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;received.push({url:req.url,body:JSON.parse(body),headers:req.headers});
    res.writeHead(200,{'Content-Type':'text/event-stream'});const bytes=Buffer.from(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''));for(let i=0;i<bytes.length;i+=7)res.write(bytes.subarray(i,i+7));res.end();});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{await run({baseURL:`http://127.0.0.1:${server.address().port}/v1`,received,setEvents:e=>events=e});}
  finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
function resolved(baseURL,requestProtocol,modelKwargs={}){return{provider:'fixture',providerName:'Fixture',apiKey:'offline-fixture',model:'fixture',baseURL,authMode:'bearer',temperature:0.2,maxTokens:262144,concurrencyLimit:0,requestIntervalMs:0,reasoningEnabled:true,reasoningEffort:null,includeRawResponse:true,requestProtocol,executionMode:'structured',reasoningForcedOff:false,tokenSettings:{...empty},modelKwargs};}

test('Chat, DeepSeek and llama.cpp send exact large output and their declared thinking fields',()=>mockServer(async({baseURL,received,setEvents})=>{
  for(const [protocol,kwargs] of [['openai_compatible',{}],['deepseek',{thinking:{type:'enabled'},reasoning_effort:'high'}],['llama_cpp',{chat_template_kwargs:{enable_thinking:false}}]]){
    setEvents(chatEvents);const llm=createLLMFromResolvedOptions(resolved(baseURL,protocol,kwargs));
    const result=await collectLlmResponse(await llm.stream([new HumanMessage('offline JSON')],{response_format:{type:'json_object'}}));
    assert.equal(result.rawContent,'{"ok":true}');const r=received.at(-1);assert.equal(r.url,'/v1/chat/completions');assert.equal(r.body.max_tokens,262144);assert.equal(r.body.max_completion_tokens,undefined);
    for(const [key,value]of Object.entries(kwargs))assert.deepEqual(r.body[key],value);
  }
}));

test('manual Chat completion-token field is sent without duplicate max_tokens',()=>mockServer(async({baseURL,received})=>{
  const settings=resolved(baseURL,'openai_compatible');settings.tokenSettings.outputTokenParameter='max_completion_tokens';
  await collectLlmResponse(await createLLMFromResolvedOptions(settings).stream([new HumanMessage('offline')]));
  assert.equal(received[0].body.max_completion_tokens,262144);assert.equal(received[0].body.max_tokens,undefined);
}));

test('Responses maps max_output_tokens/reasoning and preserves incomplete control before SDK drops it',()=>mockServer(async({baseURL,received,setEvents})=>{
  setEvents(responseEvents());let llm=createLLMFromResolvedOptions(resolved(baseURL,'openai_responses',{reasoning:{effort:'low'}}));
  const result=await collectLlmResponse(await llm.stream([new HumanMessage('offline')]));assert.equal(result.rawContent,'{"ok":true}');assert.equal(result.response.finishReason,'stop');
  assert.equal(received[0].url,'/v1/responses');assert.equal(received[0].body.max_output_tokens,262144);assert.equal(received[0].body.max_tokens,undefined);assert.equal(received[0].body.reasoning.effort,'low');
  setEvents(responseEvents(true));await assert.rejects(async()=>collectLlmResponse(await llm.stream([new HumanMessage('offline')])),e=>e.code==='LLM_RESPONSE_TERMINATED'&&e.response.finishReason==='max_output_tokens'&&e.retryable===false);
}));

test('Claude Messages maps thinking, split reasoning, max_tokens and stop_reason',()=>mockServer(async({baseURL,received,setEvents})=>{
  setEvents([{type:'message_start',message:{usage:{input_tokens:5}}},{type:'content_block_delta',index:0,delta:{type:'thinking_delta',thinking:'草稿'}},{type:'content_block_delta',index:1,delta:{type:'text_delta',text:'{"ok":true}'}},{type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:7}},{type:'message_stop'}]);
  const llm=createLLMFromResolvedOptions(resolved(baseURL,'anthropic',{thinking:{type:'adaptive'},output_config:{effort:'high'}}));
  const result=await collectLlmResponse(await llm.stream([new HumanMessage('offline')]));assert.equal(result.rawContent,'{"ok":true}');assert.equal(result.response.reasoningChars,2);assert.equal(result.response.finishReason,'end_turn');
  const r=received[0];assert.equal(r.url,'/v1/messages');assert.equal(r.body.max_tokens,262144);assert.equal(r.body.thinking.type,'adaptive');assert.equal(r.headers['x-api-key'],'offline-fixture');assert.equal(r.body.temperature,undefined);
}));

test('Gemini native maps generationConfig, separates thoughts and rejects length',()=>mockServer(async({baseURL,received,setEvents})=>{
  setEvents([{candidates:[{content:{parts:[{thought:true,text:'草稿'},{text:'{"ok":true}'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:5,candidatesTokenCount:6,thoughtsTokenCount:1,totalTokenCount:12}}]);
  const llm=createLLMFromResolvedOptions(resolved(baseURL.replace('/v1','/v1beta'),'gemini',{thinkingConfig:{thinkingBudget:8192,includeThoughts:true}}));
  const result=await collectLlmResponse(await llm.stream([new HumanMessage('offline')],{response_format:{type:'json_object'}}));assert.equal(result.rawContent,'{"ok":true}');assert.equal(result.response.reasoningChars,2);
  const r=received[0];assert.equal(r.url,'/v1beta/models/fixture:streamGenerateContent?alt=sse');assert.equal(r.body.generationConfig.maxOutputTokens,262144);assert.equal(r.body.generationConfig.thinkingConfig.thinkingBudget,8192);assert.equal(r.headers['x-goog-api-key'],'offline-fixture');
  setEvents([{candidates:[{content:{parts:[{text:'{"ok":true}'}]},finishReason:'MAX_TOKENS'}]}]);
  await assert.rejects(async()=>collectLlmResponse(await llm.stream([new HumanMessage('offline')])),e=>e.code==='LLM_RESPONSE_TERMINATED');
}));

test('Chat disconnect without finish is not accepted as a complete JSON response',()=>mockServer(async({baseURL,setEvents})=>{
  setEvents(chatEvents.slice(0,2));await assert.rejects(async()=>collectLlmResponse(await createLLMFromResolvedOptions(resolved(baseURL,'openai_compatible')).stream([new HumanMessage('offline')])),/结束事件/);
}));

test('model list pagination supports vendor cursors, retains manual IDs, rejects foreign next URLs',async()=>{
  const old=global.fetch,requests=[];let malicious=false;
  global.fetch=async(input,init)=>{requests.push({url:String(input),init});return Response.json(malicious?{data:[{id:'a'}],next:'https://foreign.invalid/models'}:requests.length===1?{models:[{name:'models/a'}],nextPageToken:'cursor'}:{models:[{name:'models/b'}]});};
  try{
    assert.deepEqual(await fetchPaginatedModels('https://fixture.invalid/v1beta','gemini',{'x-goog-api-key':'offline-fixture'}),['a','b']);assert.match(requests[1].url,/pageToken=cursor/);assert.equal(requests[0].init.redirect,'error');
    malicious=true;requests.length=0;await assert.rejects(()=>fetchPaginatedModels('https://fixture.invalid/v1','openai_compatible',{Authorization:'Bearer offline-fixture'}),/其他域名/);assert.equal(requests.length,1);
    assert.ok((await getProviderModels('fixture',{fallbackModel:'manual-id'})).includes('manual-id'));
  }finally{global.fetch=old;}
});

test('URL normalization and SSE parsing reject unsafe URLs and malformed events',async()=>{
  assert.equal(normalizeApiBaseURL('https://fixture.invalid/v1/chat/completions?key=never'),'https://fixture.invalid/v1');
  assert.throws(()=>normalizeApiBaseURL('https://user:password@fixture.invalid'),/用户名/);
  await assert.rejects(()=>originBoundFetch('https://fixture.invalid')('https://foreign.invalid'),/其他主机/);
  const events=[];for await(const e of readSseJSON(new Response('event: result\r\ndata: {"a":\r\ndata: 1}\r\n\r\n').body))events.push(e);assert.equal(events[0].data.a,1);
  await assert.rejects(async()=>{for await(const e of readSseJSON(new Response('data: {broken}\n\n').body)){}},/合法 JSON/);
});

test('settings HTTP routes persist manual protocol and large budgets without touching novels',async()=>{
  const express=require('express');
  const {registerLLMSelectionRoutes}=require('../dist/routes/settings/llmSelectionRoutes');
  const app=express(),router=express.Router();app.use(express.json());registerLLMSelectionRoutes(router);app.use(router);
  app.use((error,req,res,next)=>res.status(400).json({success:false,message:error.message}));
  const settings={provider:'fixture',model:'http-model',maxOutputTokens:262144,contextWindowTokens:1048576,maxInputTokens:null,maxReasoningTokens:262144,budgetSharing:'shared',requestProtocol:'openai_responses',thinkingMode:'enabled',thinkingEffort:'low',thinkingBudgetTokens:null};
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    let response=await fetch(base+'/model-token-settings',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(settings)});assert.equal(response.status,200);
    response=await fetch(base+'/model-token-settings?provider=fixture&model=http-model');assert.equal(response.status,200);const read=await response.json();
    assert.equal(read.data.maxOutputTokens,262144);assert.equal(read.data.requestProtocol,'openai_responses');assert.equal(read.data.thinkingEffort,'low');
    response=await fetch(base+'/model-token-settings',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({...settings,maxOutputTokens:-1})});assert.equal(response.status,400);
    assert.equal((await getModelTokenSettings('fixture','http-model')).maxOutputTokens,262144);
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('explicit length termination stops the whole structured retry/fallback loop after one request',()=>mockServer(async({baseURL,received,setEvents})=>{
  const {invokeStructuredLlmDetailed}=require('../dist/llm/structuredInvoke');const {z}=require('zod');
  setProviderSecretCache('fixture',{key:'offline-fixture',baseURL,model:'length-fixture'});
  setEvents([...chatEvents.slice(0,2),{choices:[{index:0,delta:{},finish_reason:'length'}]}]);
  try{
    await assert.rejects(()=>invokeStructuredLlmDetailed({provider:'fixture',model:'length-fixture',schema:z.object({ok:z.boolean()}),systemPrompt:'Return JSON',userPrompt:'offline',label:'offline-length',maxRepairAttempts:3,disableFallbackModel:false}),e=>e.category==='incomplete_json'&&e.retryable===false);
    assert.equal(received.length,1);
  }finally{setProviderSecretCache('fixture',null);}
}));

test('native bound tools retain the full request guard and configured output',()=>mockServer(async({baseURL,received,setEvents})=>{
  setEvents([{type:'message_start',message:{usage:{input_tokens:5}}},{type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:1}},{type:'message_stop'}]);
  const {DynamicStructuredTool}=require('@langchain/core/tools');const {z}=require('zod');
  const tool=new DynamicStructuredTool({name:'fixture_tool',description:'offline tool',schema:z.object({value:z.string().optional()}),func:async()=>''});const circular={};circular.self=circular;tool.metadata=circular;
  const llm=createLLMFromResolvedOptions(resolved(baseURL,'anthropic')).bindTools([tool]);
  await collectLlmResponse(await llm.stream([new HumanMessage('offline')]));
  assert.equal(received[0].body.tools[0].name,'fixture_tool');assert.equal(received[0].body.max_tokens,262144);
}));

test('SSE supports CR, LF and split CRLF without losing Unicode frames',async()=>{
  for(const end of ['\r','\n','\r\n']) {
    const bytes=Buffer.from(`data: {"text":"中文"}${end}${end}`);const events=[];
    const body=new ReadableStream({start(c){for(const byte of bytes)c.enqueue(Uint8Array.of(byte));c.close();}});
    for await(const event of readSseJSON(body))events.push(event);
    assert.deepEqual(events.map(e=>e.data),[{text:'中文'}]);
  }
});

test('service authentication/configuration errors do not retry; context errors remain distinct and secrets are redacted',async()=>{
  const {assertApiResponse}=require('../dist/llm/protocols/transport'),{wrapStructuredInvokeError}=require('../dist/llm/structuredInvokeParser'),{resolveStructuredOutputProfile}=require('../dist/llm/structuredOutput');
  const common={label:'offline-rejection',strategy:'prompt_json',profile:resolveStructuredOutputProfile({provider:'fixture'})};
  for(const status of [400,401,403,404,413]) {
    let caught;try{await assertApiResponse(Response.json({error:{message:'rejected offline-fixture',...(status===413?{code:'context_length_exceeded'}:{})}},{status}),'offline-fixture');}catch(e){caught=e;}
    const result=wrapStructuredInvokeError({...common,error:caught});assert.equal(result.retryable,false);assert.ok(!result.message.includes('offline-fixture'));
    if(status===413)assert.equal(result.category,'input_budget_exceeded');
  }
});
