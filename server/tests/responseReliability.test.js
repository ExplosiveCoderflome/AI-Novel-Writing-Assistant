const test = require('node:test');
const assert = require('node:assert/strict');
const {z}=require('zod');
const {extractCompleteJsonValue}=require('../dist/llm/structured/JsonValue');
const {collectLlmResponse, ResponseTerminationError}=require('../dist/llm/structured/ResponseCollector');
const {captureStreamOutput}=require('../dist/llm/structured/StreamCapture');
const {parseStructuredLlmRawContentDetailed}=require('../dist/llm/structuredInvoke');
const {estimatePromptTokens,assertPromptBudget}=require('../dist/platform/llm/execution');
const {generateChapterBatches}=require('../dist/services/novel/volume/generation/ChapterBatching');
const {splitExtractionSource,extractSourceSegments}=require('../dist/services/styleEngine/extraction/SegmentedExtraction');
async function* chunks(parts) { for (const p of parts) yield typeof p==='string'?{content:p}:p; }

test('plain streamed text is emitted immediately while only possible think-tag prefixes are buffered',()=>{
  const { ThinkTagStreamFilter }=require('../dist/llm/reasoning');
  const filter=new ThinkTagStreamFilter(true);
  assert.deepEqual(filter.push('修'),{text:'修',reasoning:''});
  assert.deepEqual(filter.push('订'),{text:'订',reasoning:''});
  assert.deepEqual(filter.push('<thi'),{text:'',reasoning:''});
  assert.deepEqual(filter.push('nk>thought</thi'),{text:'',reasoning:'thought'});
  assert.deepEqual(filter.push('nk>正文'),{text:'正文',reasoning:''});
  assert.deepEqual(filter.flush(),{text:'',reasoning:''});
  const closing=new ThinkTagStreamFilter(true);
  assert.deepEqual(closing.push('</thi'),{text:'',reasoning:''});
  assert.deepEqual(closing.push('nk>{"literal":"<think>"}'),{text:'{"literal":"<think>"}',reasoning:''});
  const literal=new ThinkTagStreamFilter(true);
  assert.deepEqual(literal.push('body <thi'),{text:'body ',reasoning:''});
  assert.deepEqual(literal.flush(),{text:'<thi',reasoning:''});
});

