const {test, before, after} = require("node:test");
const assert = require("node:assert/strict");
const {mkdtempSync} = require("node:fs");
const {tmpdir} = require("node:os");
const path = require("node:path");
const {once} = require("node:events");
const express = require("express");
const dir = mkdtempSync(path.join(tmpdir(), "outline-character-impact-"));
Object.assign(process.env, {DATABASE_URL: "file:" + path.join(dir, "pilot.db").split(path.sep).join("/"), AI_NOVEL_RUNTIME: "desktop", AI_NOVEL_APP_DATA_DIR: dir});
const {prisma} = require("../dist/db/prisma");
const {ensureRuntimeDatabaseReady} = require("../dist/db/runtimeMigrations");
const {errorHandler} = require("../dist/middleware/errorHandler");
const {createEmptyOutlineDocument} = require("@ai-novel/shared/types/outline");
const {OutlineRepository} = require("../dist/modules/planning/outline/infrastructure/OutlineRepository");
const {outlineProjectService} = require("../dist/modules/planning/outline");
const {characterImpactPrompt} = require("../dist/prompting/prompts/outline/characterImpact.prompt");
const runner = require("../dist/modules/planning/outline/application/outlineProposalStructuredCall");
const router = require("../dist/modules/planning/outline/http/outlineRoutes").default;
let http;
before(async () => {
  await ensureRuntimeDatabaseReady();
  const app = express();
  app.use(express.json());
  app.use("/api/outlines", router);
  app.use(errorHandler);
  http = app.listen(0, "127.0.0.1");
  await once(http, "listening");
});
after(async () => {await new Promise(resolve => http.close(resolve)); await prisma.$disconnect();});

