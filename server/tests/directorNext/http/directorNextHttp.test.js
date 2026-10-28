const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { once } = require("node:events");
const { mountDirectorNext } = require("../../../dist/modules/director/http");
const { errorHandler } = require("../../../dist/middleware/errorHandler");

async function withServer(deps, run) {
  const app = express();
  app.use(express.json());
  mountDirectorNext(app, deps);
  app.use(errorHandler);
  const server = app.listen(0);
  await once(server, "listening");
  try {
    return await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function deps(overrides = {}) {
  return {
    commandService: {
      execute: async () => ({ runId: "run-1", controlVersion: 0, commandId: "cmd-1", replayed: false }),
    },
    projectionService: {
      get: async () => ({ runId: "run-1", novelId: "novel-1", mode: "running", driver: "auto", headline: "正在推进创作", detail: null, progress: { done: 1, total: 4, source: "artifact_ledger" }, debts: { count: 0, chapterOrders: [] }, availableActions: [], sourceRoute: "/novels/novel-1/edit", sourceTrace: { controlStatus: "running", controlVersion: 0, pauseKind: null, planVersion: "p1" } }),
    },
    runRepository: {
      findActiveRunIdByNovel: async () => "run-1",
      listRunIds: async () => ["run-1"],
    },
    eventLog: { list: async () => [{ seq: 1, type: "run_opened", payload: {}, createdAt: new Date("2026-10-01T00:00:00.000Z") }] },
    ...overrides,
  };
}

test('resume accepts an explicit scoped budget grant and rejects invalid or weighted metrics',async()=>{
 const received=[];
 await withServer(deps({commandService:{execute:async command=>{received.push(command);return {runId:command.runId,controlVersion:3};}}}),async base=>{
  const body={type:'resume',runId:'run-1',expectedVersion:2,idempotencyKey:'grant',
   chapterBudget:{jobId:'job',chapterId:'c3',metric:'uncached_tokens_v1',tokenLimit:122000}};
  const post=value=>fetch(base+'/api/director-next/commands',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});
  assert.equal((await post(body)).status,202);
  assert.deepEqual(received,[body]);
  for(const change of [{tokenLimit:0},{tokenLimit:122000.5},{tokenLimit:10000001},{metric:'output_weight_2'},{chapterId:''}]){
   assert.equal((await post({...body,chapterBudget:{...body.chapterBudget,...change}})).status,400);
  }
  assert.equal(received.length,1);
 });
});

test('a remaining-chapters grant preserves its explicit boolean scope over HTTP',async()=>{
 const received=[];
 await withServer(deps({commandService:{execute:async command=>{received.push(command);return {runId:command.runId,controlVersion:3};}}}),async base=>{
  const body={type:'resume',runId:'run-1',expectedVersion:2,idempotencyKey:'remaining-grant',
   chapterBudget:{jobId:'job',chapterId:'c3',metric:'uncached_tokens_v1',tokenLimit:180000,applyToRemaining:true}};
  const post=value=>fetch(base+'/api/director-next/commands',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});
  assert.equal((await post(body)).status,202);
  assert.deepEqual(received,[body]);
  assert.equal((await post({...body,chapterBudget:{...body.chapterBudget,applyToRemaining:'true'}})).status,400);
 });
});

test('new run requests keep an explicit chapter budget and reject unusable values',async()=>{
 const received=[];
 await withServer(deps({commandService:{execute:async command=>{received.push(command);return {runId:'new',controlVersion:0};}}}),async base=>{
  const body={type:'open_run',novelId:'book',driver:'auto',stepIdsInScope:null,idempotencyKey:'custom-budget',
   launchInput:{storyInput:'故事',estimatedChapterCount:30,worldMode:'skip',targetMode:'opening',provider:'openai',model:'test',chapterTokenLimit:200000}};
  const post=value=>fetch(base+'/api/director-next/commands',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});
  assert.equal((await post(body)).status,202);
  assert.equal(received[0].launchInput.chapterTokenLimit,200000);
  for(const chapterTokenLimit of [0,16000,10000001,20000.5,'200000',null]) {
   assert.equal((await post({...body,launchInput:{...body.launchInput,chapterTokenLimit}})).status,400);
  }
  assert.equal(received.length,1);
 });
});