test('installed SDK reads fragmented local SSE and preserves provider reasoning and termination metadata',async()=>{
  const http=require('node:http');const {ChatOpenAI}=require('@langchain/openai');
  const received=[];
  const server=http.createServer(async(req,res)=>{
    let body='';for await(const part of req)body+=part;received.push(JSON.parse(body));
    res.writeHead(200,{'Content-Type':'text/event-stream'});
    const events=[{id:'offline',choices:[{index:0,delta:{role:'assistant',reasoning_content:'思考草稿'},finish_reason:null}]},
      {id:'offline',choices:[{index:0,delta:{content:'{"text":"中文"}'},finish_reason:null}]},
      {id:'offline',choices:[{index:0,delta:{},finish_reason:'stop'}]}];
    const bytes=Buffer.from(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')+'data: [DONE]\n\n');
    for(let i=0;i<bytes.length;i+=5)res.write(bytes.subarray(i,i+5));res.end();
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const llm=new ChatOpenAI({apiKey:'offline-fixture',model:'fixture-model',maxTokens:128,temperature:0.2,maxRetries:0,
      __includeRawResponse:true,configuration:{baseURL:`http://127.0.0.1:${server.address().port}/v1`}});
    let reasoning='';const response=await collectLlmResponse(await llm.stream('offline fixture',{response_format:{type:'json_object'}}),{onReasoning:s=>reasoning+=s});
    assert.equal(response.rawContent,'{"text":"中文"}');assert.equal(reasoning,'思考草稿');assert.equal(response.response.finishReason,'stop');
    assert.equal(received.length,1);assert.equal(received[0].max_tokens,128);assert.equal(received[0].stream,true);assert.equal(received[0].response_format.type,'json_object');
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('strict extraction preserves literal fences, braces, escapes and top-level null',()=>{
  const json=JSON.stringify({text:'keep ```json``` and [x] {y} \\" literally'});
  assert.equal(extractCompleteJsonValue(json),json);
  assert.equal(extractCompleteJsonValue('```json\n'+json+'\n```'),json);
  assert.equal(extractCompleteJsonValue('null'),'null');
  assert.equal(extractCompleteJsonValue('[note] result: '+json),json);
  assert.throws(()=>extractCompleteJsonValue('{"items":[{"x":1'),/完整 JSON/);
  assert.throws(()=>extractCompleteJsonValue('{"a":1} {"a":2}'),/多个 JSON/);
  assert.throws(()=>extractCompleteJsonValue('{"a":]}'),/顺序错误/);
});

test('zero repair retains incomplete/malformed classification instead of null schema failure',async()=>{
  for(const raw of ['{"a":','{"items":[{"x":1']) {
    await assert.rejects(()=>parseStructuredLlmRawContentDetailed({rawContent:raw,schema:z.object({a:z.number()}),label:'offline',maxRepairAttempts:0}),e=>e.category==='incomplete_json'&&!e.message.includes('received null'));
  }
  await assert.rejects(()=>parseStructuredLlmRawContentDetailed({rawContent:'{"a":]}',schema:z.object({a:z.number()}),label:'offline',maxRepairAttempts:0}),e=>e.category==='malformed_json');
  await assert.rejects(()=>parseStructuredLlmRawContentDetailed({rawContent:'{"a":"x"}',schema:z.object({a:z.number()}),label:'offline',maxRepairAttempts:0}),e=>e.category==='schema_mismatch');
});

test('split thinking is excluded while literal think tags inside JSON remain data',async()=>{
  const r=await collectLlmResponse(chunks(['<thi','nk>{"draft":true}</th','ink>','{"text":"<think>literal</think>"}',{content:'',response_metadata:{finish_reason:'stop'}}]));
  assert.deepEqual(JSON.parse(r.rawContent),{text:'<think>literal</think>'});
  assert.equal(r.response.finishReason,'stop'); assert.ok(r.response.reasoningChars>0);
});

test('typed reasoning blocks and raw vendor reasoning do not become final JSON',async()=>{
  let thought='';
  const r=await collectLlmResponse(chunks([{content:[{type:'reasoning',reasoning:'private thought'},{type:'text',text:'{"a":1}'}],additional_kwargs:{__raw_response:{choices:[{delta:{reasoning_content:'vendor thought'}}]}}}]),{onReasoning:s=>thought+=s});
  assert.equal(r.rawContent,'{"a":1}'); assert.match(thought,/vendor thought/);
});

test('explicit length rejects even syntactically valid JSON without a repair request',async()=>{
  await assert.rejects(()=>collectLlmResponse(chunks(['{"a":1}',{content:'',response_metadata:{finish_reason:'length'}}])),e=>e instanceof ResponseTerminationError&&e.category==='incomplete_json'&&e.retryable===false&&e.response.finishReason==='length');
  await assert.rejects(()=>collectLlmResponse(chunks([{content:'',response_metadata:{finish_reason:'content_filter'}}])),e=>e.retryable===false);
});

test('stream capture emits only final text, preserves tail, and rejects interrupted stream',async()=>{
  const c=captureStreamOutput(chunks(['<think>draft</think>{"a":1}',{content:'',response_metadata:{finish_reason:'stop'}}]));
  let text='';for await(const p of c.stream)text+=p.content;
  assert.equal(text,'{"a":1}');assert.equal(await c.completedText,text);assert.equal((await c.completedResponse).finishReason,'stop');
  const bad=captureStreamOutput((async function*(){yield {content:'{"a":'};throw new Error('terminated');})());
  await assert.rejects(async()=>{for await(const p of bad.stream)void p;},/terminated/);
  await assert.rejects(bad.completedText,/terminated/);
});

test('complete input budget counts inline Unicode source, schema and output reserve',()=>{
  assert.ok(estimatePromptTokens('中文'.repeat(100))>=200);
  assert.throws(()=>assertPromptBudget('中'.repeat(70000),4096,'',{contextWindowTokens:65536,maxInputTokens:null,budgetSharing:'shared'}),e=>e.code==='LLM_INPUT_BUDGET_EXCEEDED');
  assert.throws(()=>assertPromptBudget('small',4096,'中'.repeat(70000),{contextWindowTokens:65536,maxInputTokens:null,budgetSharing:'shared'}),e=>e.code==='LLM_INPUT_BUDGET_EXCEEDED');
  assert.ok(assertPromptBudget('small',4096)>0);
  assert.ok(assertPromptBudget('中'.repeat(300000),262144)>300000); // unknown is not a fabricated 64K cap
  assert.ok(assertPromptBudget('中'.repeat(80000),131072,'',{contextWindowTokens:262144,maxInputTokens:null,budgetSharing:'shared'})>80000);
  assert.throws(()=>assertPromptBudget('中'.repeat(140000),131072,'',{contextWindowTokens:262144,maxInputTokens:null,budgetSharing:'shared'}),e=>e.code==='LLM_INPUT_BUDGET_EXCEEDED');
});

test('45 chapters are generated in bounded ordered batches and merged without missing items',async()=>{
  const calls=[];const result=await generateChapterBatches(45,async(offset,count,previous)=>{
    calls.push([offset,count]);assert.equal(previous.length,offset);
    return Array.from({length:count},(_,i)=>offset+i+1);
  });
  assert.deepEqual(calls.map(x=>x[1]),[8,8,8,8,8,5]);
  assert.deepEqual(result,Array.from({length:45},(_,i)=>i+1));
});

test('truncated batches split finitely, undersized output and permanent errors are not hidden',async()=>{
  let calls=0;const result=await generateChapterBatches(9,async(offset,count)=>{calls++;if(count>2)throw {category:'incomplete_json'};return Array.from({length:count},(_,i)=>offset+i);});
  assert.equal(result.length,9);assert.ok(calls<19);
  await assert.rejects(()=>generateChapterBatches(8,async()=>[]),/应返回/);
  let permanent=0;await assert.rejects(()=>generateChapterBatches(8,async()=>{permanent++;throw new Error('transport');}),/transport/);assert.equal(permanent,1);
});

test('full source segmentation preserves every character and all validated feature data',async()=>{
  const source='中文😀\n'.repeat(11000);const parts=splitExtractionSource(source);assert.equal(parts.join(''),source);assert.ok(parts.every(s=>s.length<=24000));
  let calls=0;const r=await extractSourceSegments({name:'offline',sourceText:source},async part=>{calls++;assert.ok(part.sourceText.length<=24000);return {summary:'summary',analysisMarkdown:'analysis',features:[{id:'same',group:'language',label:'label',description:'description',evidence:'evidence',importance:1,imitationValue:1,transferability:1,fingerprintRisk:0,keepRulePatch:{keep:'all'}}]};});
  assert.equal(r.features.length,calls);assert.equal(new Set(r.features.map(f=>f.id)).size,calls);assert.ok(r.features.every(f=>f.keepRulePatch.keep==='all'));
  let failedCalls=0;await assert.rejects(()=>extractSourceSegments({name:'offline',sourceText:source},async()=>{if(++failedCalls===2)throw new Error('failed segment');return {features:[]};}),/failed segment/);
});

test('repair keeps the complete source and manual output budget instead of discarding the middle',async()=>{
  const factory=require('../dist/llm/factory');const original=factory.getLLM;
  const raw='not JSON '+ 'x'.repeat(9000)+'MIDDLE-FIXTURE-MARKER'+'y'.repeat(9000);let observed='',maxTokens;
  factory.getLLM=async(provider,options)=>{maxTokens=options.maxTokens;return {stream:async(messages)=>{observed=messages.map(m=>m.content).join('\n');return chunks([{content:'{"a":"valid"}',response_metadata:{finish_reason:'stop'}}]);}}};
  try {
    const result=await parseStructuredLlmRawContentDetailed({rawContent:raw,schema:z.object({a:z.string()}),label:'offline-repair-complete-source',maxRepairAttempts:1,maxTokens:131072,strategy:'prompt_json',profile:require('../dist/llm/structuredOutput').resolveStructuredOutputProfile({provider:'fixture'})});
    assert.equal(result.repairUsed,true);assert.equal(maxTokens,131072);assert.ok(observed.includes(raw));assert.ok(observed.includes('MIDDLE-FIXTURE-MARKER'));
  }finally{factory.getLLM=original;}
});