async function fixture() {
  const d = createEmptyOutlineDocument("药铺疑云");
  d.volumes = [{nodeId:"v2", title:"逃城", order:0, planningDepth:"rough", summary:"师徒一起逃城",chapterNodeIds:["c12","c16"]}];
  d.chapters = ["交账","救师父"].map((title,i)=>({nodeId:i?"c16":"c12", title, order:i, volumeNodeId:"v2", summary:title, planningDepth:"rough", characterNodeIds:["shen"],payoffNodeIds:["ledger"]}));
  d.characters = ["沈禾","师父"].map((name,i)=>({nodeId:i?"teacher":"shen",name,motivation:"互相信任",appearanceNodeIds:["c12","c16"]}));
  d.payoffs = [{nodeId:"ledger",title:"账册",kind:"mystery",setupDescription:"交账",payoffDescription:"师父自白",setupChapterNodeIds:["c12"],payoffChapterNodeIds:[],relatedNodeIds:["shen"]}];
  const {project} = await new OutlineRepository(prisma).createImport("药铺疑云",d,"隔离测试");
  const request = {characterId:"shen",baseVersion:1,requestText:"提前起疑，但仍救师父。"};
  return {d,project,request};
}
const change = (nodeId,field,value,dependsOnNodeIds=[]) => ({nodeId,field,value,reason:"保留人物动机与揭晓顺序",risks:[],dependsOnNodeIds});
const sample = () => ({
  character:{changes:[change("shen","motivation","怀疑师父但记得救命之恩")],retained:[]},
  plot:{changes:[change("c12","summary","记下缺页编号",["shen"]),change("v2","summary","并肩逃城，各自查证")],retained:[{nodeId:"c16",reason:"救人符合报恩动机"}]},
  payoff:{changes:[change("c12","endingHook","谁撕掉了这页？"),change("ledger","payoffDescription","第三卷用底账与编号对证",["c12"])],retained:[]},
});
async function api(project, suffix, body, status=200) {
  const response = await fetch(`http://127.0.0.1:${http.address().port}/api/outlines/${project.id}/${suffix}`,
    body === undefined ? {} : {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const json = await response.json();
  assert.equal(response.status,status,JSON.stringify(json));
  return json.data;
}

const conversation = "character-impact/conversation";
const timeline = (project, characterId = "shen") => api(project, conversation + "?characterId=" + characterId);
async function settled(project, id, read = timeline) {
  for (let i = 0; i < 100; i++) {
    const turn = (await read(project)).find(item => item.id === id);
    if (turn && turn.status !== "running") return turn;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.fail("Conversation did not settle");
}

test("赵高初稿缺失时带回对话重写，经采纳保留人物说明和双向出场引用", async t => {
  const { project } = await outlineProjectService.create("全知者无力回天");
  const idea = "一个大学生穿越回秦朝，发现自己竟然是赵高。";
  const ending = "试了但没成，即使全知，依然无力回天。";
  const node = (clientRef, title, summary) => ({ clientRef, title, summary, reason: summary, sourceFragment: title });
  const draft = {
    storyFields: { title: "全知者无力回天", premise: idea, synopsis: ending, theme: "全知与无力", tone: "悲怆", endingDirection: ending },
    volumes: [node("v", "沙丘之后", "胡亥已立")],
    chapters: [{ ...node("c", "第一份诏书", "赵高与李斯面议诏书"), volumeRef: "v" }],
    characters: [
      { ...node("z", "赵高", "穿越成赵高的大学生，知道结局，仍试图改写诏书。"), role: "主角", appearanceRefs: ["c", "c"] },
      { ...node("l", "李斯", "诏书指向的丞相。"), role: "丞相", appearanceRefs: ["c"] },
      { ...node("h", "胡亥", "登基后猜疑群臣。"), role: "皇帝", appearanceRefs: ["v"] },
      { ...node("f", "扶苏", "开篇前身亡。"), role: "历史背景", appearanceRefs: [] },
    ], payoffs: [], facts: [],
  };
  const draftRequests = [];
  let failDraft = false;
  t.mock.method(runner, "runOutlineProposalStructuredCall", async ({ asset, promptInput }) => {
    let raw;
    if (asset.id === "outline.workbench_dialogue") {
      raw = promptInput.requestText === idea
        ? { replyText: ending, answer: { kind: "discussion" } }
        : { replyText: "我按这个方向起草。", answer: { kind: "initial_generation" } };
    } else {
      assert.equal(asset.id, "outline.initial_generate");
      draftRequests.push(promptInput);
      assert.equal(asset.repairPolicy.maxAttempts, 0);
      assert.deepEqual(promptInput.conversation.history[0], { author: idea, assistant: ending });
      assert.equal(promptInput.conversation.draftDirection, "我按这个方向起草。");
      assert.equal(promptInput.conversation.document.story.title, "全知者无力回天");
      if (failDraft) {
        raw = structuredClone(draft);
        raw.characters[0].appearanceRefs = ["l"]; // a character is not an appearance location
      } else raw = draft;
    }
    return { output: asset.outputSchema.parse(raw), meta: { invocation: { promptId: asset.id, promptVersion: asset.version } } };
  });
  const read = p => api(p, "conversation");
  async function send(requestText, parentResultId) {
    const { turnId } = await api(project, "conversation/turns", {
      requestId: require("node:crypto").randomUUID(), baseVersion: 1, requestText, parentResultId,
    });
    return settled(project, turnId, read);
  }
  assert.equal((await send(idea)).result, null);
  const turn = await send("直接开始吧");
  assert.equal(turn.status, "completed", turn.replyText);
  assert.equal(turn.result.status, "pending");
  assert.deepEqual(turn.result.draftSummary, { title: "全知者无力回天", volumeCount: 1, chapterCount: 1, characterCount: 4 });
  assert.equal(turn.result.adoptedVersion, undefined);
  failDraft = true;
  assert.equal((await send("保留这个人物阵容，再细化结局", turn.result.id)).status, "failed");
  assert.equal(draftRequests.length, 2);
  assert.equal(draftRequests[1].conversation.priorProposal.payload.characters[0].title, "赵高");
  assert.equal((await read(project))[1].result.status, "pending");
  assert.equal((await outlineProjectService.get(project.id)).currentVersion, 1);
  await api(project, `proposals/${turn.result.id}/apply`, {});
  const saved = await outlineProjectService.get(project.id);
  assert.equal(saved.currentVersion, 2);
  const { characters, chapters, volumes } = saved.document;
  assert.deepEqual(characters.map(p => [p.name, p.role, p.summary]), draft.characters.map(p => [p.title, p.role, p.summary]));
  assert.deepEqual(characters.map(p => p.appearanceNodeIds), [[chapters[0].nodeId], [chapters[0].nodeId], [volumes[0].nodeId], []]);
  assert.deepEqual(chapters[0].characterNodeIds, characters.slice(0, 2).map(p => p.nodeId));
});

test("whole-outline chat drafts, explains, revises, reopens and writes only on explicit acceptance", async t => {
  const {project} = await outlineProjectService.create("渡口");
  const inputs = [];
  const draft = title => ({ storyFields: {title, premise:"末班渡船遇上风暴", synopsis:"她自己作决定。", theme:"勇气", tone:"悬疑", endingDirection:"靠岸"},
    volumes: [{clientRef:"v", title:"渡河", summary:"起航", reason:"建立困境", sourceFragment:"渡船"}],
    chapters: [{clientRef:"c", volumeRef:"v", title:"末班船", summary:"启航", reason:"人物出场", sourceFragment:"末班"}],
    characters:[], facts:[], payoffs:[] });
  t.mock.method(runner, "runOutlineProposalStructuredCall", async ({asset, promptInput}) => {
    inputs.push(promptInput);
    assert.equal(asset.id, "outline.workbench_dialogue");
    const answers = [
      {kind:"discussion"}, {kind:"initial_generation", payload:draft("出航")}, {kind:"discussion"},
      {kind:"initial_generation", payload:draft("归航")}, {kind:"edit", payload:{operations:[{
        operationId:"tone", kind:"update_fields", nodeId:promptInput.document.story.nodeId, fields:{tone:"温和"},
        reason:"保留平静的结局", affectedNodeIds:[], dependsOn:[], risks:[],
      }]}},
    ];
    return { output:asset.outputSchema.parse({replyText:"先看主人公怎样选择。", answer:answers[inputs.length-1]}),
      meta:{invocation:{promptId:asset.id, promptVersion:asset.version}} };
  });
  const read = project => api(project, "conversation");
  async function send(requestText, parentResultId, baseVersion = 1) {
    const body = { requestId:require("node:crypto").randomUUID(), requestText, parentResultId, baseVersion };
    await api(project,"conversation/turns",body);
    const turn = await settled(project,body.requestId,read);
    assert.equal(turn.status,"completed",turn.replyText);
    await api(project,"conversation/turns",body);
    return turn;
  }
  assert.deepEqual(await read(project),[]);
  assert.equal((await send("先聊故事方向")).result,null);
  const first = await send("按渡船的方向列个初稿");
  assert.equal(inputs[1].history[0].author,"先聊故事方向");
  const originalId = first.result.id;
  assert.equal((await send("为什么让她出航？",originalId)).result,null);
  assert.equal((await read(project))[1].result.status,"pending");
  const revision = await send("结尾让她回家",originalId);
  assert.equal(inputs[3].priorProposal.payload.storyFields.title,"出航");
  assert.equal(inputs[3].history.at(-1).author,"为什么让她出航？");
  assert.deepEqual(await timeline(project),[]);
  assert.equal((await read(project))[1].result.status,"superseded");
  await api(project,`proposals/${originalId}/apply`,{},409);
  assert.equal((await outlineProjectService.get(project.id)).currentVersion,1);
  const applied = await api(project,`proposals/${revision.result.id}/apply`,{});
  assert.equal(applied.document.story.title,"归航");
  assert.equal(applied.document.chapters[0].volumeNodeId,applied.document.volumes[0].nodeId);
  const edit = await send("语气再温和一点",revision.result.id,2);
  assert.equal(inputs[4].priorProposal.status,"applied");
  assert.equal(inputs[4].document.story.title,"归航");
  await api(project,`proposals/${edit.result.id}/apply`,{operationIds:[]},400);
  assert.equal((await outlineProjectService.get(project.id)).currentVersion,2);
  await api(project,`proposals/${edit.result.id}/apply`,{operationIds:["tone"]});
  assert.equal((await outlineProjectService.get(project.id)).document.story.tone,"温和");
  const historical = await read(project);
  assert.equal(historical.find(t => t.result?.id === revision.result.id).result.adoptedVersion, 2);
  assert.equal(historical.find(t => t.result?.id === edit.result.id).result.adoptedVersion, 3);
  assert.equal(historical.find(t => t.result?.id === originalId).result.adoptedVersion, undefined);
  assert.deepEqual(JSON.parse((await api(project,`proposals/${edit.result.id}`)).proposalJson).appliedOperationIds,["tone"]);
  assert.equal(inputs.length,5);
});

test("SSE replays the current turn’s reasoning and reply, even when a large frame precedes the first reply token", {timeout:10000}, async t => {
  const {project} = await fixture();
  const {llmLiveBroker} = require("../dist/platform/llm/live/LlmLiveBroker");
  let announce, finish;
  const ready = new Promise(resolve => { announce = resolve; });
  const gate = new Promise(resolve => { finish = resolve; });
  const requestId = require("node:crypto").randomUUID();
  t.mock.method(runner, "runOutlineProposalStructuredCall", async ({asset,options}) => {
    const session = llmLiveBroker.begin({mode:"structured",label:"fixture",itemKey:options.itemKey,reasoningEnabled:false,promptText:"private prompt"});
    announce(session); await gate;
    session.complete();
    return {output:{replyText:"不妨让她在救人时暴露身份。",answer:{kind:"discussion"}},meta:{invocation:{promptId:asset.id,promptVersion:asset.version}}};
  });
  const url = `http://127.0.0.1:${http.address().port}/api/outlines/${project.id}/conversation/turns/${requestId}/stream`;
  async function connect() {
    const controller = new AbortController();
    const res = await fetch(url,{signal:controller.signal});
    assert.equal(res.status,200);
    assert.match(res.headers.get("content-type"),/text\/event-stream/);
    const reader = res.body.getReader(), decoder = new TextDecoder();
    let buffer = "";
    return {close:() => controller.abort(), read:async predicate => {
      for (;;) {
        const split = buffer.indexOf("\n\n");
        if (split < 0) {
          const chunk = await reader.read();
          assert.equal(chunk.done,false,"SSE closed before the expected frame");
          buffer += decoder.decode(chunk.value,{stream:true}); continue;
        }
        const line = buffer.slice(0,split); buffer = buffer.slice(split+2);
        if (!line.startsWith("data: ")) continue;
        const frame = JSON.parse(line.slice(6));
        assert.doesNotMatch(line,/private|replyText|operationId/);
        if (predicate(frame)) return frame;
      }
    }};
  }
  await api(project,"conversation/turns",{requestId,baseVersion:1,requestText:"先说说你的想法"});
  const session = await ready;
  let connection;
  try {
    assert.equal((await fetch(url.replace("/conversation/turns/","/character-impact/conversation/turns/")+"?characterId=shen")).status,404);
    connection = await connect();
    const thought = "先核对她在渡口的选择。".repeat(2600);
    session.reasoning(thought);
    const thinkingOnly = await connection.read(frame => frame.thinking?.[0]?.text);
    assert.equal(thinkingOnly.text, "");
    assert.equal(thinkingOnly.thinking[0].text, thought);
    assert.equal(thinkingOnly.thinking[0].enabled, false);
    session.delta('<think>{"replyText":"private thought"}</think>\n{"answer":{"kind":"discussion","replyText":"private nested"},"replyText":"不妨让她在救人时');
    const partial = await connection.read(frame => frame.text?.startsWith("不妨"));
    assert.equal(partial.done,false);
    assert.equal((await api(project,"conversation"))[0].status,"running");
    assert.equal((await outlineProjectService.get(project.id)).currentVersion,1);
    connection.close(); connection = await connect();
    assert.deepEqual(await connection.read(frame=>!!frame.text), partial);
    session.delta('暴露身份。"}'); session.phase("validating","核对结果");
    const preview = await connection.read(frame=>frame.text?.includes("暴露身份"));
    assert.equal(preview.text,"不妨让她在救人时暴露身份。");
    session.usage({promptTokens:40,completionTokens:500,totalTokens:540,reasoningTokens:408});
    finish(); await connection.read(frame=>frame.done);
    const [turn] = await api(project,"conversation");
    assert.equal(turn.status,"completed"); assert.equal(turn.replyText,preview.text); assert.equal(turn.result,null);
    assert.deepEqual(turn.thinking, [{...thinkingOnly.thinking[0], reasoningTokens:408}]);
  } finally { finish(); connection?.close(); }
});

test("OpenAI-compatible reasoning_content and reasoning_tokens reach a saved outline turn with thinking requested off", async t => {
  const {project} = await fixture();
  const factory = require("../dist/llm/factory");
  const upstream = express();
  const thought = "先确认渡船为何停航。";
  const answer = {replyText:"暴风雨迫使她停航。",answer:{kind:"discussion"}};
  upstream.post("/v1/chat/completions", (req,res) => {
    res.setHeader("Content-Type","text/event-stream");
    const chunk = (delta, finish_reason = null) => ({index:0,delta,finish_reason});
    const emit = (choices,usage) => res.write("data: " + JSON.stringify({id:"fixture",object:"chat.completion.chunk",
      model:"deepseek-v4-flash",created:1,choices,usage}) + "\n\n");
    emit([chunk({role:"assistant",reasoning_content:thought})]);
    emit([chunk({content:JSON.stringify(answer)})]);
    emit([chunk({},"stop")]);
    emit([], {prompt_tokens:16,completion_tokens:50,total_tokens:66,completion_tokens_details:{reasoning_tokens:32}});
    res.end("data: [DONE]\n\n");
  });
  const upstreamHttp = upstream.listen(0,"127.0.0.1");
  await once(upstreamHttp,"listening");
  t.after(() => new Promise(resolve => upstreamHttp.close(resolve)));
  const resolve = factory.resolveLLMClientOptions;
  t.mock.method(factory, "resolveLLMClientOptions", (_provider,options) => resolve("custom_fixture",{
    ...options, model:"deepseek-v4-flash",baseURL:`http://127.0.0.1:${upstreamHttp.address().port}/v1`,
    apiKey:"fixture",reasoningEnabled:false,timeoutMs:5000,
  }));
  const requestId = require("node:crypto").randomUUID();
  await api(project,"conversation/turns",{requestId,baseVersion:1,requestText:"渡船为何停航？"});
  const turn = await settled(project,requestId,project => api(project,"conversation"));
  assert.equal(turn.status,"completed",turn.replyText);
  assert.equal(turn.replyText,answer.replyText);
  assert.equal(turn.thinking[0].text,thought);
  assert.equal(turn.thinking[0].enabled,false);
  assert.equal(turn.thinking[0].reasoningTokens,32);
  assert.equal((await outlineProjectService.get(project.id)).currentVersion,1);
});


test("赵高初稿、李斯旧建议重审与第二章局部修改各自保留讨论，确认后逐项写入", async t => {
  const {project} = await outlineProjectService.create("沙丘故事");
  const seed = await outlineProjectService.get(project.id);
  await outlineProjectService.save(project.id, 1, {...seed.document, story: {...seed.document.story, premise:"沙丘诏书"}});
  const node = (clientRef, title) => ({clientRef, title, summary:title + "的故事", reason:"影响诏书", sourceFragment:title});
  const names = ["赵高", "李斯", "胡亥", "扶苏", "蒙恬"];
  const draft = {storyFields:{title:"赵高倒计时", premise:"诏书的去向", synopsis:"沙丘之后的抉择", theme:"秦法", tone:"悬疑", endingDirection:"诏书送达"},
    volumes:[node("v","沙丘")],chapters:[{...node("c","第二章《不发的诏书》"), volumeRef:"v"}],
    characters:names.map((name,i) => ({...node("p"+i,name), role:"参与者",appearanceRefs:["c"]})),payoffs:[],facts:[]};
  let personId, chapterId, chapterCalls = 0;
  t.mock.method(runner, "runOutlineProposalStructuredCall", async ({asset,promptInput}) => {
    if (asset.id === "outline.initial_generate") {
      assert.equal(promptInput.idea, "把赵高的故事写成倒计时。");
      return {output:asset.outputSchema.parse(draft),meta:{invocation:{promptId:asset.id,promptVersion:asset.version}}};
    }
    if (asset.id === "outline.chapter_review") {
      chapterCalls++;
      assert.equal(promptInput.chapter.nodeId, chapterId);
      assert.equal(promptInput.chapter.title, "第二章《不发的诏书》");
      assert.equal(promptInput.document.characters[1].goal, "依秦法保全家人goal");
      assert.equal(promptInput.baseVersion, 5);
      assert.deepEqual(promptInput.history, []);
      return {output:asset.outputSchema.parse({replyText:"请核对本章梗概和章末悬念。",changes:[
        {field:"summary",value:"李斯按住诏书，等赵高先开口。",reason:"延迟交付"},
        {field:"endingHook",value:"门外是谁？",reason:"留下悬念"},
      ]}),meta:{invocation:{promptId:asset.id,promptVersion:asset.version}}};
    }
    assert.equal(promptInput.snapshot.baseVersion, 4);
    assert.equal(promptInput.previousProposal.baseVersion, 3);
    assert.equal(promptInput.previousProposal.operations[0].fields.goal, "保护家人");
    assert.equal(promptInput.snapshot.document.characters[1].goal, "用秦法约束赵高");
    return {output:asset.outputSchema.parse({responseKind:"proposal",replyText:"请核对李斯的三处修改。",retained:[],
      changes:promptInput.role === "character" ? ["goal","motivation","conflict"].map(field => change(personId,field,"依秦法保全家人"+field)) : []})};
  });
  const start = await api(project,"conversation/turns",{requestId:"outline-draft-button",baseVersion:2,requestText:"把赵高的故事写成倒计时。",action:"generate_initial"});
  const first = await settled(project,start.turnId,p => api(p,"conversation"));
  assert.equal(first.result?.status,"pending",first.replyText);
  assert.equal((await api(project,"proposals"))[0].title,"赵高倒计时");
  const v3 = await api(project,`proposals/${first.result.id}/apply`,{operationIds:[]});
  assert.equal(v3.revision.version,3);
  assert.deepEqual(v3.document.characters.map(p => p.name),names);
  personId = v3.document.characters[1].nodeId;
  const request = {characterId:personId,baseVersion:3,requestText:"丰富一下李斯的目标和动机"};
  async function propose(goal) {
    const reviews = {character:{changes:[change(personId,"goal",goal)],retained:[]},plot:{changes:[],retained:[]},payoff:{changes:[],retained:[]}};
    return api(project,"character-impact/proposals",{...request,reviews},201);
  }
  const old = await propose("保护家人");
  const current = await propose("用秦法约束赵高");
  const v4 = await api(project,`proposals/${current.id}/apply`,{operationIds:[personId]});
  assert.equal(v4.revision.version,4);
  const pending = await api(project,"proposals");
  assert.deepEqual(pending.map(p => [p.id,p.baseVersion,p.characterId]), [[old.id,3,personId]]);
  await api(project,`proposals/${old.id}/apply`,{operationIds:[personId]},409);
  const rebased = await api(project,conversation+"/turns",{...request,baseVersion:4,priorProposalId:old.id,requestId:"li-rebase",requestText:"保留家人的牵挂"});
  const result = await settled(project,rebased.turnId,p => timeline(p,personId));
  assert.equal(result.result?.baseVersion,4,result.replyText);
  assert.equal(result.result.status,"pending");
  assert.equal((await outlineProjectService.get(project.id)).currentVersion,4);
  const v5 = await api(project,`proposals/${result.result.id}/apply`,{operationIds:[personId]});
  assert.equal(v5.revision.version,5);
  for (const key of ["goal","motivation","conflict"]) assert.equal(v5.document.characters[1][key],"依秦法保全家人"+key);
  assert.deepEqual(v5.document.characters.map(p => [p.summary,p.appearanceNodeIds]),v3.document.characters.map(p => [p.summary,p.appearanceNodeIds]));
  assert.deepEqual(v5.document.chapters[0].characterNodeIds,v3.document.chapters[0].characterNodeIds);
  chapterId = v5.document.chapters[0].nodeId;
  const chapterPath = `chapters/${chapterId}/conversation`;
  const readChapter = p => api(p, chapterPath);
  const beforeGlobal = await api(project, "conversation");
  const beforePerson = await timeline(project, personId);
  assert.deepEqual(await readChapter(project), []);
  const body = {requestId:"chapter-zhaogao",requestText:"让不发诏书的决定更明确",baseVersion:5};
  await api(project, chapterPath + "/turns", body);
  const chapterTurn = await settled(project, body.requestId, readChapter);
  assert.equal(chapterTurn.result?.status, "pending", chapterTurn.replyText);
  await api(project, chapterPath + "/turns", body);
  assert.equal(chapterCalls, 1);
  const id = chapterTurn.result.id;
  const listed = (await api(project, "proposals")).find(row => row.id === id);
  assert.equal(listed.chapterId, chapterId);
  assert.deepEqual(listed.targetNodeIds, [chapterId]);
  const wrong = { ...body, requestId:"wrong-scope", parentResultId:old.id };
  await api(project, chapterPath + "/turns", wrong);
  assert.equal((await settled(project, wrong.requestId, readChapter)).status, "failed");
  assert.equal(chapterCalls, 1);
  assert.equal((await outlineProjectService.get(project.id)).currentVersion, 5);
  await api(project, `proposals/${id}/apply`, {operationIds:[]}, 400);
  const v6 = await api(project, `proposals/${id}/apply`, {operationIds:["summary"]});
  assert.equal(v6.revision.version, 6);
  const expected = structuredClone(v5.document);
  expected.chapters[0].summary = "李斯按住诏书，等赵高先开口。";
  assert.deepEqual(v6.document, expected);
  assert.equal((await readChapter(project))[0].result.status, "partially_applied");
  assert.deepEqual(JSON.parse((await api(project, `proposals/${id}`)).proposalJson).appliedOperationIds, ["summary"]);
  assert.deepEqual((await api(project, "conversation")).map(row => row.id), beforeGlobal.map(row => row.id));
  assert.deepEqual((await timeline(project, personId)).map(row => row.id), beforePerson.map(row => row.id));
  assert.deepEqual((await api(project,"revisions")).map(r => r.version).sort(),[1,2,3,4,5,6]);
});

test("whole-outline conversation protects the saved revision and ignores a late reply after interruption", async t => {
  const {project} = await fixture();
  let started, release;
  const startedPromise = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  t.mock.method(runner, "runOutlineProposalStructuredCall", async ({asset}) => {
    started(); await gate;
    return {output:asset.outputSchema.parse({replyText:"她可以再迟一些出发。",answer:{kind:"edit",payload:{operations:[{
      operationId:"leave", kind:"update_fields", nodeId:"c12", fields:{summary:"稍后出发"}, affectedNodeIds:[], dependsOn:[], risks:[], reason:"留出抉择时间"
    }]}}}),meta:{invocation:{promptId:asset.id,promptVersion:asset.version}}};
  });
  const read = p => api(p,"conversation");
  const body = {requestId:require("node:crypto").randomUUID(),requestText:"推迟出发",baseVersion:1};
  await api(project,"conversation/turns",body);
  try {
    await startedPromise;
    assert.equal((await read(project))[0].status,"running");
    await api(project,"conversation/interrupt",{turnId:body.requestId});
  } finally { release(); }
  const stale = {...body,requestId:require("node:crypto").randomUUID(),baseVersion:2};
  await api(project,"conversation/turns",stale);
  assert.equal((await settled(project,stale.requestId,read)).status,"failed");
  assert.equal((await read(project))[0].status,"interrupted");
  assert.equal(await prisma.outlineProposal.count({where:{projectId:project.id,kind:"edit"}}),0);
  assert.equal((await outlineProjectService.get(project.id)).currentVersion,1);
});

test("stored conversation supports explanations, revising a proposal, reopening and explicit partial adoption", async t => {
  const {project, request} = await fixture();
  const seen = [];
  t.mock.method(runner, "runOutlineProposalStructuredCall", async ({asset, promptInput: input}) => {
    assert.equal(asset.version, "v4");
    seen.push(input);
    const review = sample()[input.role];
    if (input.snapshot.baseVersion > 1) {
      for (const change of review.changes) change.dependsOnNodeIds = change.dependsOnNodeIds.filter(id => id !== "shen");
    }
    return {output: asset.outputSchema.parse({...review, replyText: input.requestText + "：她仍然欠师父一条命。",
      responseKind: input.requestText === "为什么还要救师父？" ? "explanation" : "proposal"})};
  });
  const send = async (text, priorProposalId) => {
    const body = {...request, requestText:text, requestId: require("node:crypto").randomUUID(), priorProposalId};
    await api(project, conversation + "/turns", body);
    const turn = await settled(project, body.requestId);
    assert.equal(turn.status, "completed", turn.replyText);
    return {turn, body};
  };
  const first = await send("让沈禾提前起疑");
  const id = first.turn.result.id;
  const explain = await send("为什么还要救师父？", id);
  assert.equal(explain.turn.result, null);
  assert.match(explain.turn.replyText, /欠师父/);
  assert.equal((await timeline(project))[0].result.status, "pending");
  const revised = await send("保留救人的情节，真相留到第三卷", id);
  const lastInput = seen.at(-1);
  assert.equal(lastInput.previousProposal.operations.length, 4);
  assert.deepEqual(lastInput.conversationHistory.map(row => row.author), [first.body.requestText, explain.body.requestText]);
  assert.equal(revised.turn.parentResultId, id);
  await api(project, conversation + "/turns", revised.body);
  assert.equal(seen.length, 9);
  assert.equal((await timeline(project))[0].result.status, "superseded");
  assert.deepEqual(await timeline(project, "teacher"), []);
  assert.equal((await outlineProjectService.get(project.id)).currentVersion, 1);
  await api(project, `proposals/${id}/apply`, {operationIds:["shen"]},409);
  const resultId = revised.turn.result.id;
  await api(project, `proposals/${resultId}/apply`, {operationIds:["shen"]});
  const reopened = await timeline(project);
  assert.deepEqual(reopened.map(turn => turn.requestText), [first.body.requestText, explain.body.requestText, revised.body.requestText]);
  assert.equal(reopened.at(-1).result.status,"partially_applied");
  const detail = await api(project, `proposals/${resultId}`);
  assert.deepEqual(JSON.parse(detail.proposalJson).impact.appliedOperationIds, ["shen"]);
  const nextVersion = {...request, baseVersion:2, requestText:"按保存后的动机再看看伏笔", priorProposalId:resultId,requestId:require("node:crypto").randomUUID()};
  await api(project,conversation+"/turns",nextVersion);
  assert.equal((await settled(project,nextVersion.requestId)).result.baseVersion,2);
  assert.equal(seen.at(-1).snapshot.baseVersion,2);
  assert.equal(seen.at(-1).previousProposal.status,"partially_applied");
  assert.deepEqual(seen.at(-1).previousProposal.appliedOperationIds,["shen"]);
  assert.equal((await outlineProjectService.get(project.id)).currentVersion, 2);
});

test("character reviewers retain separate reasoning and stream only the combined author reply", async t => {
  const {project,request} = await fixture();
  const {agentReplyLive} = require("../dist/modules/agentConversation");
  const {llmLiveBroker} = require("../dist/platform/llm/live/LlmLiveBroker");
  let enter,release;
  const entered = new Promise(resolve => {enter=resolve;});
  const gate = new Promise(resolve => {release=resolve;});
  const requestId = require("node:crypto").randomUUID(), frames = [];
  t.mock.method(runner,"runOutlineProposalStructuredCall",async ({asset,promptInput,options}) => {
    if (promptInput.role === "character") {enter();await gate;}
    const replyText = promptInput.role === "payoff" ? "她仍然救师父。" : "内部审阅草稿";
    const session=llmLiveBroker.begin({mode:"structured",label:"fixture",itemKey:options.itemKey});
    if (promptInput.role === "plot") {
      session.usage({promptTokens:40,completionTokens:700,totalTokens:740,reasoningTokens:697});
    } else {
      session.reasoning("已核对 " + promptInput.role);
    }
    session.delta(JSON.stringify({replyText})); session.complete();
    return {output:asset.outputSchema.parse({...sample()[promptInput.role],replyText,responseKind:"proposal"})};
  });
  await api(project,conversation+"/turns",{...request,requestId});
  await entered;
  const unsubscribe=agentReplyLive.subscribe(requestId,frame=>frames.push(frame));
  try {
    release();
    const turn = await settled(project,requestId);
    assert.equal(turn.status,"completed");
    assert.deepEqual(turn.thinking.map(step => step.text), ["已核对 character", "", "已核对 payoff"]);
    assert.equal(turn.thinking[1].reasoningTokens, 697);
    assert.match(turn.thinking[1].stage, /相关卷章/);
    assert.deepEqual((await timeline(project))[0].thinking, turn.thinking);
    assert.ok(frames.some(frame=>frame.stage.includes("人物动机")));
    assert.ok(frames.some(frame=>frame.stage.includes("相关卷章")));
    assert.ok(frames.some(frame=>frame.text==="她仍然救师父。"));
    assert.ok(frames.every(frame=>!frame.text.includes("内部审阅草稿")));
    assert.equal(frames.at(-1).done,true);
  } finally {release();unsubscribe();}
});

test("a running conversation can be reopened and ended without a late proposal or duplicate generation", async t => {
  const {project,request} = await fixture();
  let finish, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { finish = resolve; });
  let calls = 0;
  t.mock.method(runner, "runOutlineProposalStructuredCall", async ({promptInput}) => {
    calls++; entered(); await gate;
    return {output:{...sample()[promptInput.role],replyText:"已核对",responseKind:"proposal"}};
  });
  const body = {...request, requestId: require("node:crypto").randomUUID()};
  try {
    await api(project, conversation + "/turns", body);
    await started;
    assert.equal((await timeline(project))[0].status, "running");
    await api(project, conversation + "/turns", body);
    await api(project, conversation + "/turns", {...body,requestId:"other-request"},409);
    await api(project, conversation + "/interrupt", {characterId:"teacher", turnId:body.requestId},409);
    await api(project, conversation + "/interrupt", {characterId:"shen", turnId:body.requestId});
    assert.equal((await timeline(project))[0].status,"interrupted");
  } finally { finish(); }
  await new Promise(resolve => setTimeout(resolve,100));
  assert.equal(calls,1);
  assert.equal(await prisma.outlineProposal.count({where:{projectId:project.id,kind:"character_impact"}}),0);
  assert.equal((await outlineProjectService.get(project.id)).currentVersion,1);
});

test("failed chat reply remains readable and a new request can continue on the same proposal", async t => {
  const {project,request} = await fixture();
  const original = await api(project,"character-impact/proposals",{...request,reviews:sample()},201);
  // Simulate a result written by an older application before character indexing existed.
  await prisma.outlineProposal.update({where:{id:original.id},data:{characterNodeId:null}});
  t.mock.method(runner,"runOutlineProposalStructuredCall",async () => {throw Error("模型暂时不可用");});
  const body = {...request,priorProposalId:original.id,requestId:require("node:crypto").randomUUID()};
  await api(project, conversation + "/turns", body);
  assert.equal((await settled(project, body.requestId)).status,"failed");
  assert.equal((await timeline(project)).find(row => row.result?.id === original.id).result.status,"pending");
  await api(project,`proposals/${original.id}/reject`,{});
  assert.equal((await timeline(project)).find(row => row.result?.id === original.id).result.status,"rejected");
});

test("审阅交接只传递各自新增的修改，重复的人物与卷章建议在同一份提案中各保留一次", async t => {
  const {project,request} = await fixture();
  const roles = [];
  t.mock.method(runner, "runOutlineProposalStructuredCall", async ({asset,promptInput}) => {
    assert.equal(asset.id,characterImpactPrompt.id);
    assert.equal(promptInput.snapshot.characterId,"shen");
    assert.equal(promptInput.snapshot.baseVersion,1);
    assert.deepEqual(Object.keys(promptInput.prior),roles);
    roles.push(promptInput.role);
    const review = sample()[promptInput.role];
    if (promptInput.role === "plot") review.changes.unshift(...promptInput.prior.character.changes);
    if (promptInput.role === "payoff") {
      assert.deepEqual(promptInput.prior.plot.changes, sample().plot.changes);
      review.changes.unshift(...promptInput.prior.character.changes, ...promptInput.prior.plot.changes);
    }
    return {output:asset.outputSchema.parse(review)};
  });
  const proposal = await api(project,"character-impact/generate",request,201);
  assert.deepEqual(roles,["character","plot","payoff"]);
  const payload = JSON.parse(proposal.proposalJson);
  assert.equal(payload.operations.length, 4);
  assert.equal(payload.operations.find(op => op.nodeId === "shen").reason, "人物 · 保留人物动机与揭晓顺序");
  assert.equal(payload.operations.filter(op=>op.nodeId==="c12").length,1);
  assert.equal(payload.impact.retained[0].nodeId,"c16");
  assert.equal((await outlineProjectService.get(project.id)).currentVersion,1);
  await api(project,`proposals/${proposal.id}/apply`,{operationIds:["ledger"]},400);
  await api(project,`proposals/${proposal.id}/apply`,{operationIds:[]},400);
  const result = await api(project,`proposals/${proposal.id}/apply`,{operationIds:["shen","c12","ledger"]});
  assert.equal(result.revision.version,2);
  assert.equal(result.document.volumes[0].summary,"师徒一起逃城");
  assert.equal(result.document.chapters[1].summary,"救师父");
  assert.equal(result.document.chapters[0].endingHook,"谁撕掉了这页？");
  assert.equal(result.document.payoffs[0].payoffDescription,"第三卷用底账与编号对证");
  const next = await api(project,"character-impact/context?characterId=shen&baseVersion=2");
  assert.deepEqual(next.recentCharacterChanges,[{field:"motivation",before:"互相信任",after:"怀疑师父但记得救命之恩"}]);
  await api(project,`proposals/${proposal.id}/apply`,{operationIds:["v2"]},409);
});

test("external reviewer reads context, submits once, and the workbench can discover and reject it", async () => {
  const {project,request} = await fixture();
  const selection = "?characterId=shen&baseVersion=1";
  const ctx = await api(project,"character-impact/context"+selection);
  assert.equal(ctx.document.characters[0].name,"沈禾");
  const input = {...request,reviews:sample()};
  const proposal = await api(project,"character-impact/proposals",input,201);
  assert.equal((await api(project,"character-impact/proposals",input,201)).id,proposal.id);
  assert.deepEqual((await api(project,"character-impact/proposals"+selection)).map(p=>p.id),[proposal.id]);
  assert.equal(JSON.parse(proposal.proposalJson).impact.origin,"external");
  await api(project,`proposals/${proposal.id}/reject`,{});
  assert.deepEqual(await api(project,"character-impact/proposals"+selection),[]);
  assert.equal((await outlineProjectService.get(project.id)).currentVersion,1);
});

test("scope, inconsistent reviews and outdated versions are rejected before an author can adopt", async () => {
  const {project,request,d} = await fixture();
  for (const invalid of [
    r => {r.character.changes[0].nodeId="teacher";},
    r => {r.plot.changes.push(...r.character.changes);},
    r => {r.plot.changes[0].field="nodeId";},
    r => {r.payoff.changes.push(change("c12","endingHook","另一种结尾"));},
    r => {r.payoff.changes[0].dependsOnNodeIds=["missing"];},
  ]) {
    const reviews=sample(); invalid(reviews);
    await api(project,"character-impact/proposals",{...request,reviews},400);
  }
  assert.equal(await prisma.outlineProposal.count({where:{projectId:project.id,kind:"character_impact"}}),0);
  const p=await api(project,"character-impact/proposals",{...request,reviews:sample()},201);
  await outlineProjectService.save(project.id,1,d);
  await api(project,"character-impact/proposals",{...request,reviews:sample()},409);
  await api(project,`proposals/${p.id}/apply`,{operationIds:["shen"]},409);
});

test("卷章审阅对人物字段另提新值或新增依赖仍判定越界", async t => {
  const {project, request} = await fixture();
  let echo;
  t.mock.method(runner, "runOutlineProposalStructuredCall", async ({promptInput}) => {
    const review = sample()[promptInput.role];
    if (promptInput.role === "plot") review.changes.push({...promptInput.prior.character.changes[0], ...echo});
    return {output: {...review, replyText: "核对修改。", responseKind: "proposal"}};
  });
  for (echo of [{value: "与人物审阅相反的动机"}, {dependsOnNodeIds: ["v2"]}]) {
    const requestId = require("node:crypto").randomUUID();
    await api(project, conversation + "/turns", {...request, requestId});
    const turn = await settled(project, requestId);
    assert.equal(turn.status, "failed");
    assert.match(turn.replyText, /卷章审阅.*范围/);
    assert.equal(turn.result, null);
  }
  assert.equal((await outlineProjectService.get(project.id)).currentVersion, 1);
});

test("a chapter written after review is protected at acceptance, independent edits remain available", async t => {
  const {project,request} = await fixture();
  const book = await prisma.novel.create({data:{title:"已绑定的药铺"}});
  const chapter = await prisma.chapter.create({data:{novelId:book.id,order:12,title:"交账"}});
  await prisma.outlineBookBinding.create({data:{id:project.id,projectId:project.id,revisionId:project.currentRevisionId,revisionVersion:1,sourceDocumentHash:"hash",novelId:book.id,requestKey:project.id,requestHash:"key",mappingJson:JSON.stringify({chapters:[{nodeId:"c12",chapterId:chapter.id,chapterOrder:12}]}),policyJson:"{}",postCreateStateJson:"{}"}});
  const proposal=await api(project,"character-impact/proposals",{...request,reviews:sample()},201);
  t.mock.method(runner, "runOutlineProposalStructuredCall", async ({asset}) => ({
    output:asset.outputSchema.parse({replyText:"推迟交账。",changes:[{field:"summary",value:"午后再交账",reason:"给沈禾时间辨认账册"}]}),
    meta:{invocation:{promptId:asset.id,promptVersion:asset.version}},
  }));
  const scope = "chapters/c12/conversation";
  const chapterRequest = {requestId:"before-writing",baseVersion:1,requestText:"推迟交账"};
  await api(project, scope + "/turns", chapterRequest);
  const local = await settled(project, chapterRequest.requestId, p => api(p, scope));
  assert.equal(local.result?.status, "pending", local.replyText);
  const other = "chapters/c16/conversation";
  await api(project, other + "/turns", {...chapterRequest, requestId:"wrong-chapter", parentResultId:local.result.id});
  assert.equal((await settled(project, "wrong-chapter", p => api(p, other))).status, "failed");
  await prisma.chapter.update({where:{id:chapter.id},data:{content:"作者保存的正文。"}});
  const ctx=await api(project,"character-impact/context?characterId=shen&baseVersion=1");
  assert.deepEqual(ctx.writtenChapterIds,["c12"]);
  await api(project, `proposals/${local.result.id}/apply`, {operationIds:["summary"]}, 409);
  await api(project, scope + "/turns", {...chapterRequest, requestId:"after-writing"});
  assert.equal((await settled(project, "after-writing", p => api(p, scope))).status, "failed");
  await api(project,`proposals/${proposal.id}/apply`,{operationIds:["shen","c12"]},409);
  await api(project,"character-impact/proposals",{...request,reviews:sample()},400);
  assert.equal((await outlineProjectService.get(project.id)).currentVersion,1);
  await api(project,`proposals/${proposal.id}/apply`,{operationIds:["shen"]});
  assert.equal((await prisma.chapter.findUniqueOrThrow({where:{id:chapter.id}})).content,"作者保存的正文。");
});

test("revision feedback reaches all reviewers and an in-flight change cannot publish an outdated suggestion", async t => {
  const {project,request,d} = await fixture();
  const first = await api(project,"character-impact/proposals",{...request,reviews:sample()},201);
  let changeVersion = false;
  const seen = [];
  t.mock.method(runner,"runOutlineProposalStructuredCall",async ({promptInput})=>{
    assert.equal(promptInput.previousProposal.requestText,request.requestText);
    assert.equal(promptInput.previousProposal.operations.length,4);
    seen.push(promptInput.role);
    if (changeVersion && promptInput.role === "payoff") await outlineProjectService.save(project.id,1,d);
    return {output:sample()[promptInput.role]};
  });
  const feedback = {...request,requestText:"保留师父亲口承认的安排。",priorProposalId:first.id};
  const next = await api(project,"character-impact/generate",feedback,201);
  assert.notEqual(next.id,first.id);
  assert.deepEqual(seen,["character","plot","payoff"]);
  await api(project,"character-impact/generate",{...feedback,characterId:"teacher"},409);
  changeVersion = true;
  await api(project,"character-impact/generate",feedback,409);
  assert.equal(await prisma.outlineProposal.count({where:{projectId:project.id,kind:"character_impact"}}),2);
});

test("a failed specialist leaves no partial proposal; retention alone never creates a revision",async t=>{
  const {project,request}=await fixture();
  t.mock.method(runner,"runOutlineProposalStructuredCall",async ({promptInput})=>{
    if(promptInput.role==="plot") throw Error("模拟规划中断");
    return {output:sample().character};
  });
  await api(project,"character-impact/generate",request,500);
  assert.equal(await prisma.outlineProposal.count({where:{projectId:project.id,kind:"character_impact"}}),0);
  const review={changes:[],retained:[{nodeId:"c16",reason:"救师父的动机成立"}]};
  const p=await api(project,"character-impact/proposals",{...request,reviews:{character:review,plot:review,payoff:review}},201);
  await api(project,`proposals/${p.id}/apply`,{operationIds:[]},400);
  await api(project,`proposals/${p.id}/reject`,{});
  assert.equal((await outlineProjectService.get(project.id)).currentVersion,1);
});