test('initial schedule fill is explicit, book-scoped and validates model selection without director commands',async()=>{
  const fills=[];
  await withServer(deps({fillInitialCharacterSchedule:async(novelId,input)=>{fills.push({novelId,input});return {updated:2,remaining:0};},
    commandService:{execute:async()=>{throw Error('fill must not start chapters');}},
  }),async base=>{
    const url=`${base}/api/director-next/novels/book%20one/character-appearances/initial-schedule`;
    assert.equal((await fetch(url)).status,404);
    const post=body=>fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await post({provider:'deepseek'})).status,400);
    assert.equal((await post({provider:'deepseek',model:'deepseek-flash',chapters:['foreign']})).status,400);
    const response=await post({provider:'deepseek',model:'deepseek-flash'});
    assert.equal(response.status,200);
    assert.deepEqual((await response.json()).data,{updated:2,remaining:0});
    assert.deepEqual(fills,[{novelId:'book one',input:{provider:'deepseek',model:'deepseek-flash'}}]);
  });
});

test("appearance reads preserve novel and character scope and cannot dispatch commands", async () => {
  await withServer(deps({readCharacterAppearances: async (novelId,characterId)=>({novelId,characterId,chapters:[]}),
    commandService: {execute:async()=>{throw Error('read must not generate');}},
  }),async base=>{
    const url = `${base}/api/director-next/novels/book%20one/characters/person%20two/appearances`;
    const response = await fetch(url);
    assert.equal(response.status,200);
    assert.deepEqual((await response.json()).data,{novelId:'book one',characterId:'person two',chapters:[]});
    assert.equal((await fetch(url,{method:'POST'})).status,404);
  });
});

test("cast timeline reads a whole book in one request and cannot dispatch commands", async () => {
  const calls = [];
  await withServer(deps({readNovelCharacterAppearances: async novelId=>{calls.push(novelId);return {novelId,chapters:[]};},
    commandService: {execute:async()=>{throw Error('read must not generate');}},
  }),async base=>{
    const url = `${base}/api/director-next/novels/book%20one/character-appearances`;
    const response = await fetch(url);
    assert.equal(response.status,200);
    assert.deepEqual((await response.json()).data,{novelId:'book one',chapters:[]});
    assert.deepEqual(calls,['book one']);
    assert.equal((await fetch(url,{method:'POST'})).status,404);
  });
});

test("ledger endpoint reads the requested book without entering director commands", async () => {
  await withServer(deps({
    readLedgers: async novelId => ({novelId, payoffs: [], resources: [], resourceEvents: [], pendingResources: [], warnings: []}),
    commandService: {execute: async () => {throw new Error('a read must not execute commands');}},
  }), async url => {
    const response = await fetch(`${url}/api/director-next/novels/book%20one/ledgers`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.novelId, 'book one');
    assert.equal((await fetch(`${url}/api/director-next/novels/book%20one/ledgers`, {method:'POST'})).status,404);
  });
});

test("candidate review endpoint rejects incomplete actions and passes only the scoped batch decision", async () => {
  const writes = [];
  await withServer(deps({readCharacterCandidates: async runId => ({runId, reviews: []}),
    resolveCharacterCandidates: async (runId, input) => writes.push({runId, input}),
  }), async base => {
    const url = `${base}/api/director-next/runs/run-1/character-candidates`;
    assert.equal((await (await fetch(url)).json()).data.runId, 'run-1');
    assert.equal(writes.length, 0);
    const post = body => fetch(url, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
    assert.equal((await post({decisions: []})).status, 400);
    const body = {reviewId: 'review', revision: 2, contentHash: 'saved', decisions: [{candidateId: 'c', action: 'create'}]};
    assert.equal((await post({...body, decisions: [{candidateId: 'c', action: 'auto'}]})).status, 400);
    assert.equal((await post(body)).status, 200);
    assert.deepEqual(writes, [{runId: 'run-1', input: body}]);
  });
});

test("command endpoint validates and returns immediately with the run projection key", async () => {
  await withServer(deps(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/director-next/commands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "resume", runId: "run-1", expectedVersion: 0, idempotencyKey: "resume-1" }),
    });
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { success: true, data: { runId: "run-1", controlVersion: 0 }, message: "创作命令已接收。" });
  });
});

