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

test("three reviewers share one revision and produce one author-selectable atomic change", async t => {
  const {project,request} = await fixture();
  const roles = [];
  t.mock.method(runner, "runOutlineProposalStructuredCall", async ({asset,promptInput}) => {
    assert.equal(asset.id,characterImpactPrompt.id);
    assert.equal(promptInput.snapshot.characterId,"shen");
    assert.equal(promptInput.snapshot.baseVersion,1);
    assert.deepEqual(Object.keys(promptInput.prior),roles);
    roles.push(promptInput.role);
    return {output:asset.outputSchema.parse(sample()[promptInput.role])};
  });
  const proposal = await api(project,"character-impact/generate",request,201);
  assert.deepEqual(roles,["character","plot","payoff"]);
  const payload = JSON.parse(proposal.proposalJson);
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

test("a chapter written after review is protected at acceptance, independent edits remain available", async () => {
  const {project,request} = await fixture();
  const book = await prisma.novel.create({data:{title:"已绑定的药铺"}});
  const chapter = await prisma.chapter.create({data:{novelId:book.id,order:12,title:"交账"}});
  await prisma.outlineBookBinding.create({data:{id:project.id,projectId:project.id,revisionId:project.currentRevisionId,revisionVersion:1,sourceDocumentHash:"hash",novelId:book.id,requestKey:project.id,requestHash:"key",mappingJson:JSON.stringify({chapters:[{nodeId:"c12",chapterId:chapter.id,chapterOrder:12}]}),policyJson:"{}",postCreateStateJson:"{}"}});
  const proposal=await api(project,"character-impact/proposals",{...request,reviews:sample()},201);
  await prisma.chapter.update({where:{id:chapter.id},data:{content:"作者保存的正文。"}});
  const ctx=await api(project,"character-impact/context?characterId=shen&baseVersion=1");
  assert.deepEqual(ctx.writtenChapterIds,["c12"]);
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