test("revision commands retain human guidance and the chapter patch and reject malformed scenes before dispatch", async () => {
  const received = [];
  await withServer(deps({commandService: {execute: async command => {
    received.push(command);
    return {runId: command.runId, controlVersion: 3, commandId: 'revision', replayed: false};
  }}}), async base => {
    const post = body => fetch(`${base}/api/director-next/commands`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
    const command = {type: 'resolve_gate', runId: 'run-1', expectedVersion: 2, idempotencyKey: 'revise', decision: 'regenerate'};
    assert.equal((await post({...command, guidance: '  主角主动试探，保留结尾  '})).status, 202);
    assert.equal(received[0].guidance, '主角主动试探，保留结尾');
    const patch = {baseRevision: 'saved', taskSheet: '作者任务', targetWordCount: 2200, mustAvoid: '不揭底', sceneCards: JSON.stringify({scenes: [1,2,3].map(i => ({key: String(i), title: '标题', purpose: '目标', entryState: '入场', exitState: '离场', targetWordCount: 700}))})};
    assert.equal((await post({...command, decision: 'confirm_after_edit', chapterPlanEdit: patch})).status, 202);
    assert.deepEqual(received[1].chapterPlanEdit, patch);
    assert.equal((await post({...command, guidance: 'x'.repeat(6001)})).status, 400);
    assert.equal((await post({...command, decision: 'confirm_after_edit', chapterPlanEdit: {...patch, sceneCards: '[]'}})).status, 400);
    assert.equal((await post({...command, decision: 'confirm_after_edit', chapterPlanEdit: {...patch, targetWordCount: 1}})).status, 400);
    assert.equal(received.length, 2);
  });
});

test("current and detail reads use the source page route and never expose a task route", async () => {
  await withServer(deps(), async (baseUrl) => {
    const current = await fetch(`${baseUrl}/api/director-next/novels/novel-1/current`);
    const currentBody = await current.json();
    assert.equal(current.status, 200);
    assert.equal(currentBody.data.sourceRoute, "/novels/novel-1/edit");
    assert.equal(JSON.stringify(currentBody).includes("directorTaskId"), false);

    const detail = await fetch(`${baseUrl}/api/director-next/runs/run-1`);
    const detailBody = await detail.json();
    assert.equal(detail.status, 200);
    assert.equal(detailBody.data.timeline[0].seq, 1);
  });
});

test("history reads support needsAttention without mutating facts", async () => {
  let requested = null;
  await withServer(deps({ runRepository: { listRunIds: async (options) => { requested = options; return ["run-1"]; }, findActiveRunIdByNovel: async () => "run-1" } }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/director-next/runs?needsAttention=true&limit=10`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.length, 1);
  });
  assert.deepEqual(requested, { needsAttention: true, limit: 10 });
});

test("invalid commands return a validation error and never reach the command service", async () => {
  let calls = 0;
  await withServer(deps({ commandService: { execute: async () => { calls += 1; return null; } } }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/director-next/commands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "resume", runId: "", expectedVersion: -1, idempotencyKey: "" }),
    });
    assert.equal(response.status, 400);
  });
  assert.equal(calls, 0);
});

test("a novel with no active run displays its latest terminal record", async () => {
  let requested;
  await withServer(deps({ runRepository: {
    findActiveRunIdByNovel: async () => null,
    listRunIds: async (options) => { requested = options; return ["run-1"]; },
  } }), async (url) => {
    const response = await fetch(`${url}/api/director-next/novels/novel-1/current`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.novelId, "novel-1");
  });
  assert.deepEqual(requested, { novelId: "novel-1", limit: 1 });
});

test("read-only records expose labels and a stable novel route without commands", async () => {
  await withServer(deps(), async (url) => {
    const response = await fetch(`${url}/api/director-next/records?needsAttention=true`);
    const record = (await response.json()).data[0];
    assert.equal(record.directorRoute, "/lab/director/novel-1");
    assert.equal(record.statusLabel, "推进中");
    assert.equal(record.progressLabel, "1/4 个阶段完成");
    assert.equal(Object.hasOwn(record, "availableActions"), false);
    assert.equal(Object.hasOwn(record, "sourceTrace"), false);
  });
});

test("unreadable facts or plans remain read-only records without hiding healthy books or inventing progress", async () => {
  const {FactIntegrityError} = require('../../../dist/modules/director/domain');
  const {UnknownPlanVersionError} = require('../../../dist/modules/director/application');
  const saved = {contract: {runId: 'damaged', novelId: 'book/中文?x=1'},
    control: {status: 'paused', version: 4, pause: {kind: 'safety', reason: '保存结果需要检查'}}};
  const before = JSON.stringify(saved);
  const normal = deps().projectionService;
  for (const failure of [new FactIntegrityError('invalid persisted artifact'), new UnknownPlanVersionError('unavailable')]) {
   await withServer(deps({projectionService: {get: async id => {
    if (id === 'damaged') throw failure;
    return normal.get(id);
  }}, runRepository: {listRunIds: async () => ['damaged','run-1'],
    getContract: async id => id === 'damaged' ? saved.contract : null,
    getControl: async id => id === 'damaged' ? saved.control : null}}), async url => {
    const response = await fetch(`${url}/api/director-next/records?needsAttention=true`);
    assert.equal(response.status, 200);
    const records = (await response.json()).data;
    assert.equal(records.length, 2);
    const damaged = records[0];
    assert.equal(damaged.runId, 'damaged');
    assert.equal(damaged.statusLabel, '暂停中');
    assert.equal(damaged.detail, saved.control.pause.reason);
    assert.equal(damaged.progressLabel, '创作进度暂时无法读取');
    assert.equal(damaged.sourceRoute, `/lab/director/${encodeURIComponent(saved.contract.novelId)}`);
    assert.equal(damaged.directorRoute, damaged.sourceRoute);
    assert.equal(Object.hasOwn(damaged, 'availableActions'), false);
    assert.equal(Object.hasOwn(damaged, 'progress'), false);
    assert.equal(records[1].progressLabel, '1/4 个阶段完成');
   });
  }
  assert.equal(JSON.stringify(saved), before);
});

test("record diagnostics cannot invent a missing identity or hide unrelated failures", async () => {
  const {RecordProjection, UnknownPlanVersionError} = require('../../../dist/modules/director/application');
  const {FactIntegrityError} = require('../../../dist/modules/director/domain');
  for (const [failure, savedContract, savedControl, expectedReads] of [
    [new Error('invalid persisted artifact'), {novelId:'book'}, {status:'paused'}, 0],
    [new FactIntegrityError('bad'), null, {status:'paused'}, 2],
    [new UnknownPlanVersionError('missing'), {novelId:'book'}, null, 2],
    [new FactIntegrityError('bad'), {novelId:'book'}, {status:'invalid_status'}, 2],
    [new FactIntegrityError('bad'), {runId:'run',novelId:'book'}, {status:'constructor'}, 2],
    [new FactIntegrityError('bad'), {runId:'another',novelId:'book'}, {status:'paused'}, 2],
  ]) {
    let reads = 0;
    const service = new RecordProjection({projectionService: {get: async () => {throw failure;}},
      runRepository: {getContract: async () => {reads++; return savedContract;},
        getControl: async () => {reads++; return savedControl;}}});
    await assert.rejects(service.get('run'), error => error === failure);
    assert.equal(reads, expectedReads);
  }
});

test('runtime status reads saved control and failures without the broken production projection',async()=>{
 const saved={contract:{runId:'run-1',novelId:'novel-1'},control:{status:'paused',version:8,
  pause:{kind:'manual_recovery',reason:'execution_retry_budget_exhausted'}}};
 const before=JSON.stringify(saved);let projections=0,writes=0;
 await withServer(deps({projectionService:{get:async()=>{projections++;throw Error('production table missing');}},
  commandService:{execute:async()=>{writes++;}},runRepository:{findActiveRunIdByNovel:async()=> 'run-1',
   listRunIds:async()=>['run-1'],getContract:async()=>saved.contract,getControl:async()=>saved.control},
  eventLog:{list:async()=>[{seq:4,type:'execution_failure',payload:{stepId:'chapter_batch',message:'模型缺少明确的上下文窗口配置。'},createdAt:new Date('2026-10-26T01:29:15Z')}]}}),async base=>{
  const response=await fetch(base+'/api/director-next/novels/novel-1/runtime-status');
  assert.equal(response.status,200);const data=(await response.json()).data;
  assert.equal(data.runId,'run-1');assert.equal(data.status,'paused');assert.equal(data.controlVersion,8);
  assert.equal(data.pause.kind,'manual_recovery');assert.equal(data.lastFailure.stepId,'chapter_batch');
  assert.match(data.lastFailure.message,/上下文/);assert.equal(data.sourceRoute,'/lab/director/novel-1');
  assert.equal(Object.hasOwn(data,'availableActions'),false);assert.equal(Object.hasOwn(data,'contract'),false);
  assert.equal((await fetch(base+'/api/director-next/novels/novel-1/runtime-status',{method:'POST'})).status,404);
 });
 assert.equal(projections,0);assert.equal(writes,0);assert.equal(JSON.stringify(saved),before);
});

test('runtime status rejects a mismatched identity and hides unknown raw failure text',async()=>{
 const repository={findActiveRunIdByNovel:async()=> 'run-1',listRunIds:async()=>['run-1'],
  getContract:async()=>({runId:'run-1',novelId:'another'}),getControl:async()=>({status:'paused',version:1,pause:null})};
 await withServer(deps({runRepository:repository}),async base=>{
  assert.equal((await fetch(base+'/api/director-next/novels/novel-1/runtime-status')).status,404);
 });
 await withServer(deps({runRepository:{...repository,getContract:async()=>({runId:'run-1',novelId:'novel-1'})},
  eventLog:{list:async()=>[{seq:1,type:'execution_failure',payload:{message:'Invalid SQL C:/private/run.js api-key=secret'},createdAt:new Date()}]}}),async base=>{
  const response=await fetch(base+'/api/director-next/novels/novel-1/runtime-status');assert.equal(response.status,200);
  const text=JSON.stringify(await response.json());for(const part of ['Invalid SQL','C:/private','api-key=secret'])assert.ok(!text.includes(part));
 });
});

test('one failed record is explicit without blocking healthy records or inventing its identity',async()=>{
 const normal=deps().projectionService;
 await withServer(deps({runRepository:{listRunIds:async()=>['broken','run-1']},
  projectionService:{get:async id=>{if(id==='broken')throw Error('unavailable private SQL');return normal.get(id);}}}),async base=>{
  const response=await fetch(base+'/api/director-next/records');assert.equal(response.status,200);
  const body=await response.json();assert.equal(body.data.length,1);assert.equal(body.data[0].runId,'run-1');
  assert.equal(body.warnings.length,1);assert.equal(body.warnings[0].runId,'broken');
  assert.equal(Object.hasOwn(body.warnings[0],'novelId'),false);assert.ok(!JSON.stringify(body).includes('private SQL'));
 });
});

test('a known production projection outage is typed and keeps saved identity available in history',async()=>{
 const {DirectorProjectionUnavailableError}=require('../../../dist/modules/director/application');
 await withServer(deps({projectionService:{get:async()=>{throw new DirectorProjectionUnavailableError();}},
  runRepository:{listRunIds:async()=>['run-1'],findActiveRunIdByNovel:async()=> 'run-1',
   getContract:async()=>({runId:'run-1',novelId:'novel-1'}),getControl:async()=>({status:'paused'})}}),async base=>{
  const current=await fetch(base+'/api/director-next/novels/novel-1/current');assert.equal(current.status,503);
  assert.equal((await current.json()).code,'director_projection_unavailable');
  const records=await fetch(base+'/api/director-next/records');assert.equal(records.status,200);
  assert.equal((await records.json()).data[0].novelId,'novel-1');
 });
});
test('a completely unreadable history is explicit and never represented as an empty successful list',async()=>{
 await withServer(deps({projectionService:{get:async()=>{throw Error('private SQL');}}}),async base=>{
  const response=await fetch(base+'/api/director-next/records');assert.equal(response.status,503);
  const body=await response.json();assert.equal(body.success,false);assert.equal(body.warnings.length,1);
  assert.equal(body.code,'director_projection_unavailable');assert.ok(!JSON.stringify(body).includes('private SQL'));
 });
});
